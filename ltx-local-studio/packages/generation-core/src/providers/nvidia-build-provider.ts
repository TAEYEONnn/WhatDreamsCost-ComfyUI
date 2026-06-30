import type {
  VideoGenerationProvider,
  VideoGenerationInput,
  GenerationSubmission,
  GenerationStatusResult,
  ProviderConnectionStatus,
  ModelCapabilities,
} from "../types";
import { NotConfiguredError } from "../types";

interface NvidiaBuildConfig {
  apiKey: string;
  model?: string;
  apiBaseUrl?: string;
}

/**
 * Skeleton provider for NVIDIA Build API.
 * Implement fully once Windows GPU server + ComfyUI path is validated.
 */
export class NvidiaBuildProvider implements VideoGenerationProvider {
  readonly id = "nvidia-build";
  readonly name = "NVIDIA Build API";

  private config: NvidiaBuildConfig;

  constructor(config: NvidiaBuildConfig) {
    this.config = config;
  }

  private _requireConfig(): void {
    if (!this.config.apiKey) {
      throw new NotConfiguredError(
        "NVIDIA_API_KEY is not set. Configure it in .env.local to use the NVIDIA Build provider."
      );
    }
  }

  async checkConnection(): Promise<ProviderConnectionStatus> {
    if (!this.config.apiKey) {
      return { connected: false, reason: "NVIDIA_API_KEY not configured" };
    }
    return { connected: false, reason: "NVIDIA Build provider not yet implemented" };
  }

  async getCapabilities(): Promise<ModelCapabilities[]> {
    this._requireConfig();
    return [];
  }

  async submitGeneration(
    _input: VideoGenerationInput
  ): Promise<GenerationSubmission> {
    this._requireConfig();
    throw new NotConfiguredError("NVIDIA Build provider not yet implemented");
  }

  async getGenerationStatus(
    _providerJobId: string
  ): Promise<GenerationStatusResult> {
    this._requireConfig();
    throw new NotConfiguredError("NVIDIA Build provider not yet implemented");
  }
}
