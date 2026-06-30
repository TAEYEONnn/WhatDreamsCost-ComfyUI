import type {
  VideoGenerationProvider,
  VideoGenerationInput,
  GenerationSubmission,
  GenerationStatusResult,
  ProviderConnectionStatus,
  ModelCapabilities,
} from "../types";

interface MockJobState {
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  startedAt: number;
  failureRate: number;
}

const MOCK_SAMPLE_OUTPUT = "/mock/sample-video.mp4";

export class MockVideoProvider implements VideoGenerationProvider {
  readonly id = "mock";
  readonly name = "Mock Provider (Development)";

  private jobs = new Map<string, MockJobState>();
  private failureRate: number;
  private processingDurationMs: number;
  private shouldFail: boolean;

  constructor(
    options: {
      failureRate?: number;
      processingDurationMs?: number;
      shouldFail?: boolean;
    } = {}
  ) {
    this.failureRate = options.failureRate ?? 0.1;
    this.processingDurationMs = options.processingDurationMs ?? 4000;
    this.shouldFail = options.shouldFail ?? false;
  }

  async checkConnection(): Promise<ProviderConnectionStatus> {
    return { connected: true, latencyMs: 1, serverVersion: "mock-1.0.0" };
  }

  async getCapabilities(): Promise<ModelCapabilities[]> {
    return [
      {
        modelId: "mock-ltxv-0.9",
        modelName: "Mock LTX-Video 0.9 (Development)",
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        supportsFirstLastFrame: true,
        supportsAudio: false,
        maxDurationSeconds: 30,
        supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      },
    ];
  }

  async submitGeneration(
    input: VideoGenerationInput
  ): Promise<GenerationSubmission> {
    const providerJobId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.jobs.set(providerJobId, {
      status: "queued",
      progress: 0,
      startedAt: Date.now(),
      failureRate: this.failureRate,
    });
    void input;
    return { providerJobId, estimatedDurationMs: this.processingDurationMs };
  }

  async getGenerationStatus(
    providerJobId: string
  ): Promise<GenerationStatusResult> {
    const job = this.jobs.get(providerJobId);
    if (!job) {
      return {
        providerJobId,
        status: "failed",
        progress: 0,
        errorCode: "JOB_NOT_FOUND",
        errorMessage: "Mock job not found",
      };
    }

    const elapsed = Date.now() - job.startedAt;
    const totalMs = this.processingDurationMs;

    if (job.status === "cancelled") {
      return { providerJobId, status: "cancelled", progress: job.progress };
    }

    if (job.status === "completed") {
      return {
        providerJobId,
        status: "completed",
        progress: 100,
        outputUrl: MOCK_SAMPLE_OUTPUT,
      };
    }

    if (job.status === "failed") {
      return {
        providerJobId,
        status: "failed",
        progress: job.progress,
        errorCode: "MOCK_FAILURE",
        errorMessage: "Simulated generation failure",
      };
    }

    // Queued → processing transition at 500ms
    if (elapsed > 500 && job.status === "queued") {
      job.status = "processing";
    }

    if (job.status === "processing") {
      const rawProgress = Math.min(100, (elapsed / totalMs) * 100);
      job.progress = Math.floor(rawProgress);

      // Deterministic or random failure
      if (job.progress > 20 && (this.shouldFail || Math.random() < job.failureRate / 100)) {
        job.status = "failed";
        return {
          providerJobId,
          status: "failed",
          progress: job.progress,
          errorCode: "MOCK_RANDOM_FAILURE",
          errorMessage: "Simulated random generation failure",
        };
      }

      if (job.progress >= 100) {
        job.status = "completed";
        return {
          providerJobId,
          status: "completed",
          progress: 100,
          outputUrl: MOCK_SAMPLE_OUTPUT,
        };
      }

      return { providerJobId, status: "processing", progress: job.progress };
    }

    return { providerJobId, status: job.status, progress: job.progress };
  }

  async cancelGeneration(providerJobId: string): Promise<void> {
    const job = this.jobs.get(providerJobId);
    if (job && job.status !== "completed" && job.status !== "failed") {
      job.status = "cancelled";
    }
  }
}
