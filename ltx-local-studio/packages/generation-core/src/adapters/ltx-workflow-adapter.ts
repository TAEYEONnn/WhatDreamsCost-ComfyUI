import type { VideoGenerationInput } from "../types";
import { NotConfiguredError } from "../types";

/**
 * Converts a Local Video Studio Shot into inputs for an LTX-Video workflow.
 *
 * The actual workflow JSON must be loaded from
 * vendor/WhatDreamsCost-ComfyUI/example_workflows and exported
 * in ComfyUI's API format before this adapter can produce a full prompt.
 *
 * Until then, patchWorkflow() throws NotConfiguredError so the UI
 * shows a "Workflow setup required" state rather than silently failing.
 */
export class LtxWorkflowAdapter {
  private workflowJson: Record<string, unknown> | null = null;

  loadWorkflow(json: Record<string, unknown>): void {
    this.workflowJson = json;
  }

  patchWorkflow(input: VideoGenerationInput): Record<string, unknown> {
    if (!this.workflowJson) {
      throw new NotConfiguredError(
        "LTX workflow JSON is not loaded. " +
          "Export the LTX Director workflow from ComfyUI in API format, " +
          "then call loadWorkflow() with the parsed JSON."
      );
    }

    const patched = JSON.parse(
      JSON.stringify(this.workflowJson)
    ) as Record<string, { inputs?: Record<string, unknown> }>;

    for (const node of Object.values(patched)) {
      if (!node.inputs) continue;
      const inp = node.inputs;

      // Text-to-video prompt
      if ("global_prompt" in inp) inp.global_prompt = input.prompt;
      if ("text" in inp && typeof inp.text === "string") inp.text = input.prompt;

      // Seed
      if ("seed" in inp && input.seed !== undefined) inp.seed = input.seed;

      // Duration
      if ("duration_seconds" in inp)
        inp.duration_seconds = input.durationSeconds;
    }

    return patched as Record<string, unknown>;
  }
}

export const ltxWorkflowAdapter = new LtxWorkflowAdapter();
