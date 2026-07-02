/**
 * Unit tests for ComfyUIProvider.
 *
 * These tests mock the global `fetch` so no real ComfyUI server is needed.
 * Integration tests that require a live server are intentionally excluded here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ComfyUIProvider, durationToFrameLength } from "../providers/comfyui-provider";
import type { VideoGenerationInput } from "../types";

// ─── Minimal workflow fixture matching ltxv-i2v-0.9.5.json node IDs ──────────
const WORKFLOW: Record<string, unknown> = {
  "6":  { inputs: { text: "default positive", clip: ["38", 0] }, class_type: "CLIPTextEncode" },
  "7":  { inputs: { text: "default negative", clip: ["38", 0] }, class_type: "CLIPTextEncode" },
  "8":  { inputs: { samples: ["72", 0], vae: ["44", 2] }, class_type: "VAEDecode" },
  "38": { inputs: { clip_name: "t5xxl_fp16.safetensors", type: "ltxv", device: "default" }, class_type: "CLIPLoader" },
  "44": { inputs: { ckpt_name: "ltx-video-2b-v0.9.5.safetensors" }, class_type: "CheckpointLoaderSimple" },
  "69": { inputs: { frame_rate: 25, positive: ["77", 0], negative: ["77", 1] }, class_type: "LTXVConditioning" },
  "71": { inputs: { steps: 30, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ["77", 2] }, class_type: "LTXVScheduler" },
  "72": {
    inputs: {
      add_noise: true, noise_seed: 9999, cfg: 3,
      model: ["44", 0], positive: ["69", 0], negative: ["69", 1],
      sampler: ["73", 0], sigmas: ["71", 0], latent_image: ["77", 2],
    },
    class_type: "SamplerCustom",
  },
  "73": { inputs: { sampler_name: "euler" }, class_type: "KSamplerSelect" },
  "77": {
    inputs: {
      width: 768, height: 512, length: 97, batch_size: 1, strength: 0.15,
      positive: ["6", 0], negative: ["7", 0], vae: ["44", 2], image: ["78", 0],
    },
    class_type: "LTXVImgToVideo",
  },
  "78": { inputs: { image: "example.png" }, class_type: "LoadImage" },
  "80": { inputs: { fps: 24, bit_depth: 8, images: ["8", 0] }, class_type: "CreateVideo" },
  "81": {
    inputs: { filename_prefix: "video/ComfyUI", format: "auto", codec: "auto", "video-preview": "", video: ["80", 0] },
    class_type: "SaveVideo",
  },
};

const BASE_INPUT: VideoGenerationInput = {
  shotId: "shot-1",
  generationId: "gen-abc123",
  modelId: "ltxv-0.9.5",
  prompt: "산 위의 일몰",
  negativePrompt: "저품질, 흐림",
  durationSeconds: 4,
  aspectRatio: "16:9",
  seed: 42,
  startFrameData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

type FetchMockOptions = {
  systemStats?: boolean;
  uploadResponse?: { name: string; subfolder?: string };
  promptResponse?: { prompt_id?: string; error?: unknown; node_errors?: Record<string, unknown> };
  historyResponse?: Record<string, unknown>;
};

function buildFetchMock(opts: FetchMockOptions) {
  return vi.fn().mockImplementation(async (url: string, reqInit?: RequestInit) => {
    const u = url as string;

    if (u.endsWith("/system_stats")) {
      if (opts.systemStats === false) {
        throw new Error("ECONNREFUSED");
      }
      return {
        ok: true,
        json: async () => ({ system: { python_version: "3.11.0" } }),
      };
    }

    if (u.includes("/upload/image")) {
      const uploadResp = opts.uploadResponse ?? { name: "ltx-upload.png", subfolder: "" };
      return {
        ok: true,
        json: async () => uploadResp,
      };
    }

    if (u.endsWith("/prompt")) {
      const resp = opts.promptResponse ?? { prompt_id: "prompt-xyz" };
      return {
        ok: true,
        json: async () => resp,
      };
    }

    if (u.includes("/history/")) {
      return {
        ok: true,
        json: async () => opts.historyResponse ?? {},
      };
    }

    if (u.endsWith("/queue") || u.endsWith("/interrupt")) {
      void reqInit;
      return { ok: true, json: async () => ({}) };
    }

    throw new Error(`Unexpected fetch URL in test: ${u}`);
  });
}

// ─── durationToFrameLength ────────────────────────────────────────────────────

describe("durationToFrameLength", () => {
  it("produces 8n+1 frames for typical durations", () => {
    // 4s * 24fps = 96 → (96-1)/8 = 11.875 → round 12 → 12*8+1 = 97
    expect(durationToFrameLength(4)).toBe(97);
    // 5s * 24fps = 120 → (120-1)/8 = 14.875 → round 15 → 15*8+1 = 121
    expect(durationToFrameLength(5)).toBe(121);
    // 1s * 24fps = 24 → (24-1)/8 = 2.875 → round 3 → 3*8+1 = 25
    expect(durationToFrameLength(1)).toBe(25);
  });

  it("returns minimum 9 frames for very short durations", () => {
    expect(durationToFrameLength(0.1)).toBe(9);
    expect(durationToFrameLength(0)).toBe(9);
  });

  it("result is always in the form 8n+1", () => {
    for (const seconds of [1, 2, 3, 4, 5, 7, 10]) {
      const frames = durationToFrameLength(seconds);
      expect((frames - 1) % 8).toBe(0);
    }
  });
});

// ─── _patchWorkflow ───────────────────────────────────────────────────────────

describe("ComfyUIProvider._patchWorkflow", () => {
  const provider = new ComfyUIProvider({
    baseUrl: "http://localhost:8188",
    workflowJson: WORKFLOW,
  });

  it("writes positive prompt to node 6, not node 7", () => {
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "test.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["6"].inputs.text).toBe("산 위의 일몰");
    expect(result["7"].inputs.text).not.toBe("산 위의 일몰");
  });

  it("writes negative prompt to node 7, not node 6", () => {
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "test.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["7"].inputs.text).toBe("저품질, 흐림");
    expect(result["6"].inputs.text).not.toBe("저품질, 흐림");
  });

  it("patches noise_seed on node 72, not a generic 'seed' field", () => {
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "test.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["72"].inputs.noise_seed).toBe(42);
    expect("seed" in result["72"].inputs).toBe(false);
  });

  it("converts durationSeconds to 8n+1 frame length on node 77", () => {
    // BASE_INPUT.durationSeconds = 4 → expect 97 frames
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "test.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["77"].inputs.length).toBe(97);
    expect((result["77"].inputs.length as number - 1) % 8).toBe(0);
  });

  it("sets uploaded image filename on node 78", () => {
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "subfolder/my-image.jpg") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["78"].inputs.image).toBe("subfolder/my-image.jpg");
  });

  it("sets filename_prefix to generationId-based path on node 81", () => {
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "test.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["81"].inputs.filename_prefix).toBe(`video/ltx-studio/${BASE_INPUT.generationId}`);
  });

  it("each call to patchWorkflow uses the provided generationId (uniqueness)", () => {
    const input1 = { ...BASE_INPUT, generationId: "gen-aaa" };
    const input2 = { ...BASE_INPUT, generationId: "gen-bbb" };
    const r1 = provider._patchWorkflow(WORKFLOW, input1, "img.png") as Record<string, { inputs: Record<string, unknown> }>;
    const r2 = provider._patchWorkflow(WORKFLOW, input2, "img.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(r1["81"].inputs.filename_prefix).toContain("gen-aaa");
    expect(r2["81"].inputs.filename_prefix).toContain("gen-bbb");
    expect(r1["81"].inputs.filename_prefix).not.toBe(r2["81"].inputs.filename_prefix);
  });

  it("keeps conditioning fps on node 69 at 25 and output fps on node 80 at 24", () => {
    const result = provider._patchWorkflow(WORKFLOW, BASE_INPUT, "test.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["69"].inputs.frame_rate).toBe(25);
    expect(result["80"].inputs.fps).toBe(24);
  });

  it("uses 768×512 for 16:9 aspect ratio", () => {
    const result = provider._patchWorkflow(WORKFLOW, { ...BASE_INPUT, aspectRatio: "16:9" }, "img.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["77"].inputs.width).toBe(768);
    expect(result["77"].inputs.height).toBe(512);
  });

  it("uses 512×768 for 9:16 aspect ratio", () => {
    const result = provider._patchWorkflow(WORKFLOW, { ...BASE_INPUT, aspectRatio: "9:16" }, "img.png") as Record<string, { inputs: Record<string, unknown> }>;
    expect(result["77"].inputs.width).toBe(512);
    expect(result["77"].inputs.height).toBe(768);
  });

  it("does not mutate the original workflow object", () => {
    const before = JSON.stringify(WORKFLOW);
    provider._patchWorkflow(WORKFLOW, BASE_INPUT, "img.png");
    expect(JSON.stringify(WORKFLOW)).toBe(before);
  });
});

// ─── submitGeneration ─────────────────────────────────────────────────────────

describe("ComfyUIProvider.submitGeneration", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns providerJobId from ComfyUI /prompt response", async () => {
    globalThis.fetch = buildFetchMock({ promptResponse: { prompt_id: "abc-999" } }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    const result = await provider.submitGeneration(BASE_INPUT);
    expect(result.providerJobId).toBe("abc-999");
  });

  it("throws IMAGE_REQUIRED when startFrameData is missing", async () => {
    globalThis.fetch = buildFetchMock({}) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await expect(
      provider.submitGeneration({ ...BASE_INPUT, startFrameData: undefined })
    ).rejects.toThrow("이미지-투-비디오 요청에는 시작 이미지가 필요합니다");
  });

  it("throws ProviderConnectionError when ComfyUI server is down", async () => {
    globalThis.fetch = buildFetchMock({ systemStats: false }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await expect(provider.submitGeneration(BASE_INPUT)).rejects.toThrow(
      "ComfyUI 서버에 연결할 수 없습니다"
    );
  });

  it("sends positive/negative prompts to correct nodes in the POST body", async () => {
    let capturedBody: Record<string, unknown> | undefined;

    globalThis.fetch = vi.fn().mockImplementation(
      async (url: string, opts?: RequestInit) => {
        const u = url as string;
        if (u.endsWith("/system_stats")) {
          return { ok: true, json: async () => ({ system: { python_version: "3.11" } }) };
        }
        if (u.includes("/upload/image")) {
          return { ok: true, json: async () => ({ name: "ltx-upload.png", subfolder: "" }) };
        }
        if (u.endsWith("/prompt")) {
          capturedBody = JSON.parse(opts!.body as string) as Record<string, unknown>;
          return { ok: true, json: async () => ({ prompt_id: "ok-123" }) };
        }
        throw new Error(`Unexpected: ${u}`);
      }
    ) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await provider.submitGeneration({
      ...BASE_INPUT,
      prompt: "POSITIVE_TEXT",
      negativePrompt: "NEGATIVE_TEXT",
    });

    const wf = capturedBody!.prompt as Record<string, { inputs: Record<string, unknown> }>;
    expect(wf["6"].inputs.text).toBe("POSITIVE_TEXT");
    expect(wf["7"].inputs.text).toBe("NEGATIVE_TEXT");
    expect(wf["6"].inputs.text).not.toBe("NEGATIVE_TEXT");
    expect(wf["7"].inputs.text).not.toBe("POSITIVE_TEXT");
  });

  it("combines subfolder and name for node 78 when subfolder is non-empty", async () => {
    let capturedBody: Record<string, unknown> | undefined;

    globalThis.fetch = vi.fn().mockImplementation(
      async (url: string, opts?: RequestInit) => {
        const u = url as string;
        if (u.endsWith("/system_stats")) {
          return { ok: true, json: async () => ({ system: {} }) };
        }
        if (u.includes("/upload/image")) {
          return { ok: true, json: async () => ({ name: "frame.png", subfolder: "uploads" }) };
        }
        if (u.endsWith("/prompt")) {
          capturedBody = JSON.parse(opts!.body as string) as Record<string, unknown>;
          return { ok: true, json: async () => ({ prompt_id: "ok" }) };
        }
        throw new Error(`Unexpected: ${u}`);
      }
    ) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await provider.submitGeneration(BASE_INPUT);

    const wf = capturedBody!.prompt as Record<string, { inputs: Record<string, unknown> }>;
    expect(wf["78"].inputs.image).toBe("uploads/frame.png");
  });

  it("throws BLOB_URL_NOT_SUPPORTED for blob: URLs", async () => {
    globalThis.fetch = buildFetchMock({}) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await expect(
      provider.submitGeneration({
        ...BASE_INPUT,
        startFrameData: "blob:http://localhost:3000/fake-uuid",
      })
    ).rejects.toThrow("임시 브라우저 주소");
  });

  it("throws WORKFLOW_VALIDATION_FAILED when /prompt returns node_errors", async () => {
    globalThis.fetch = buildFetchMock({
      promptResponse: {
        prompt_id: undefined,
        node_errors: { "77": { errors: ["invalid input"] } },
      },
    }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await expect(provider.submitGeneration(BASE_INPUT)).rejects.toThrow(
      "워크플로 검증에 실패했습니다"
    );
  });
});

// ─── getGenerationStatus ──────────────────────────────────────────────────────

describe("ComfyUIProvider.getGenerationStatus", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns queued when job is not in history yet", async () => {
    globalThis.fetch = buildFetchMock({ historyResponse: {} }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    const status = await provider.getGenerationStatus("missing-id");
    expect(status.status).toBe("queued");
    expect(status.progress).toBe(0);
  });

  it("extracts video URL from node 81 outputs on completion", async () => {
    const historyResponse = {
      "prompt-xyz": {
        status: { status_str: "success", completed: true },
        outputs: {
          "81": {
            videos: [
              { filename: "ltx-studio_gen-abc_00001.mp4", subfolder: "video/ltx-studio", type: "output" },
            ],
          },
        },
      },
    };

    globalThis.fetch = buildFetchMock({ historyResponse }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
      videoProxyPath: "/api/comfyui-proxy/video",
    });
    const status = await provider.getGenerationStatus("prompt-xyz");

    expect(status.status).toBe("completed");
    expect(status.progress).toBe(100);
    expect(status.outputUrl).toContain("/api/comfyui-proxy/video");
    expect(status.outputUrl).toContain("filename=ltx-studio_gen-abc_00001.mp4");
    expect(status.outputUrl).not.toContain("localhost:8188");
  });

  it("returns OUTPUT_NOT_FOUND when completed but no videos", async () => {
    const historyResponse = {
      "prompt-xyz": {
        status: { status_str: "success", completed: true },
        outputs: { "81": {} },
      },
    };

    globalThis.fetch = buildFetchMock({ historyResponse }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    const status = await provider.getGenerationStatus("prompt-xyz");

    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("OUTPUT_NOT_FOUND");
    expect(status.errorMessage).toContain("결과 영상 파일");
  });

  it("detects CUDA OOM from execution_error", async () => {
    const historyResponse = {
      "prompt-xyz": {
        execution_error: {
          exception_message: "CUDA out of memory. Tried to allocate ...",
          exception_type: "torch.cuda.OutOfMemoryError",
        },
      },
    };

    globalThis.fetch = buildFetchMock({ historyResponse }) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    const status = await provider.getGenerationStatus("prompt-xyz");

    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("CUDA_OOM");
    expect(status.errorMessage).toContain("GPU 메모리");
  });

  it("returns COMFYUI_SERVER_DOWN when fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    const status = await provider.getGenerationStatus("any-id");

    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("COMFYUI_SERVER_DOWN");
    expect(status.errorMessage).toContain("ComfyUI 서버");
  });
});

// ─── cancelGeneration ─────────────────────────────────────────────────────────

describe("ComfyUIProvider.cancelGeneration", () => {
  it("sends DELETE to /queue and POST to /interrupt with providerJobId", async () => {
    const calls: { url: string; body?: unknown }[] = [];

    globalThis.fetch = vi.fn().mockImplementation(
      async (url: string, opts?: RequestInit) => {
        calls.push({
          url: url as string,
          body: opts?.body ? JSON.parse(opts.body as string) : undefined,
        });
        return { ok: true, json: async () => ({}) };
      }
    ) as typeof fetch;

    const provider = new ComfyUIProvider({
      baseUrl: "http://localhost:8188",
      workflowJson: WORKFLOW,
    });
    await provider.cancelGeneration("job-to-cancel");

    const queueCall = calls.find((c) => c.url.endsWith("/queue"));
    const interruptCall = calls.find((c) => c.url.endsWith("/interrupt"));

    expect(queueCall).toBeDefined();
    expect((queueCall!.body as { delete: string[] }).delete).toContain("job-to-cancel");
    expect(interruptCall).toBeDefined();
  });
});
