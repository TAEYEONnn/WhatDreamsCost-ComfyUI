"use client";
import { useProjectStore } from "@/lib/store/project-store";
import { useGenerationStore } from "@/lib/store/generation-store";
import { useState, useEffect } from "react";

interface HeaderProps {
  onNewProject: () => void;
  onImportProject: () => void;
}

export function Header({ onNewProject, onImportProject }: HeaderProps) {
  const { projects, activeProjectId, updateProject, exportProject } = useProjectStore();
  const { providerStatus, checkProviderStatus } = useGenerationStore();
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  useEffect(() => {
    void checkProviderStatus();
  }, [checkProviderStatus]);

  const startEdit = () => {
    setNameValue(activeProject?.name ?? "");
    setEditingName(true);
  };

  const commitEdit = async () => {
    if (activeProject && nameValue.trim()) {
      await updateProject(activeProject.id, { name: nameValue.trim() });
    }
    setEditingName(false);
  };

  const statusLabel = providerStatus.checking
    ? "확인 중..."
    : providerStatus.connected
    ? "연결됨"
    : providerStatus.error
    ? "연결 실패"
    : "설정 필요";

  const dotColor = providerStatus.checking
    ? "bg-yellow-500 animate-pulse"
    : providerStatus.connected
    ? "bg-green-500"
    : "bg-red-500";

  const statusColor = providerStatus.checking
    ? "text-[#666]"
    : providerStatus.connected
    ? "text-green-400"
    : "text-red-400";

  return (
    <header className="flex items-center justify-between px-3 py-2 border-b border-[#222] bg-[#0d0d0d] min-h-[42px]">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold tracking-widest text-[#555] uppercase">LTX Studio</span>
        {activeProject && (
          <>
            <span className="text-[#333]">/</span>
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => void commitEdit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitEdit();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="bg-[#1a1a1a] border border-[#333] rounded px-2 py-0.5 text-sm text-white outline-none w-48"
              />
            ) : (
              <button onClick={startEdit} className="text-sm text-[#ccc] hover:text-white transition-colors">
                {activeProject.name}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void checkProviderStatus()}
          title={providerStatus.providerName}
          className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-[#111] border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors"
        >
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${dotColor}`} />
          <span className="text-[#555]">{providerStatus.providerName.replace(" (Development)", "")}</span>
          <span className={statusColor}>{statusLabel}</span>
        </button>
        {activeProjectId && (
          <button
            onClick={() => void exportProject(activeProjectId)}
            className="text-xs text-[#888] hover:text-white px-2 py-1 rounded hover:bg-[#1a1a1a] transition-colors"
          >
            내보내기
          </button>
        )}
        <button
          onClick={onImportProject}
          className="text-xs text-[#888] hover:text-white px-2 py-1 rounded hover:bg-[#1a1a1a] transition-colors"
        >
          가져오기
        </button>
        <button
          onClick={onNewProject}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
        >
          + 새 프로젝트
        </button>
      </div>
    </header>
  );
}
