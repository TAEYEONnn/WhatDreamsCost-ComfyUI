import type { GenerationStage } from "@ltx-studio/shared-types";

export const STAGE_KO: Record<GenerationStage, string> = {
  uploading: "이미지 업로드 중",
  queued: "생성 대기 중",
  preparing: "모델 준비 중",
  sampling: "영상 프레임 생성 중",
  decoding: "영상 디코딩 중",
  encoding: "영상 파일 생성 중",
  saving: "영상 저장 중",
  completed: "완료",
};

function stageLabelFromProgress(progress: number): string {
  if (progress < 5) return STAGE_KO.uploading;
  if (progress < 12) return STAGE_KO.queued;
  if (progress < 15) return STAGE_KO.preparing;
  if (progress < 93) return STAGE_KO.sampling;
  if (progress < 96) return STAGE_KO.decoding;
  if (progress < 98) return STAGE_KO.encoding;
  if (progress < 100) return STAGE_KO.saving;
  return STAGE_KO.completed;
}

/**
 * Returns the Korean label for a generation stage.
 *
 * Safety net: when progress reaches the post-sampling range (>= 93),
 * the progress value takes priority over the explicit stage to prevent
 * a stale "sampling" label persisting through decode/encode/save phases.
 */
export function stageLabel(stage: GenerationStage | undefined, progress: number): string {
  if (progress >= 100) return STAGE_KO.completed;
  if (progress >= 98) return STAGE_KO.saving;
  if (progress >= 96) return STAGE_KO.encoding;
  if (progress >= 93) return STAGE_KO.decoding;
  if (stage) return STAGE_KO[stage];
  return stageLabelFromProgress(progress);
}
