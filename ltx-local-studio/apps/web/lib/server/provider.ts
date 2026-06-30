import { createDefaultProvider } from "@ltx-studio/generation-core";
import type { VideoGenerationProvider } from "@ltx-studio/generation-core";

let _provider: VideoGenerationProvider | null = null;

export function getServerProvider(): VideoGenerationProvider {
  if (!_provider) {
    _provider = createDefaultProvider();
  }
  return _provider;
}
