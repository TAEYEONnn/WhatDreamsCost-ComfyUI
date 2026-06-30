"use client";
import { useProjectStore } from "@/lib/store/project-store";
import { useState } from "react";

interface HeaderProps {
  onNewProject: () => void;
  onImportProject: () => void;
}

export function Header({ onNewProject, onImportProject }: HeaderProps) {
  const { projects, activeProjectId, updateProject } = useProjectStore();
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

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
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingName(false); }}
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
        <span className="text-xs text-[#555] px-2 py-0.5 rounded bg-[#111] border border-[#1a1a1a]">
          MOCK
        </span>
        <button
          onClick={onImportProject}
          className="text-xs text-[#888] hover:text-white px-2 py-1 rounded hover:bg-[#1a1a1a] transition-colors"
        >
          Import
        </button>
        <button
          onClick={onNewProject}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
        >
          + New Project
        </button>
      </div>
    </header>
  );
}
