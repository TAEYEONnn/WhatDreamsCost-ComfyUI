# LTX Workflow Adapter

## Purpose

The `LtxWorkflowAdapter` translates a Local Video Studio `Shot` into
the input format expected by the LTX Director ComfyUI workflow.

## Current Status: Requires Setup

The adapter is functional but needs a real workflow JSON to be loaded.
Until then, calling `patchWorkflow()` throws `NotConfiguredError`.

The UI surfaces this as "Workflow setup required" in the Provider settings.

## Setup Steps

1. Export the LTX Director workflow from ComfyUI in API format:
   - Open ComfyUI
   - Load `vendor/WhatDreamsCost-ComfyUI/example_workflows/LTX_Director_2_Workflow_Hotfix.json`
   - Enable Dev Mode → Save (API Format)
   - Save as `ltx-director-v2-api.json`

2. Load the workflow in the adapter:
   ```typescript
   import { ltxWorkflowAdapter } from "@ltx-studio/generation-core";
   import workflowJson from "./ltx-director-v2-api.json";
   
   ltxWorkflowAdapter.loadWorkflow(workflowJson);
   ```

3. The `ComfyUIProvider` uses the adapter automatically when patching workflows.

## Mapping Table

| Shot Field | LTX Director Widget | Notes |
|---|---|---|
| `prompt` | `global_prompt` | Main scene description |
| `durationSeconds` | `duration_seconds` | Converted to frames internally |
| `seed` | `seed` (KSampler) | |
| `aspectRatio` | `custom_width` / `custom_height` | Via `aspectRatioToDimensions()` |
| `startFrameAssetId` | Timeline segment (start) | Image uploaded to ComfyUI input |
| `endFrameAssetId` | Timeline segment (end, isEndFrame=true) | Image uploaded to ComfyUI input |
| `cameraPresetId` | Appended to `global_prompt` | Via `CameraPreset.promptModifier` |

## Future Work

- Upload start/end frame images to ComfyUI input directory before submission
- Map local_prompts from shot sub-segments (Phase 2 feature)
- Support audio segments
- Handle multi-stage workflows (Retake, Extend)
