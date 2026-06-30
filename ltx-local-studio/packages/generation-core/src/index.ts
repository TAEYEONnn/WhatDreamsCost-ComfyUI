export * from "./types";
export { MockVideoProvider } from "./providers/mock-provider";
export { ComfyUIProvider } from "./providers/comfyui-provider";
export { NvidiaBuildProvider } from "./providers/nvidia-build-provider";
export { LtxWorkflowAdapter, ltxWorkflowAdapter } from "./adapters/ltx-workflow-adapter";
export { ComfyUIWorkflowAdapter, comfyUIWorkflowAdapter } from "./adapters/comfyui-workflow-adapter";

import { MockVideoProvider } from "./providers/mock-provider";
import { ComfyUIProvider } from "./providers/comfyui-provider";
import type { VideoGenerationProvider } from "./types";

/**
 * Returns the active provider based on environment config.
 * Falls back to MockVideoProvider when no external server is reachable.
 */
export function createDefaultProvider(): VideoGenerationProvider {
  const defaultProvider =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_DEFAULT_PROVIDER ?? "mock")
      : "mock";

  if (defaultProvider === "comfyui") {
    const baseUrl =
      (typeof process !== "undefined" && process.env.COMFYUI_BASE_URL) ||
      "http://127.0.0.1:8188";
    return new ComfyUIProvider({ baseUrl });
  }

  return new MockVideoProvider();
}
