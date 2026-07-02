import type { AspectRatio, GenerationStage } from "@ltx-studio/shared-types";

// ---------------------------------------------------------------------------
// Provider connection / capability types
// ---------------------------------------------------------------------------

export type ProviderConnectionStatus =
  | { connected: true; latencyMs?: number; serverVersion?: string }
  | { connected: false; reason: string };

export interface ModelCapabilities {
  modelId: string;
  modelName: string;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsFirstLastFrame: boolean;
  supportsAudio: boolean;
  maxDurationSeconds: number;
  supportedAspectRatios: AspectRatio[];
}

// ---------------------------------------------------------------------------
// Generation input / output types
// ---------------------------------------------------------------------------

export interface VideoGenerationInput {
  shotId: string;
  generationId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  seed?: number;
  startFrameData?: string; // base64 or URL
  endFrameData?: string;
  referenceImages?: string[];
  cameraPresetPromptModifier?: string;
  parameters?: Record<string, unknown>;
}

export interface GenerationSubmission {
  providerJobId: string;
  estimatedDurationMs?: number;
}

export interface GenerationStatusResult {
  providerJobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  stage?: GenerationStage;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  /**
   * Stage transitions the browser has not yet displayed.
   * Only includes post-sampling stages (decoding / encoding / saving).
   * The client deduplicates by stage name and shows each for a minimum duration.
   */
  pendingStages?: Array<{ stage: GenerationStage; progress: number }>;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface VideoGenerationProvider {
  id: string;
  name: string;
  checkConnection(): Promise<ProviderConnectionStatus>;
  getCapabilities(): Promise<ModelCapabilities[]>;
  submitGeneration(input: VideoGenerationInput): Promise<GenerationSubmission>;
  getGenerationStatus(providerJobId: string): Promise<GenerationStatusResult>;
  cancelGeneration?(providerJobId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

export class ProviderConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProviderConnectionError";
  }
}

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
