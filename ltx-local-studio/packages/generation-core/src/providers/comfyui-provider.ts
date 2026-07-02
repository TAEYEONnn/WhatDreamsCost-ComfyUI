import { randomUUID } from "crypto";
import type {
  VideoGenerationProvider,
  VideoGenerationInput,
  GenerationSubmission,
  GenerationStatusResult,
  ProviderConnectionStatus,
  ModelCapabilities,
} from "../types";
import { GenerationError, ProviderConnectionError } from "../types";
import { ComfyUIWsTracker } from "./comfyui-ws-tracker";
import type { WsFactory, StageTransition } from "./comfyui-ws-tracker";
import type { GenerationStage } from "@ltx-studio/shared-types";

// Post-sampling stages that are typically too brief for 1 s polling to catch.
const POST_SAMPLING_STAGES = new Set<GenerationStage>(["decoding", "encoding", "saving"]);

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
  /** Override the WebSocket factory (inject a mock in tests). */
  wsFactory?: WsFactory;
}

type WorkflowNode = { inputs?: Record<string, unknown> };
type WorkflowGraph = Record<string, WorkflowNode>;

/** A single file entry in a ComfyUI history node output. */
interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

/**
 * A single node's output in the history response.
 *
 * ComfyUI's SaveVideo serialises the result as `images` (not `videos`),
 * even for .mp4 files.  PreviewVideo / older nodes may use `videos`.
 * Both fields must be checked; the file extension determines whether it
 * is actually a video.
 */
interface ComfyNodeOutput {
  videos?: ComfyOutputFile[];
  images?: ComfyOutputFile[];
  animated?: boolean[];
}

type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean };
  outputs?: Record<string, ComfyNodeOutput>;
  execution_error?: {
    exception_message?: string;
    exception_type?: string;
  };
};

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv"]);

