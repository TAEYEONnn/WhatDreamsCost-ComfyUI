import { createDefaultProvider } from "@ltx-studio/generation-core";
import type { VideoGenerationProvider } from "@ltx-studio/generation-core";
import workflowJson from "./workflows/ltxv-i2v-0.9.5.json";

let _provider: VideoGenerationProvider | null = null;

export function getServerProvider(): VideoGenerationProvider {
  if (!_provider) {
    _provider = createDefaultProvider({
      workflowJson: workflowJson as Record<string, unknown>,
    });
  }
  return _provider;
}
