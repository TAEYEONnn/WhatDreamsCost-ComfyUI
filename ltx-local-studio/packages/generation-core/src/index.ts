export * from "./types";
export { MockVideoProvider } from "./providers/mock-provider";
export { ComfyUIProvider, durationToFrameLength } from "./providers/comfyui-provider";
export type { ComfyUIConfig } from "./providers/comfyui-provider";
export { NvidiaBuildProvider } from "./providers/nvidia-build-provider";
export { LtxWorkflowAdapter, ltxWorkflowAdapter } from "./adapters/ltx-workflow-adapter";
export { ComfyUIWorkflowAdapter, comfyUIWorkflowAdapter } from "./adapters/comfyui-workflow-adapter";

import { MockVideoProvider } from "./providers/mock-provider";
import { ComfyUIProvider } from "./providers/comfyui-provider";
import type { VideoGenerationProvider } from "./types";

/**
 * Returns the active provider based on environment config.
 * Pass workflowJson when using the ComfyUI provider so it has the workflow
 * loaded at startup rather than reading the filesystem itself.
 */
export function createDefaultProvider(options?: {
  workflowJson?: Record<string, unknown>;
}): VideoGenerationProvider {
  const defaultProvider =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_DEFAULT_PROVIDER ?? "mock")
      : "mock";

  if (defaultProvider === "comfyui") {
    const baseUrl =
      (typeof process !== "undefined" && process.env.COMFYUI_BASE_URL) ||
      "http://127.0.0.1:8188";
    return new ComfyUIProvider({
      baseUrl,
      workflowJson: options?.workflowJson,
    });
  }

  return new MockVideoProvider();
}
