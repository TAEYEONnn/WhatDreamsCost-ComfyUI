"use client";
import { useShotStore } from "@/lib/store/shot-store";
import { useGenerationStore } from "@/lib/store/generation-store";
import { useAssetStore } from "@/lib/store/asset-store";
import { useState, useEffect, useRef } from "react";
import type { Generation } from "@ltx-studio/shared-types";

interface PreviewPanelProps {
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

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const { shots, activeShotId } = useShotStore();
  const { generations, adoptGeneration } = useGenerationStore();
  const { assets, getBlobUrl } = useAssetStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const activeShot = shots.find((s) => s.id === activeShotId);
  const shotGenerations = activeShot
    ? [...generations.filter((g) => g.shotId === activeShot.id)].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    : [];
  const completedGens = shotGenerations.filter((g) => g.status === "completed");

  const selectedGen = activeShot?.selectedGenerationId
    ? completedGens.find((g) => g.id === activeShot.selectedGenerationId) ?? completedGens[0]
    : completedGens[0];

  // Resolve video URL: outputUrl (relative path) or startFrame blob URL
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      if (selectedGen?.outputUrl) {
        setPreviewUrl(selectedGen.outputUrl);
        return;
      }
      if (activeShot?.startFrameAssetId) {
        const url = await getBlobUrl(activeShot.startFrameAssetId);
        if (!cancelled) {
          urlRef.current = url;
          setPreviewUrl(url);
        }
      } else {
        setPreviewUrl(null);
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [selectedGen?.outputUrl, activeShot?.startFrameAssetId, getBlobUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const startFrameAsset = activeShot?.startFrameAssetId
    ? assets.find((a) => a.id === activeShot.startFrameAssetId)
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">미리보기</span>
        {activeShot && <span className="text-[10px] text-[#444]">{activeShot.name}</span>}
      </div>

      {/* Video / Image preview */}
      <div className="flex-1 flex items-center justify-center bg-[#080808] m-2 rounded-lg overflow-hidden min-h-0">
        {selectedGen?.outputUrl ? (
          <video
            key={selectedGen.outputUrl}
            src={selectedGen.outputUrl}
            controls
            playsInline
            loop
            className="max-w-full max-h-full object-contain rounded"
          />
        ) : previewUrl && startFrameAsset?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="시작 프레임"
            className="max-w-full max-h-full object-contain rounded opacity-60"
          />
        ) : activeShot ? (
          <div className="text-center p-4">
            <div className="text-[#222] text-4xl mb-3">▶</div>
            <div className="text-xs text-[#333]">
              {activeShot.prompt
                ? activeShot.prompt.slice(0, 80) + (activeShot.prompt.length > 80 ? "..." : "")
                : "프롬프트를 입력하세요"}
            </div>
          </div>
        ) : (
          <div className="text-[#222] text-xs">Shot을 선택하세요</div>
        )}
      </div>

      {/* Generation history list */}
      {projectId && shotGenerations.length > 0 && (
        <div className="border-t border-[#1a1a1a] max-h-36 overflow-y-auto">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-[#555] uppercase tracking-wider">생성 기록</span>
            <span className="text-[10px] text-[#444]">{completedGens.length} 완료</span>
          </div>
          <div className="px-2 pb-2 space-y-1">
            {shotGenerations.map((gen) => (
              <GenerationRow
                key={gen.id}
                gen={gen}
                isSelected={activeShot?.selectedGenerationId === gen.id}
                onAdopt={() => void adoptGeneration(gen.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GenerationRow({
  gen,
  isSelected,
  onAdopt,
}: {
  gen: Generation;
  isSelected: boolean;
  onAdopt: () => void;
}) {
  const statusColor =
    gen.status === "completed"
      ? "text-green-400"
      : gen.status === "failed"
      ? "text-red-400"
      : gen.status === "processing"
      ? "text-yellow-400"
      : "text-[#666]";

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
        isSelected ? "bg-[#0d1a33] border border-blue-800" : "hover:bg-[#111]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={statusColor}>{STATUS_KO[gen.status] ?? gen.status}</span>
          <span className="text-[#444]">{gen.progress}%</span>
          {gen.status === "processing" && (
            <div className="flex-1 h-1 bg-[#1a1a1a] rounded overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${gen.progress}%` }}
              />
            </div>
          )}
        </div>
        <div className="text-[10px] text-[#444] truncate">
          {new Date(gen.createdAt).toLocaleTimeString("ko-KR")}
        </div>
      </div>
      {gen.status === "completed" && !isSelected && (
        <button
          onClick={onAdopt}
          className="shrink-0 text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-[#0a1224] hover:bg-[#0d1a33] transition-colors"
        >
          채택
        </button>
      )}
      {isSelected && (
        <span className="shrink-0 text-[10px] text-blue-400">✓ 채택됨</span>
      )}
    </div>
  );
}
