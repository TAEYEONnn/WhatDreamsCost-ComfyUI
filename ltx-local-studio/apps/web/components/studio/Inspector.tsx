"use client";
import { useState } from "react";
import { useShotStore } from "@/lib/store/shot-store";
import { useGenerationStore } from "@/lib/store/generation-store";
import { useAssetStore } from "@/lib/store/asset-store";
import { CAMERA_PRESETS } from "@ltx-studio/shared-types";
import type { AspectRatio, GenerationStage } from "@ltx-studio/shared-types";

interface InspectorProps {
  projectId: string | null;
}

const STATUS_KO: Record<string, string> = {
  draft: "초안",
  queued: "대기 중",
  processing: "생성 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

const STAGE_KO: Record<GenerationStage, string> = {
  uploading: "이미지 업로드 중",
  queued: "생성 대기 중",
  preparing: "모델 준비 중",
  sampling: "영상 프레임 생성 중",
  decoding: "영상 디코딩 중",
  encoding: "영상 파일 생성 중",
  saving: "영상 저장 중",
  completed: "완료",
};

/** Fallback stage label when the stage field is not available. */
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

function stageLabel(stage: GenerationStage | undefined, progress: number): string {
  if (stage) return STAGE_KO[stage];
  return stageLabelFromProgress(progress);
}

export function Inspector({ projectId }: InspectorProps) {
  const { shots, activeShotId, updateShot } = useShotStore();
  const { generations, loadGenerations, submitGeneration, cancelGeneration, retryGeneration } =
    useGenerationStore();
  const { assets } = useAssetStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeShot = shots.find((s) => s.id === activeShotId);

  if (!projectId || !activeShot) {
    return (
      <div className="flex items-center justify-center h-full text-[#333] text-xs">
        Shot을 선택하세요
      </div>
    );
  }

  const shotGenerations = generations.filter((g) => g.shotId === activeShot.id);
  const latestGen = shotGenerations[0];

  const projectAssets = assets.filter((a) => a.projectId === projectId);
  const imageAssets = projectAssets.filter((a) => a.kind === "image");

  const handleGenerate = async () => {
    setIsSubmitting(true);
    await loadGenerations(activeShot.id);
    try {
      const cameraPreset = CAMERA_PRESETS.find((p) => p.id === activeShot.cameraPresetId);
      const finalPrompt = cameraPreset
        ? `${activeShot.prompt}, ${cameraPreset.promptModifier}`
        : activeShot.prompt;

      await submitGeneration({
        shotId: activeShot.id,
        providerId: "mock",
        modelId: "mock-ltxv-0.9",
        prompt: finalPrompt,
        negativePrompt: activeShot.negativePrompt,
        durationSeconds: activeShot.durationSeconds,
        aspectRatio: activeShot.aspectRatio,
        seed: activeShot.seed,
        cameraPresetId: activeShot.cameraPresetId,
        startFrameAssetId: activeShot.startFrameAssetId,
        endFrameAssetId: activeShot.endFrameAssetId,
        // referenceAssetIds intentionally omitted — LTX 0.9.5 supports one start image only
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isActiveGen = latestGen && ["queued", "processing"].includes(latestGen.status);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-[#1a1a1a]">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">인스펙터</span>
      </div>

      <div className="p-3 space-y-4">
        {/* Prompt */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">프롬프트</label>
          <textarea
            value={activeShot.prompt}
            onChange={(e) => void updateShot(activeShot.id, { prompt: e.target.value })}
            placeholder="Shot을 묘사하세요..."
            rows={4}
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] placeholder-[#333] resize-none outline-none focus:border-[#333]"
          />
        </div>

        {/* Negative Prompt */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">네거티브 프롬프트</label>
          <textarea
            value={activeShot.negativePrompt ?? ""}
            onChange={(e) =>
              void updateShot(activeShot.id, { negativePrompt: e.target.value || undefined })
            }
            placeholder="제외할 요소..."
            rows={2}
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] placeholder-[#333] resize-none outline-none focus:border-[#333]"
          />
        </div>

        {/* Duration + Aspect */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">길이 (초)</label>
            <input
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={activeShot.durationSeconds}
              onChange={(e) =>
                void updateShot(activeShot.id, { durationSeconds: parseFloat(e.target.value) })
              }
              className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">화면비</label>
            <select
              value={activeShot.aspectRatio}
              onChange={(e) =>
                void updateShot(activeShot.id, { aspectRatio: e.target.value as AspectRatio })
              }
              className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
            >
              {(["16:9", "9:16", "1:1", "4:3", "3:4"] as AspectRatio[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Camera Preset */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">카메라 프리셋</label>
          <select
            value={activeShot.cameraPresetId ?? ""}
            onChange={(e) =>
              void updateShot(activeShot.id, { cameraPresetId: e.target.value || undefined })
            }
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
          >
            <option value="">없음</option>
            {CAMERA_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* 시작 이미지 — single image only for LTX 0.9.5 */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">시작 이미지</label>
          <p className="text-[10px] text-[#444]">
            현재 로컬 LTX 모델은 시작 이미지 1장만 사용할 수 있습니다.
          </p>
          <select
            value={activeShot.startFrameAssetId ?? ""}
            onChange={(e) =>
              void updateShot(activeShot.id, {
                startFrameAssetId: e.target.value || undefined,
              })
            }
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
          >
            <option value="">없음</option>
            {imageAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {imageAssets.length === 0 && (
            <div className="text-[10px] text-[#444]">에셋 라이브러리에 이미지를 추가하세요</div>
          )}
        </div>

        {/* End Frame */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">끝 프레임</label>
          <select
            value={activeShot.endFrameAssetId ?? ""}
            onChange={(e) =>
              void updateShot(activeShot.id, {
                endFrameAssetId: e.target.value || undefined,
              })
            }
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
          >
            <option value="">없음</option>
            {imageAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Seed */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">시드 (선택)</label>
          <input
            type="number"
            value={activeShot.seed ?? ""}
            onChange={(e) =>
              void updateShot(activeShot.id, {
                seed: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="무작위"
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] placeholder-[#333] outline-none focus:border-[#333]"
          />
        </div>

        {/* Generate / Cancel button */}
        {isActiveGen ? (
          <button
            onClick={() => void cancelGeneration(latestGen.id)}
            className="w-full py-2 rounded bg-red-900 hover:bg-red-800 text-xs font-medium text-white transition-colors"
          >
            생성 취소
          </button>
        ) : (
          <button
            onClick={() => void handleGenerate()}
            disabled={isSubmitting || !activeShot.prompt}
            className="w-full py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors"
          >
            {isSubmitting ? "생성 요청 중..." : "영상 생성"}
          </button>
        )}

        {/* Latest generation status */}
        {latestGen && (
          <div className="space-y-1">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">마지막 생성</label>
            <div className="bg-[#111] border border-[#1a1a1a] rounded p-2 text-xs">
              <div className="flex items-center justify-between">
                <span
                  className={
                    latestGen.status === "completed"
                      ? "text-green-400"
                      : latestGen.status === "failed"
                      ? "text-red-400"
                      : latestGen.status === "processing"
                      ? "text-yellow-400"
                      : "text-[#666]"
                  }
                >
                  {STATUS_KO[latestGen.status] ?? latestGen.status}
                </span>
                <span className="text-[#444]">{latestGen.progress}%</span>
              </div>
              {(latestGen.status === "processing" || latestGen.status === "queued") && (
                <div className="mt-1.5 space-y-1">
                  <div className="w-full h-1 bg-[#1a1a1a] rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded transition-[width] duration-300 ease-out"
                      style={{ width: `${latestGen.progress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[#555]">
                    {stageLabel(latestGen.stage, latestGen.progress)}
                  </div>
                </div>
              )}
              {latestGen.errorMessage && (
                <div className="mt-1 text-red-400 text-[10px]">{latestGen.errorMessage}</div>
              )}
              {latestGen.status === "failed" && (
                <button
                  onClick={() => void retryGeneration(latestGen.id)}
                  className="mt-2 w-full py-1 rounded bg-[#1a1a1a] hover:bg-[#222] text-[10px] text-[#888] hover:text-white transition-colors"
                >
                  다시 시도
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
