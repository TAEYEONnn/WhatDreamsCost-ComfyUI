import type { VideoGenerationInput } from "../types";
import { NotConfiguredError } from "../types";

/**
 * Generic ComfyUI workflow adapter.
 * Patches standard widget names found in most ComfyUI video workflows.
 * For LTX-specific patching see ltx-workflow-adapter.ts.
 */
export class ComfyUIWorkflowAdapter {
  private workflowJson: Record<string, unknown> | null = null;

  loadWorkflow(json: Record<string, unknown>): void {
    this.workflowJson = json;
  }

  patchWorkflow(input: VideoGenerationInput): Record<string, unknown> {
    if (!this.workflowJson) {
      throw new NotConfiguredError(
        "ComfyUI workflow JSON is not loaded. " +
          "Export a workflow in API format and call loadWorkflow() first."
      );
    }

    const patched = JSON.parse(
      JSON.stringify(this.workflowJson)
    ) as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

    const PROMPT_FIELDS = ["text", "global_prompt", "positive", "prompt"];
    const SEED_FIELDS = ["seed", "noise_seed"];

    for (const node of Object.values(patched)) {
      if (!node.inputs) continue;
      const inp = node.inputs;

      for (const field of PROMPT_FIELDS) {
        if (field in inp && typeof inp[field] === "string") {
          inp[field] = input.prompt;
          break;
        }
      }

      for (const field of SEED_FIELDS) {
        if (field in inp && input.seed !== undefined) {
          inp[field] = input.seed;
        }
      }

      if ("width" in inp || "height" in inp) {
        // Dimensions will be derived from aspect ratio downstream
      }
    }

    return patched as Record<string, unknown>;
  }
}

export const comfyUIWorkflowAdapter = new ComfyUIWorkflowAdapter();
