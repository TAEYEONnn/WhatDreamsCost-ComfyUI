import { createDefaultProvider } from "@ltx-studio/generation-core";
import type { VideoGenerationProvider } from "@ltx-studio/generation-core";
import workflowJson from "./workflows/ltxv-i2v-0.9.5.json";

// Use globalThis so the provider (and its WebSocket tracker) survives
// Next.js hot-reload in development. Without this, each module re-evaluation
// would create a new tracker and leave the old one's WS connection open.
declare global {
  var __ltx_server_provider__: VideoGenerationProvider | undefined;
}

export function getServerProvider(): VideoGenerationProvider {
  if (!globalThis.__ltx_server_provider__) {
    globalThis.__ltx_server_provider__ = createDefaultProvider({
      workflowJson: workflowJson as Record<string, unknown>,
    });
  }
  return globalThis.__ltx_server_provider__;
}
