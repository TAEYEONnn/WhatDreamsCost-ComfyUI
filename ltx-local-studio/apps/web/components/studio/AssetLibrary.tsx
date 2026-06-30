"use client";
import { useRef, useCallback, useEffect, useState } from "react";
import { useAssetStore } from "@/lib/store/asset-store";
import type { Asset } from "@ltx-studio/shared-types";

interface AssetLibraryProps {
  projectId: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  character: "캐릭터",
  location: "배경",
  object: "오브젝트",
  reference: "레퍼런스",
  "generation-output": "출력",
};

const ACCEPT_TYPES =
  "image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg";

export function AssetLibrary({ projectId }: AssetLibraryProps) {
  const { assets, uploadAsset, deleteAsset } = useAssetStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const projectAssets = assets.filter((a) => a.projectId === projectId);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!projectId || !files) return;
      setUploadError(null);
      for (const file of Array.from(files)) {
        try {
          await uploadAsset(projectId, file);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : "업로드 실패");
        }
      }
    },
    [projectId, uploadAsset]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-[#444] text-xs">
        프로젝트 없음
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">에셋</span>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          + 업로드
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_TYPES}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {uploadError && (
        <div className="mx-2 mt-2 px-2 py-1.5 bg-red-950 border border-red-800 rounded text-[10px] text-red-300">
          {uploadError}
          <button
            onClick={() => setUploadError(null)}
            className="float-right text-red-500 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto p-2"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {projectAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="text-[#333] text-xs">드래그 앤 드롭</div>
            <div className="text-[#2a2a2a] text-xs mt-1">이미지, 영상, 오디오</div>
          </div>
        ) : (
          <div className="space-y-1">
            {projectAssets.map((asset) => (
              <AssetItem key={asset.id} asset={asset} onDelete={() => void deleteAsset(asset.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetItem({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  const { getBlobUrl } = useAssetStore();
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    if (asset.kind === "image") {
      getBlobUrl(asset.id).then((u) => {
        url = u;
        setThumbUrl(u);
      }).catch(() => {});
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.id, asset.kind, getBlobUrl]);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#111] group">
      {/* Thumbnail / icon */}
      <div className="w-8 h-8 shrink-0 rounded overflow-hidden bg-[#1a1a1a] flex items-center justify-center">
        {asset.kind === "image" && thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : asset.kind === "video" ? (
          <span className="text-[#555] text-xs">▶</span>
        ) : asset.kind === "audio" ? (
          <span className="text-[#555] text-xs">♪</span>
        ) : (
          <span className="text-[#555] text-xs">◻</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#ccc] truncate">{asset.name}</div>
        <div className="text-[10px] text-[#555]">{ROLE_LABELS[asset.role] ?? asset.role}</div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-red-400 text-xs transition-all"
      >
        ✕
      </button>
    </div>
  );
}
