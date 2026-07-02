import type {
  VideoGenerationProvider,
  VideoGenerationInput,
  GenerationSubmission,
  GenerationStatusResult,
  ProviderConnectionStatus,
  ModelCapabilities,
} from "../types";
import { GenerationError, ProviderConnectionError } from "../types";

// ─── Node ID constants — must match ltxv-i2v-0.9.5.json ─────────────────────
const N = {
  POSITIVE_PROMPT: "6",
  NEGATIVE_PROMPT: "7",
  SAMPLER: "72",      // noise_seed, cfg
  SCHEDULER: "71",    // steps
  IMG_TO_VIDEO: "77", // width, height, length, strength
  LOAD_IMAGE: "78",   // image filename
  CONDITIONING: "69", // frame_rate (conditioning fps)
  CREATE_VIDEO: "80", // fps (output fps)
  SAVE_VIDEO: "81",   // filename_prefix
} as const;

// ─── Low-VRAM resolution presets ─────────────────────────────────────────────
const RESOLUTION_PRESETS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 768, height: 512 },
  "9:16": { width: 512, height: 768 },
  "1:1":  { width: 512, height: 512 },
  "4:3":  { width: 704, height: 512 },
  "3:4":  { width: 512, height: 704 },
};

// Validated workflow values — do not change without re-testing
const OUTPUT_FPS = 24;
const CONDITIONING_FPS = 25;

// ─── Korean error messages ────────────────────────────────────────────────────
const KO: Record<string, string> = {
  COMFYUI_SERVER_DOWN:
    "ComfyUI 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.",
  MODEL_NOT_FOUND:
    "모델 파일을 찾을 수 없습니다. ComfyUI models 폴더를 확인하세요.",
  IMAGE_REQUIRED:
    "이미지-투-비디오 요청에는 시작 이미지가 필요합니다.",
  WORKFLOW_VALIDATION_FAILED:
    "워크플로 검증에 실패했습니다. ComfyUI /prompt 응답을 확인하세요.",
  CUDA_OOM:
    "GPU 메모리가 부족합니다. 해상도나 프레임 수를 줄여보세요.",
  OUTPUT_NOT_FOUND:
    "생성이 완료되었지만 결과 영상 파일을 찾을 수 없습니다.",
};

function koError(code: keyof typeof KO): GenerationError {
  return new GenerationError(KO[code], code);
}

// ─── Public utility — exported for testing ────────────────────────────────────
/**
 * Converts duration in seconds to a frame count in the form 8n+1 (≥ 9).
 * Formula: Math.max(9, round((seconds * fps - 1) / 8) * 8 + 1)
 */
export function durationToFrameLength(
  durationSeconds: number,
  fps: number = OUTPUT_FPS
): number {
  return Math.max(9, Math.round((durationSeconds * fps - 1) / 8) * 8 + 1);
}

// ─── Provider config ─────────────────────────────────────────────────────────
export interface ComfyUIConfig {
  baseUrl: string;
  workflowJson?: Record<string, unknown>;
  clientId?: string;
  /** Next.js proxy route path that hides the ComfyUI origin from browsers. */
  videoProxyPath?: string;
}

type WorkflowNode = { inputs?: Record<string, unknown> };
type WorkflowGraph = Record<string, WorkflowNode>;

type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean };
  outputs?: Record<
    string,
    {
      videos?: Array<{ filename: string; subfolder: string; type: string }>;
    }
  >;
  execution_error?: {
    exception_message?: string;
    exception_type?: string;
  };
};

export class ComfyUIProvider implements VideoGenerationProvider {
  readonly id = "comfyui";
  readonly name = "ComfyUI (Local)";

  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly workflowJson: Record<string, unknown> | undefined;
  private readonly videoProxyPath: string;

  constructor(config: ComfyUIConfig) {
    this.baseUrl = config.baseUrl;
    this.clientId =
      config.clientId ??
      `ltx-studio-${Math.random().toString(36).slice(2, 10)}`;
    this.workflowJson = config.workflowJson;
    this.videoProxyPath = config.videoProxyPath ?? "/api/comfyui-proxy/video";
  }

