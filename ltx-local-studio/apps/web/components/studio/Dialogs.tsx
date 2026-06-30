"use client";
import { useState } from "react";
import { useProjectStore } from "@/lib/store/project-store";
import type { AspectRatio } from "@ltx-studio/shared-types";

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState("새 프로젝트");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const { createProject } = useProjectStore();

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createProject(name.trim(), aspectRatio);
    onClose();
    setName("새 프로젝트");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#111] border border-[#222] rounded-lg p-5 w-80 space-y-4">
        <h2 className="text-sm font-semibold text-white">새 프로젝트</h2>
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">프로젝트 이름</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") onClose();
            }}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-3 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">화면비</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-3 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          >
            {(["16:9", "9:16", "1:1", "4:3", "3:4"] as AspectRatio[]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-xs text-[#666] hover:text-white px-3 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim()}
            className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white px-3 py-1.5 rounded transition-colors"
          >
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

interface ImportProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportProjectDialog({ open, onClose }: ImportProjectDialogProps) {
  const [error, setError] = useState("");
  const { importProject } = useProjectStore();

  if (!open) return null;

  const handleFile = async (file: File) => {
    setError("");
    try {
      const text = await file.text();
      await importProject(text);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#111] border border-[#222] rounded-lg p-5 w-80 space-y-4">
        <h2 className="text-sm font-semibold text-white">프로젝트 가져오기</h2>
        <label className="flex flex-col items-center justify-center border border-dashed border-[#333] rounded-lg p-6 cursor-pointer hover:border-[#444] transition-colors">
          <span className="text-[#444] text-2xl mb-2">↑</span>
          <span className="text-xs text-[#666]">JSON 파일 선택</span>
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
          />
        </label>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-[#666] hover:text-white px-3 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
