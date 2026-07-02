"use client";
import { useState, useRef, useEffect, useCallback } from "react";
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

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function Inspector({ projectId }: InspectorProps) {
  const { shots, activeShotId, updateShot } = useShotStore();
  const { generations, loadGenerations, submitGeneration, cancelGeneration, retryGeneration } =
    useGenerationStore();
  const { uploadAsset, getBlobUrl } = useAssetStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Local image state — preview URL (object URL) and the asset that backs it
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imagePreviewRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeShot = shots.find((s) => s.id === activeShotId);

  // Restore preview from persisted startFrameAssetId on shot/project change
  useEffect(() => {
    const assetId = activeShot?.startFrameAssetId;
    let cancelled = false;
    const prev = imagePreviewRef.current;

    const restore = async () => {
      if (prev) {
        URL.revokeObjectURL(prev);
        imagePreviewRef.current = null;
      }
      if (!assetId) {
        setImagePreview(null);
        return;
      }
      const url = await getBlobUrl(assetId);
      if (!cancelled && url) {
        imagePreviewRef.current = url;
        setImagePreview(url);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [activeShot?.startFrameAssetId, activeShot?.id, getBlobUrl]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewRef.current) {
        URL.revokeObjectURL(imagePreviewRef.current);
      }
    };
  }, []);

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!projectId || !activeShot) return;
      setImageError(null);

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setImageError("PNG, JPG, WEBP 이미지만 사용할 수 있습니다.");
        return;
      }

      // Revoke old preview
      if (imagePreviewRef.current) {
        URL.revokeObjectURL(imagePreviewRef.current);
        imagePreviewRef.current = null;
      }

      // Show preview immediately
      const previewUrl = URL.createObjectURL(file);
      imagePreviewRef.current = previewUrl;
      setImagePreview(previewUrl);

      // Upload to asset store (for IndexedDB persistence) → get assetId
      try {
        const asset = await uploadAsset(projectId, file, "reference");
        await updateShot(activeShot.id, { startFrameAssetId: asset.id });
      } catch {
        setImageError("이미지 저장에 실패했습니다.");
      }

      // Reset input so the same file can be reselected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [projectId, activeShot, uploadAsset, updateShot]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleImageFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleImageFile(file);
  };

  const clearImage = async () => {
    if (!activeShot) return;
    if (imagePreviewRef.current) {
      URL.revokeObjectURL(imagePreviewRef.current);
      imagePreviewRef.current = null;
    }
    setImagePreview(null);
    setImageError(null);
    await updateShot(activeShot.id, { startFrameAssetId: undefined });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!projectId || !activeShot) {
    return (
      <div className="flex items-center justify-center h-full text-[#333] text-xs">
        Shot을 선택하세요
      </div>
    );
  }

  const shotGenerations = generations.filter((g) => g.shotId === activeShot.id);
  const latestGen = shotGenerations[0];

  const hasStartImage = !!activeShot.startFrameAssetId;

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
        providerId: "comfyui",
        modelId: "ltxv-0.9.5",
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

        {/* 시작 이미지 — direct file upload, single image only */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">시작 이미지</label>
            {hasStartImage && (
              <button
                onClick={() => void clearImage()}
                className="text-[10px] text-[#555] hover:text-red-400 transition-colors"
              >
                제거
              </button>
            )}
          </div>
          <p className="text-[10px] text-[#444]">
            현재 로컬 LTX 모델은 시작 이미지 1장만 사용할 수 있습니다.
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Drop zone / preview */}
          <div
            role="button"
            tabIndex={0}
            className={`relative w-full rounded border-2 border-dashed transition-colors cursor-pointer
              ${hasStartImage
                ? "border-[#333] bg-[#111]"
                : "border-[#222] bg-[#0d0d0d] hover:border-[#333] hover:bg-[#111]"
              }`}
            style={{ minHeight: "80px" }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="시작 이미지"
                className="w-full h-full object-contain rounded"
                style={{ maxHeight: "120px" }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-20 gap-1">
                <span className="text-[#333] text-lg">+</span>
                <span className="text-[10px] text-[#444]">클릭하거나 드래그</span>
                <span className="text-[10px] text-[#333]">PNG · JPG · WEBP</span>
              </div>
            )}
          </div>

          {imageError && (
            <div className="text-[10px] text-red-400">{imageError}</div>
          )}
        </div>

        {/* End Frame */}
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">끝 프레임</label>
          <p className="text-[10px] text-[#444]">추후 지원 예정</p>
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
            disabled={isSubmitting || !activeShot.prompt || !hasStartImage}
            className="w-full py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors"
          >
            {isSubmitting ? "생성 요청 중..." : !hasStartImage ? "시작 이미지를 선택하세요" : "영상 생성"}
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
                  <div className="text-[10px] text-[#666]">
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
