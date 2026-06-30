import type {
  VideoGenerationProvider,
  VideoGenerationInput,
  GenerationSubmission,
  GenerationStatusResult,
  ProviderConnectionStatus,
  ModelCapabilities,
} from "../types";
import { NotConfiguredError, ProviderConnectionError } from "../types";

interface ComfyUIConfig {
  baseUrl: string;
  workflowJson?: Record<string, unknown>;
  clientId?: string;
}

export class ComfyUIProvider implements VideoGenerationProvider {
  readonly id = "comfyui";
  readonly name = "ComfyUI (Local/Remote)";

  private config: ComfyUIConfig;

  constructor(config: ComfyUIConfig) {
    this.config = {
      ...config,
      clientId:
        config.clientId ||
        `ltx-studio-${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  async checkConnection(): Promise<ProviderConnectionStatus> {
    try {
      const res = await fetch(`${this.config.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { connected: false, reason: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { system?: { python_version?: string } };
      return {
        connected: true,
        serverVersion: data?.system?.python_version ?? "unknown",
      };
    } catch (err) {
      return {
        connected: false,
        reason: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  async getCapabilities(): Promise<ModelCapabilities[]> {
    return [
      {
        modelId: "ltxv-0.9",
        modelName: "LTX-Video 0.9 (ComfyUI)",
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        supportsFirstLastFrame: true,
        supportsAudio: true,
        maxDurationSeconds: 30,
        supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      },
    ];
  }

  async submitGeneration(
    input: VideoGenerationInput
  ): Promise<GenerationSubmission> {
    if (!this.config.workflowJson) {
      throw new NotConfiguredError(
        "ComfyUI workflow JSON is not configured. " +
          "Export an API-format workflow from ComfyUI and set it in provider config."
      );
    }

    const connectionStatus = await this.checkConnection();
    if (!connectionStatus.connected) {
      throw new ProviderConnectionError(
        `Cannot reach ComfyUI at ${this.config.baseUrl}: ${connectionStatus.reason}`
      );
    }

    const workflow = this._patchWorkflow(this.config.workflowJson, input);

    const res = await fetch(`${this.config.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: this.config.clientId,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderConnectionError(
        `ComfyUI /prompt returned ${res.status}: ${text}`
      );
    }

    const data = (await res.json()) as { prompt_id?: string };
    if (!data.prompt_id) {
      throw new ProviderConnectionError("ComfyUI returned no prompt_id");
    }

    return { providerJobId: data.prompt_id };
  }

  async getGenerationStatus(
    providerJobId: string
  ): Promise<GenerationStatusResult> {
    const historyRes = await fetch(
      `${this.config.baseUrl}/history/${providerJobId}`,
      { signal: AbortSignal.timeout(5000) }
    );

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
      {
        status?: { status_str?: string; completed?: boolean };
        outputs?: Record<string, { videos?: Array<{ filename: string; subfolder: string; type: string }> }>;
      }
    >;

    const entry = history[providerJobId];
    if (!entry) {
      return { providerJobId, status: "queued", progress: 0 };
    }

    const statusStr = entry.status?.status_str ?? "";
    const completed = entry.status?.completed ?? false;

    if (statusStr === "error") {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: "COMFYUI_ERROR",
      };
    }

    if (completed) {
      const outputUrl = this._extractOutputUrl(entry.outputs ?? {});
      return { providerJobId, status: "completed", progress: 100, outputUrl };
    }

    return { providerJobId, status: "processing", progress: 50 };
  }

  async cancelGeneration(providerJobId: string): Promise<void> {
    await fetch(`${this.config.baseUrl}/interrupt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.config.clientId }),
    }).catch(() => {});
    void providerJobId;
  }

  private _patchWorkflow(
    workflow: Record<string, unknown>,
    input: VideoGenerationInput
  ): Record<string, unknown> {
    const patched = JSON.parse(JSON.stringify(workflow)) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;

    for (const node of Object.values(patched)) {
      if (!node.inputs) continue;
      const inp = node.inputs;

      if ("text" in inp && typeof inp.text === "string" && input.prompt) {
        inp.text = input.prompt;
      }
      if ("seed" in inp && input.seed !== undefined) {
        inp.seed = input.seed;
      }
    }

    return patched as Record<string, unknown>;
  }

  private _extractOutputUrl(
    outputs: Record<
      string,
      { videos?: Array<{ filename: string; subfolder: string; type: string }> }
    >
  ): string | undefined {
    for (const node of Object.values(outputs)) {
      if (node.videos && node.videos.length > 0) {
        const v = node.videos[0];
        return `${this.config.baseUrl}/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder)}&type=${v.type}`;
      }
    }
    return undefined;
  }
}
