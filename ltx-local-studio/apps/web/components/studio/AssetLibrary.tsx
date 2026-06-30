"use client";
import { useRef, useCallback } from "react";
import { useAssetStore } from "@/lib/store/asset-store";
import type { Asset } from "@ltx-studio/shared-types";

interface AssetLibraryProps {
  projectId: string | null;
}

const ROLE_LABELS = {
  character: "Character",
  location: "Location",
  object: "Object",
  reference: "Reference",
  "generation-output": "Output",
};

export function AssetLibrary({ projectId }: AssetLibraryProps) {
  const { assets, uploadAsset, deleteAsset } = useAssetStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const projectAssets = assets.filter((a) => a.projectId === projectId);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!projectId || !files) return;
    for (const file of Array.from(files)) {
      await uploadAsset(projectId, file);
    }
  }, [projectId, uploadAsset]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-[#444] text-xs">
        No project
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">Assets</span>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          + Upload
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        className="flex-1 overflow-y-auto p-2"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {projectAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="text-[#333] text-xs">Drag & drop files</div>
            <div className="text-[#2a2a2a] text-xs mt-1">images, videos, audio</div>
          </div>
        ) : (
          <div className="space-y-1">
            {projectAssets.map((asset) => (
              <AssetItem key={asset.id} asset={asset} onDelete={() => deleteAsset(asset.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetItem({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  const icon = asset.kind === "video" ? "▶" : asset.kind === "audio" ? "♪" : "◻";
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#111] group">
      <span className="text-[#444] text-xs w-4 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#ccc] truncate">{asset.name}</div>
        <div className="text-[10px] text-[#555]">{ROLE_LABELS[asset.role]}</div>
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
