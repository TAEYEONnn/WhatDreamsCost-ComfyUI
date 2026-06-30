import type { VideoGenerationInput } from "../types";
import { NotConfiguredError } from "../types";

export interface WorkflowNodeMapping {
  promptNodeId: string;
  promptField: string;
  seedNodeId?: string;
  seedField?: string;
  durationNodeId?: string;
  durationField?: string;
  negativePromptNodeId?: string;
  negativePromptField?: string;
}

/**
 * Generic ComfyUI workflow adapter.
 * Uses explicit WorkflowNodeMapping rather than scanning for field names.
 * For LTX-specific patching see ltx-workflow-adapter.ts.
 */
export class ComfyUIWorkflowAdapter {
  private workflowJson: Record<string, unknown> | null = null;
  private mapping: WorkflowNodeMapping | null = null;

  loadWorkflow(json: Record<string, unknown>, mapping?: WorkflowNodeMapping): void {
    this.workflowJson = json;
    this.mapping = mapping ?? null;
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

export const comfyUIWorkflowAdapter = new ComfyUIWorkflowAdapter();
