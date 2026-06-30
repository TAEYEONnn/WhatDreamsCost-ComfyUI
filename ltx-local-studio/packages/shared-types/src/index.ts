import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitive enums
// ---------------------------------------------------------------------------

export const AspectRatioSchema = z.enum([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
  "2.35:1",
]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const AssetKindSchema = z.enum(["image", "video", "audio"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetRoleSchema = z.enum([
  "character",
  "location",
  "object",
  "reference",
  "generation-output",
]);
export type AssetRole = z.infer<typeof AssetRoleSchema>;

export const GenerationStatusSchema = z.enum([
  "draft",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  aspectRatio: AspectRatioSchema,
  shotIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ---------------------------------------------------------------------------
// Shot
// ---------------------------------------------------------------------------

export const ShotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  order: z.number().int().min(0),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  durationSeconds: z.number().min(0.1).max(600),
  aspectRatio: AspectRatioSchema,
  startFrameAssetId: z.string().uuid().optional(),
  endFrameAssetId: z.string().uuid().optional(),
  referenceAssetIds: z.array(z.string().uuid()),
  cameraPresetId: z.string().optional(),
  selectedGenerationId: z.string().uuid().optional(),
  seed: z.number().int().optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

export const AssetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  kind: AssetKindSchema,
  role: AssetRoleSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSeconds: z.number().optional(),
  createdAt: z.string().datetime(),
});
export type Asset = z.infer<typeof AssetSchema>;

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export const GenerationSchema = z.object({
  id: z.string().uuid(),
  shotId: z.string().uuid(),
  parentGenerationId: z.string().uuid().optional(),
  providerId: z.string(),
  modelId: z.string(),
  providerJobId: z.string().optional(),
  status: GenerationStatusSchema,
  progress: z.number().min(0).max(100),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  seed: z.number().int().optional(),
  outputAssetId: z.string().uuid().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  parameters: z.record(z.unknown()).optional(),
});
export type Generation = z.infer<typeof GenerationSchema>;

// ---------------------------------------------------------------------------
// Camera Preset
// ---------------------------------------------------------------------------

export const CameraPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  promptModifier: z.string(),
  postProcess: z
    .object({
      type: z.enum(["zoom", "pan", "none"]),
      startScale: z.number().optional(),
      endScale: z.number().optional(),
      direction: z.enum(["left", "right", "up", "down"]).optional(),
    })
    .optional(),
});
export type CameraPreset = z.infer<typeof CameraPresetSchema>;

// ---------------------------------------------------------------------------
// Built-in camera presets
// ---------------------------------------------------------------------------

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: "static",
    name: "Static",
    promptModifier: "static camera, locked shot",
    postProcess: { type: "none" },
  },
  {
    id: "slow-zoom-in",
    name: "Slow Zoom In",
    promptModifier: "slow zoom in, gradually approaching subject",
    postProcess: { type: "zoom", startScale: 1.0, endScale: 1.15 },
  },
  {
    id: "slow-zoom-out",
    name: "Slow Zoom Out",
    promptModifier: "slow zoom out, pulling back from subject",
    postProcess: { type: "zoom", startScale: 1.15, endScale: 1.0 },
  },
  {
    id: "dolly-in",
    name: "Dolly In",
    promptModifier: "camera dolly forward, moving toward subject",
    postProcess: { type: "zoom", startScale: 1.0, endScale: 1.2 },
  },
  {
    id: "dolly-out",
    name: "Dolly Out",
    promptModifier: "camera dolly backward, moving away from subject",
    postProcess: { type: "zoom", startScale: 1.2, endScale: 1.0 },
  },
  {
    id: "pan-left",
    name: "Pan Left",
    promptModifier: "camera panning left, horizontal movement",
    postProcess: { type: "pan", direction: "left" },
  },
  {
    id: "pan-right",
    name: "Pan Right",
    promptModifier: "camera panning right, horizontal movement",
    postProcess: { type: "pan", direction: "right" },
  },
  {
    id: "tilt-up",
    name: "Tilt Up",
    promptModifier: "camera tilting up, vertical upward movement",
    postProcess: { type: "pan", direction: "up" },
  },
  {
    id: "orbit-left",
    name: "Orbit Left",
    promptModifier: "camera orbiting left around subject, arc shot",
    postProcess: { type: "pan", direction: "left" },
  },
  {
    id: "handheld",
    name: "Handheld",
    promptModifier: "handheld camera, slight natural movement, documentary style",
    postProcess: { type: "none" },
  },
];

// ---------------------------------------------------------------------------
// Project import/export
// ---------------------------------------------------------------------------

export const ProjectExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  project: ProjectSchema,
  shots: z.array(ShotSchema),
  assets: z.array(AssetSchema),
  generations: z.array(GenerationSchema),
});
export type ProjectExport = z.infer<typeof ProjectExportSchema>;

// ---------------------------------------------------------------------------
// Aspect ratio helpers
// ---------------------------------------------------------------------------

export function aspectRatioToDimensions(
  ratio: AspectRatio,
  base = 512
): { width: number; height: number } {
  const map: Record<AspectRatio, [number, number]> = {
    "16:9": [16, 9],
    "9:16": [9, 16],
    "1:1": [1, 1],
    "4:3": [4, 3],
    "3:4": [3, 4],
    "21:9": [21, 9],
    "2.35:1": [235, 100],
  };
  const [w, h] = map[ratio];
  const scale = base / Math.min(w, h);
  return {
    width: Math.round((w * scale) / 32) * 32,
    height: Math.round((h * scale) / 32) * 32,
  };
}
