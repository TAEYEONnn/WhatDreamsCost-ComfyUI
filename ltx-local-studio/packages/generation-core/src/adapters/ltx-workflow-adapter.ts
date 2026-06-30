import type { VideoGenerationInput } from "../types";
import { NotConfiguredError } from "../types";
import type { WorkflowNodeMapping } from "./comfyui-workflow-adapter";

export type { WorkflowNodeMapping };

/**
 * LTX-Video specific ComfyUI workflow adapter.
 * Uses explicit WorkflowNodeMapping rather than scanning for field names.
 *
 * The workflow JSON must be loaded in ComfyUI API format before patchWorkflow()
 * can be called. Until then it throws NotConfiguredError.
 */
export class LtxWorkflowAdapter {
  private workflowJson: Record<string, unknown> | null = null;
  private mapping: WorkflowNodeMapping | null = null;

  loadWorkflow(json: Record<string, unknown>, mapping?: WorkflowNodeMapping): void {
    this.workflowJson = json;
    this.mapping = mapping ?? null;
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

    if (this.mapping) {
      const m = this.mapping;
      const setField = (nodeId: string, field: string, value: unknown) => {
        const node = patched[nodeId];
        if (node?.inputs) node.inputs[field] = value;
      };

      setField(m.promptNodeId, m.promptField, input.prompt);
      if (m.negativePromptNodeId && m.negativePromptField && input.negativePrompt !== undefined) {
        setField(m.negativePromptNodeId, m.negativePromptField, input.negativePrompt);
      }
      if (m.seedNodeId && m.seedField && input.seed !== undefined) {
        setField(m.seedNodeId, m.seedField, input.seed);
      }
      if (m.durationNodeId && m.durationField) {
        setField(m.durationNodeId, m.durationField, input.durationSeconds);
      }
    }

    return patched as Record<string, unknown>;
  }
}

export const ltxWorkflowAdapter = new LtxWorkflowAdapter();
