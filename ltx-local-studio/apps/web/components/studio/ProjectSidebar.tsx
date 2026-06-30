"use client";
import { useProjectStore } from "@/lib/store/project-store";
import { useShotStore } from "@/lib/store/shot-store";
import { useAssetStore } from "@/lib/store/asset-store";
import { useGenerationStore } from "@/lib/store/generation-store";

interface ProjectSidebarProps {
  onNewProject: () => void;
}

export function ProjectSidebar({ onNewProject }: ProjectSidebarProps) {
  const { projects, activeProjectId, setActiveProject, deleteProject, exportProject } = useProjectStore();
  const { loadShots } = useShotStore();
  const { loadAssets } = useAssetStore();
  useGenerationStore();

  const handleSelectProject = async (id: string) => {
    setActiveProject(id);
    await loadShots(id);
    await loadAssets(id);
  };

  const handleExport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const json = await exportProject(id);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-52 flex-shrink-0 border-r border-[#111] bg-[#080808] flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#111] flex items-center justify-between">
        <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Projects</span>
        <button onClick={onNewProject} className="text-[10px] text-blue-500 hover:text-blue-400">+ New</button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => handleSelectProject(p.id)}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
              p.id === activeProjectId ? "bg-[#111] text-white" : "text-[#888] hover:text-[#ccc] hover:bg-[#0d0d0d]"
            }`}
          >
            <span className="text-[#333] text-xs">◻</span>
            <span className="text-xs flex-1 truncate">{p.name}</span>
            <div className="opacity-0 group-hover:opacity-100 flex gap-1">
              <button onClick={(e) => handleExport(p.id, e)} className="text-[9px] text-[#555] hover:text-white" title="Export">↓</button>
              <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className="text-[9px] text-[#555] hover:text-red-400" title="Delete">✕</button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="px-3 py-4 text-[10px] text-[#333] text-center">No projects yet</div>
        )}
      </div>
    </div>
  );
}