  async checkConnection(): Promise<ProviderConnectionStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { connected: false, reason: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        system?: { python_version?: string };
      };
      return {
        connected: true,
        serverVersion: data?.system?.python_version ?? "unknown",
      };
    } catch (err) {
      return {
        connected: false,
        reason: err instanceof Error ? err.message : "연결 실패",
      };
    }
  }

  async getCapabilities(): Promise<ModelCapabilities[]> {
    return [
      {
        modelId: "ltxv-0.9.5",
        modelName: "LTX-Video 2B v0.9.5 (ComfyUI)",
        supportsTextToVideo: false,
        supportsImageToVideo: true,
        supportsFirstLastFrame: false,
        supportsAudio: false,
        maxDurationSeconds: 10,
        supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      },
    ];
  }

  async submitGeneration(
    input: VideoGenerationInput
  ): Promise<GenerationSubmission> {
    if (!this.workflowJson) {
      throw new GenerationError(
        "ComfyUI 워크플로 JSON이 설정되지 않았습니다.",
        "WORKFLOW_NOT_CONFIGURED"
      );
    }

    const conn = await this.checkConnection();
    if (!conn.connected) {
      throw new ProviderConnectionError(KO.COMFYUI_SERVER_DOWN);
    }

    // Reject blob: URLs — they are browser-local and cannot be read server-side
    if (input.startFrameData?.startsWith("blob:")) {
      throw new GenerationError(
        "첨부 이미지가 임시 브라우저 주소로 전달되었습니다. 이미지 데이터를 다시 변환해 주세요.",
        "BLOB_URL_NOT_SUPPORTED"
      );
    }

    if (!input.startFrameData) {
      throw koError("IMAGE_REQUIRED");
    }

    const imageName = await this._uploadImage(input.startFrameData);
    const workflow = this._patchWorkflow(this.workflowJson, input, imageName);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: workflow,
          client_id: this.clientId,
        }),
      });
    } catch (err) {
      throw new ProviderConnectionError(KO.COMFYUI_SERVER_DOWN, err);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 400 || text.includes("error") || text.includes("validation")) {
        throw koError("WORKFLOW_VALIDATION_FAILED");
      }
      throw new ProviderConnectionError(
        `ComfyUI /prompt HTTP ${res.status}: ${text}`
      );
    }

    const data = (await res.json()) as {
      prompt_id?: string;
      error?: unknown;
      node_errors?: Record<string, unknown>;
    };

    if (data.error ?? (data.node_errors && Object.keys(data.node_errors).length > 0)) {
      throw koError("WORKFLOW_VALIDATION_FAILED");
    }
    if (!data.prompt_id) {
      throw new ProviderConnectionError(
        "ComfyUI가 prompt_id를 반환하지 않았습니다."
      );
    }

    return { providerJobId: data.prompt_id };
  }

  async getGenerationStatus(
    providerJobId: string
  ): Promise<GenerationStatusResult> {
    let historyRes: Response;
    try {
      historyRes = await fetch(
        `${this.baseUrl}/history/${providerJobId}`,
        { signal: AbortSignal.timeout(5000) }
      );
    } catch {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: "COMFYUI_SERVER_DOWN",
        errorMessage: KO.COMFYUI_SERVER_DOWN,
      };
    }

    if (!historyRes.ok) {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: `HTTP_${historyRes.status}`,
      };
    }

    const history = (await historyRes.json()) as Record<
      string,
      HistoryEntry
    >;
    const entry = history[providerJobId];

    if (!entry) {
      return { providerJobId, status: "queued", progress: 0 };
    }

    if (entry.execution_error) {
      return this._mapExecutionError(providerJobId, entry.execution_error);
    }

    const statusStr = entry.status?.status_str ?? "";
    const completed = entry.status?.completed ?? false;

    if (statusStr === "error") {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: "COMFYUI_ERROR",
        errorMessage: "ComfyUI 실행 오류",
      };
    }

    if (completed) {
      const outputUrl = this._extractOutputUrl(entry.outputs ?? {});
      if (!outputUrl) {
        return {
          providerJobId,
          status: "failed",
          progress: 100,
          errorCode: "OUTPUT_NOT_FOUND",
          errorMessage: KO.OUTPUT_NOT_FOUND,
        };
      }
      return { providerJobId, status: "completed", progress: 100, outputUrl };
    }

    return { providerJobId, status: "processing", progress: 50 };
  }

  async cancelGeneration(providerJobId: string): Promise<void> {
    // Remove from queue first (no-op if already running)
    await fetch(`${this.baseUrl}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: [providerJobId] }),
    }).catch(() => {});

    // Interrupt active execution
    await fetch(`${this.baseUrl}/interrupt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.clientId }),
    }).catch(() => {});
  }

  // ─── Internal methods ─────────────────────────────────────────────────────

  private async _uploadImage(startFrameData: string): Promise<string> {
    let blob: Blob;
    let filename: string;

    if (startFrameData.startsWith("data:")) {
      const commaIdx = startFrameData.indexOf(",");
      const header = startFrameData.slice(0, commaIdx);
      const base64 = startFrameData.slice(commaIdx + 1);
      const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
      const ext = mime.split("/")[1] ?? "png";
      const bytes = Buffer.from(base64, "base64");
      blob = new Blob([bytes], { type: mime });
      filename = `ltx-upload.${ext}`;
    } else {
      // Assume raw base64 PNG
      const bytes = Buffer.from(startFrameData, "base64");
      blob = new Blob([bytes], { type: "image/png" });
      filename = "ltx-upload.png";
    }

    const form = new FormData();
    form.append("image", blob, filename);
    form.append("type", "input");
    form.append("overwrite", "true");

    let uploadRes: Response;
    try {
      uploadRes = await fetch(`${this.baseUrl}/upload/image`, {
        method: "POST",
        body: form,
      });
    } catch (err) {
      throw new ProviderConnectionError(KO.COMFYUI_SERVER_DOWN, err);
    }

    if (!uploadRes.ok) {
      throw new GenerationError(
        `이미지 업로드 실패 (HTTP ${uploadRes.status})`,
        "IMAGE_UPLOAD_FAILED"
      );
    }

    const uploadData = (await uploadRes.json()) as {
      name: string;
      subfolder?: string;
    };
    const { name, subfolder } = uploadData;
    return subfolder ? `${subfolder}/${name}` : name;
  }

  /** Exposed without `private` so unit tests can call it directly. */
  _patchWorkflow(
    workflow: Record<string, unknown>,
    input: VideoGenerationInput,
    imageName: string
  ): WorkflowGraph {
    const patched = JSON.parse(JSON.stringify(workflow)) as WorkflowGraph;

    const node = (id: string): Record<string, unknown> => {
      const n = patched[id];
      if (!n?.inputs) throw new Error(`Node ${id} missing from workflow`);
      return n.inputs;
    };

    // Node 6 — Positive Prompt
    node(N.POSITIVE_PROMPT).text = input.prompt;

    // Node 7 — Negative Prompt (explicit node, will not overwrite node 6)
    if (input.negativePrompt !== undefined) {
      node(N.NEGATIVE_PROMPT).text = input.negativePrompt;
    }

    // Node 72 — Sampler: noise_seed (not "seed")
    if (input.seed !== undefined) {
      node(N.SAMPLER).noise_seed = input.seed;
    }

    // Node 77 — ImgToVideo: resolution + frame length
    const resolution =
      RESOLUTION_PRESETS[input.aspectRatio] ?? RESOLUTION_PRESETS["16:9"];
    node(N.IMG_TO_VIDEO).width = resolution.width;
    node(N.IMG_TO_VIDEO).height = resolution.height;
    node(N.IMG_TO_VIDEO).length = durationToFrameLength(input.durationSeconds);

    const i2vStrength = input.parameters?.i2vStrength as number | undefined;
    if (i2vStrength !== undefined) {
      node(N.IMG_TO_VIDEO).strength = i2vStrength;
    }

    // Node 78 — LoadImage: uploaded filename
    node(N.LOAD_IMAGE).image = imageName;

    // Node 69 — Conditioning fps (preserve validated value)
    node(N.CONDITIONING).frame_rate = CONDITIONING_FPS;

    // Node 71 — Scheduler: steps override
    const steps = input.parameters?.steps as number | undefined;
    if (steps !== undefined) {
      node(N.SCHEDULER).steps = steps;
    }

    // Node 80 — CreateVideo: output fps
    node(N.CREATE_VIDEO).fps = OUTPUT_FPS;

    // Node 81 — SaveVideo: generationId-based unique prefix
    node(N.SAVE_VIDEO).filename_prefix = `video/ltx-studio/${input.generationId}`;

    return patched;
  }

  private _extractOutputUrl(
    outputs: Record<
      string,
      { videos?: Array<{ filename: string; subfolder: string; type: string }> }
    >
  ): string | undefined {
    // Look at SaveVideo node (81) first
    const saveNode = outputs[N.SAVE_VIDEO];
    if (saveNode?.videos?.length) {
      return this._buildProxyUrl(saveNode.videos[0]);
    }
    // Fallback: search all output nodes
    for (const node of Object.values(outputs)) {
      if (node.videos?.length) {
        return this._buildProxyUrl(node.videos[0]);
      }
    }
    return undefined;
  }

  private _buildProxyUrl(v: {
    filename: string;
    subfolder: string;
    type: string;
  }): string {
    const params = new URLSearchParams({
      filename: v.filename,
      subfolder: v.subfolder,
      type: v.type,
    });
    return `${this.videoProxyPath}?${params.toString()}`;
  }

  private _mapExecutionError(
    providerJobId: string,
    err: { exception_message?: string; exception_type?: string }
  ): GenerationStatusResult {
    const msg = (err.exception_message ?? "").toLowerCase();

    if (msg.includes("cuda out of memory") || msg.includes("out of memory")) {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: "CUDA_OOM",
        errorMessage: KO.CUDA_OOM,
      };
    }
    if (
      msg.includes("model_not_found") ||
      msg.includes("checkpoint not found") ||
      msg.includes("no such file")
    ) {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: "MODEL_NOT_FOUND",
        errorMessage: KO.MODEL_NOT_FOUND,
      };
    }
    return {
      providerJobId,
      status: "failed",
      progress: 0,
      errorCode: "COMFYUI_ERROR",
      errorMessage: err.exception_message ?? "알 수 없는 ComfyUI 오류",
    };
  }
}
