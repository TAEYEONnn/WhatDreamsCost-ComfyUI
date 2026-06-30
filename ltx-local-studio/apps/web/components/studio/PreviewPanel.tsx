"use client";
import { useShotStore } from "@/lib/store/shot-store";
import { useGenerationStore } from "@/lib/store/generation-store";

interface PreviewPanelProps {
  projectId: string | null;
}

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const { shots, activeShotId } = useShotStore();
  const { generations } = useGenerationStore();

  const activeShot = shots.find((s) => s.id === activeShotId);
  const shotGenerations = activeShot
    ? generations.filter((g) => g.shotId === activeShot.id && g.status === "completed")
    : [];
  const selectedGen = shotGenerations[0];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">
          Preview
        </span>
        {activeShot && (
          <span className="text-[10px] text-[#444]">{activeShot.name}</span>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#080808] m-2 rounded-lg overflow-hidden">
        {selectedGen?.outputAssetId ? (
          <div className="text-center">
            <div className="text-xs text-green-400 mb-2">Generation complete</div>
            <div className="text-[10px] text-[#444]">Mock output (no actual video)</div>
          </div>
        ) : activeShot ? (
          <div className="text-center p-4">
            <div className="text-[#222] text-4xl mb-3">▶</div>
            <div className="text-xs text-[#333]">
              {activeShot.prompt ? activeShot.prompt.slice(0, 80) + (activeShot.prompt.length > 80 ? "..." : "") : "No prompt set"}
            </div>
          </div>
        ) : (
          <div className="text-[#222] text-xs">Select a shot to preview</div>
        )}
      </div>

      {projectId && shotGenerations.length > 1 && (
        <div className="px-3 py-2 border-t border-[#1a1a1a]">
          <div className="text-[10px] text-[#555]">{shotGenerations.length} results</div>
        </div>
      )}
    </div>
  );
}
