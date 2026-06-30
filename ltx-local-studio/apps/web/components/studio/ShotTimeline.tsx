"use client";
import { useCallback } from "react";
import { useShotStore } from "@/lib/store/shot-store";
import { useGenerationStore } from "@/lib/store/generation-store";
import type { Shot } from "@ltx-studio/shared-types";

interface ShotTimelineProps {
  projectId: string | null;
}

export function ShotTimeline({ projectId }: ShotTimelineProps) {
  const { shots, activeShotId, createShot, deleteShot, duplicateShot, setActiveShot } = useShotStore();
  const { generations } = useGenerationStore();

  const projectShots = shots
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => a.order - b.order);

  const handleAddShot = useCallback(async () => {
    if (!projectId) return;
    await createShot(projectId);
  }, [projectId, createShot]);

  return (
    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto h-full">
      {projectShots.map((shot) => (
        <ShotCard
          key={shot.id}
          shot={shot}
          isActive={shot.id === activeShotId}
          latestStatus={generations.find((g) => g.shotId === shot.id)?.status}
          latestProgress={generations.find((g) => g.shotId === shot.id)?.progress}
          onClick={() => setActiveShot(shot.id)}
          onDuplicate={() => duplicateShot(shot.id)}
          onDelete={() => deleteShot(shot.id)}
        />
      ))}
      {projectId && (
        <button
          onClick={handleAddShot}
          className="shrink-0 w-24 h-[calc(100%-8px)] border border-dashed border-[#222] rounded flex items-center justify-center text-[#333] hover:text-[#666] hover:border-[#333] transition-colors text-lg"
        >
          +
        </button>
      )}
    </div>
  );
}

interface ShotCardProps {
  shot: Shot;
  isActive: boolean;
  latestStatus?: string;
  latestProgress?: number;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ShotCard({ shot, isActive, latestStatus, latestProgress, onClick, onDuplicate, onDelete }: ShotCardProps) {
  const statusColor =
    latestStatus === "completed" ? "bg-green-600" :
    latestStatus === "failed" ? "bg-red-600" :
    latestStatus === "processing" ? "bg-yellow-500" :
    latestStatus === "queued" ? "bg-blue-600" :
    "bg-[#222]";

  return (
    <div
      onClick={onClick}
      className={`shrink-0 w-28 h-[calc(100%-8px)] rounded border cursor-pointer transition-all flex flex-col overflow-hidden group relative ${
        isActive ? "border-blue-500 bg-[#0d1a33]" : "border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#2a2a2a]"
      }`}
    >
      <div className="flex-1 flex items-center justify-center p-2">
        <span className="text-[#333] text-lg">▶</span>
      </div>
      <div className="px-2 pb-1.5">
        <div className="text-[10px] text-[#888] truncate">{shot.name}</div>
        <div className="text-[9px] text-[#444]">{shot.durationSeconds}s</div>
        {latestStatus === "processing" && typeof latestProgress === "number" && (
          <div className="mt-1 w-full h-0.5 bg-[#1a1a1a] rounded overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${latestProgress}%` }} />
          </div>
        )}
      </div>
      <div className={`h-0.5 w-full ${statusColor} transition-colors`} />

      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="text-[9px] text-[#666] hover:text-white bg-[#0a0a0a] rounded px-1"
          title="Duplicate"
        >⊕</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-[9px] text-[#666] hover:text-red-400 bg-[#0a0a0a] rounded px-1"
          title="Delete"
        >✕</button>
      </div>
    </div>
  );
}