function hasVideoExtension(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return false;
  return VIDEO_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

/**
 * Returns the first file from `videos` or `images` that has a video
 * extension, or undefined if none is found.
 */
function pickVideoFile(node: ComfyNodeOutput): ComfyOutputFile | undefined {
  const candidates = [...(node.videos ?? []), ...(node.images ?? [])];
  return candidates.find((f) => hasVideoExtension(f.filename));
}

export class ComfyUIProvider implements VideoGenerationProvider {
  readonly id = "comfyui";
  readonly name = "ComfyUI (Local)";

  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly workflowJson: Record<string, unknown> | undefined;
  private readonly videoProxyPath: string;
  private readonly _tracker: ComfyUIWsTracker;

  constructor(config: ComfyUIConfig) {
    this.baseUrl = config.baseUrl;
    this.clientId =
      config.clientId ??
      `ltx-studio-${Math.random().toString(36).slice(2, 10)}`;
    this.workflowJson = config.workflowJson;
    this.videoProxyPath = config.videoProxyPath ?? "/api/comfyui-proxy/video";
    this._tracker = new ComfyUIWsTracker(
      this.baseUrl,
      this.clientId,
      config.wsFactory
    );
    this._tracker.start();
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

    const upload = await this._uploadImage(input.startFrameData);
    const workflow = this._patchWorkflow(this.workflowJson, input, upload.imageName);

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

    // Register the job with the tracker so WebSocket events are tracked from now on.
    this._tracker.registerJob(data.prompt_id);

    if (process.env.NODE_ENV === "development") {
      console.debug("[ComfyUI I2V] prompt submitted", {
        node78: upload.imageName,
        promptId: data.prompt_id,
      });
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
      // Job not yet dequeued — use WebSocket tracker state if available
      const ws = this._tracker.getProgress(providerJobId);
      const pendingStages = this._buildPendingStages(ws?.transitions);
      return {
        providerJobId,
        status: "queued",
        progress: ws?.progress ?? 8,
        stage: ws?.stage ?? "queued",
        ...(pendingStages.length ? { pendingStages } : {}),
      };
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
      this._tracker.markCompleted(providerJobId);
      const outputUrl = this._extractOutputUrl(entry.outputs ?? {});
      if (!outputUrl) {
        return {
          providerJobId,
          status: "failed",
          progress: 100,
          stage: "completed",
          errorCode: "OUTPUT_NOT_FOUND",
          errorMessage: KO.OUTPUT_NOT_FOUND,
        };
      }
      return { providerJobId, status: "completed", progress: 100, stage: "completed", outputUrl };
    }

    // In progress — prefer WebSocket tracker for real granularity
    const ws = this._tracker.getProgress(providerJobId);
    const pendingStages = this._buildPendingStages(ws?.transitions);
    return {
      providerJobId,
      status: "processing",
      progress: ws?.progress ?? 12,
      stage: ws?.stage ?? "preparing",
      ...(pendingStages.length ? { pendingStages } : {}),
    };
  }

  /** Extracts post-sampling stage transitions for the browser to display. */
  private _buildPendingStages(
    transitions: StageTransition[] | undefined
  ): Array<{ stage: GenerationStage; progress: number }> {
    if (!transitions) return [];
    return transitions
      .filter((t) => POST_SAMPLING_STAGES.has(t.stage))
      .map((t) => ({ stage: t.stage, progress: t.progress }));
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

  private async _uploadImage(
    startFrameData: string
  ): Promise<{ imageName: string; uploadFilename: string; responseName: string; subfolder: string }> {
    let blob: Blob;
    let ext: string;

    // MIME → file extension table (jpeg must map to jpg, not jpeg)
    const MIME_EXT: Record<string, string> = {
      "image/png":  "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };

    if (startFrameData.startsWith("data:")) {
      const commaIdx = startFrameData.indexOf(",");
      const header = startFrameData.slice(0, commaIdx);
      const base64 = startFrameData.slice(commaIdx + 1);
      const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
      ext = MIME_EXT[mime] ?? mime.split("/")[1] ?? "png";
      const bytes = Buffer.from(base64, "base64");
      blob = new Blob([bytes], { type: mime });
    } else {
      // Assume raw base64 PNG
      const bytes = Buffer.from(startFrameData, "base64");
      blob = new Blob([bytes], { type: "image/png" });
      ext = "png";
    }

    // Unique flat filename + explicit subfolder field.
    // ComfyUI applies os.path.basename() to the filename argument for security,
    // so embedding the subfolder in the filename would strip it.  Instead we
    // send subfolder as its own form field so ComfyUI creates the directory.
    const uploadFilename = `${randomUUID()}.${ext}`;
    const SUBFOLDER = "ltx-studio";

    const form = new FormData();
    form.append("image", blob, uploadFilename);
    form.append("type", "input");
    form.append("subfolder", SUBFOLDER);
    form.append("overwrite", "false"); // UUIDs are unique; never overwrite

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
    const { name, subfolder = "" } = uploadData;
    // Build the image path as ComfyUI's LoadImage node expects it.
    // When a subfolder is returned, the path is "subfolder/name".
    const imageName = subfolder ? `${subfolder}/${name}` : name;

    if (process.env.NODE_ENV === "development") {
      console.debug("[ComfyUI I2V] upload", {
        mimeType: blob.type,
        uploadName: uploadFilename,
        comfyName: name,
        subfolder,
        workflowImage: imageName,
      });
    }

    return { imageName, uploadFilename, responseName: name, subfolder };
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

    // Image conditioning strength — default 0.85, clamp to [0.6, 1.0].
    // ComfyUI computes: mask = 1.0 - strength, so 0.85 allows only 0.15 noise
    // on the start-frame latent, keeping the original composition intact.
    const rawStrength = (input.parameters?.i2vStrength as number | undefined) ?? 0.85;
    const i2vStrength = Math.max(0.6, Math.min(1.0, rawStrength));
    node(N.IMG_TO_VIDEO).strength = i2vStrength;

    if (process.env.NODE_ENV === "development") {
      console.debug("[ComfyUI I2V] node77Strength", i2vStrength);
    }

    // Node 78 — LoadImage: uploaded filename (never fall back to workflow default)
    node(N.LOAD_IMAGE).image = imageName;

    // Verify node 77 is wired to node 78 — safety check against workflow drift
    const n77 = patched[N.IMG_TO_VIDEO]?.inputs as Record<string, unknown> | undefined;
    const imageLink = n77?.image;
    const isWired =
      Array.isArray(imageLink) &&
      imageLink[0] === N.LOAD_IMAGE &&
      imageLink[1] === 0;
    if (!isWired) {
      throw new GenerationError(
        "ComfyUI Workflow에 시작 이미지가 적용되지 않았습니다.",
        "WORKFLOW_IMAGE_NOT_WIRED"
      );
    }

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
    outputs: Record<string, ComfyNodeOutput>
  ): string | undefined {
    // Check SaveVideo node (81) first — preferred output
    const saveNode = outputs[N.SAVE_VIDEO];
    if (saveNode) {
      const file = pickVideoFile(saveNode);
      if (file) return this._buildProxyUrl(file);
    }

    // Fallback: search all output nodes for any video file.
    // ComfyUI SaveVideo puts .mp4 results in `images`, not `videos`,
    // so we check both fields via pickVideoFile.
    for (const node of Object.values(outputs)) {
      const file = pickVideoFile(node);
      if (file) return this._buildProxyUrl(file);
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
