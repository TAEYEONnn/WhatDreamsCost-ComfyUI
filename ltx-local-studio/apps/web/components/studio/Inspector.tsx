"use client";
import { useState } from "react";
import { useShotStore } from "@/lib/store/shot-store";
import { useGenerationStore } from "@/lib/store/generation-store";
import { CAMERA_PRESETS } from "@ltx-studio/shared-types";

interface InspectorProps {
  projectId: string | null;
}

export function Inspector({ projectId }: InspectorProps) {
  const { shots, activeShotId, updateShot } = useShotStore();
  const { generations, loadGenerations, submitGeneration } = useGenerationStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeShot = shots.find((s) => s.id === activeShotId);

  if (!projectId || !activeShot) {
    return (
      <div className="flex items-center justify-center h-full text-[#333] text-xs">
        Select a shot
      </div>
    );
  }

  const shotGenerations = generations.filter((g) => g.shotId === activeShot.id);
  const latestGen = shotGenerations[0];

  const handleGenerate = async () => {
    setIsSubmitting(true);
    await loadGenerations(activeShot.id);
    try {
      await submitGeneration({
        shotId: activeShot.id,
        modelId: "mock-ltxv-0.9",
        prompt: activeShot.prompt,
        negativePrompt: activeShot.negativePrompt,
        durationSeconds: activeShot.durationSeconds,
        aspectRatio: activeShot.aspectRatio,
        seed: activeShot.seed,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-[#1a1a1a]">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">Inspector</span>
      </div>

      <div className="p-3 space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">Prompt</label>
          <textarea
            value={activeShot.prompt}
            onChange={(e) => updateShot(activeShot.id, { prompt: e.target.value })}
            placeholder="Describe the shot..."
            rows={4}
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] placeholder-[#333] resize-none outline-none focus:border-[#333]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">Negative Prompt</label>
          <textarea
            value={activeShot.negativePrompt ?? ""}
            onChange={(e) => updateShot(activeShot.id, { negativePrompt: e.target.value || undefined })}
            placeholder="What to avoid..."
            rows={2}
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] placeholder-[#333] resize-none outline-none focus:border-[#333]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">Duration (s)</label>
            <input
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={activeShot.durationSeconds}
              onChange={(e) => updateShot(activeShot.id, { durationSeconds: parseFloat(e.target.value) })}
              className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">Aspect</label>
            <select
              value={activeShot.aspectRatio}
              onChange={(e) => updateShot(activeShot.id, { aspectRatio: e.target.value as typeof activeShot.aspectRatio })}
              className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
            >
              {["16:9","9:16","1:1","4:3","3:4"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">Camera</label>
          <select
            value={activeShot.cameraPresetId ?? ""}
            onChange={(e) => updateShot(activeShot.id, { cameraPresetId: e.target.value || undefined })}
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] outline-none focus:border-[#333]"
          >
            <option value="">None</option>
            {CAMERA_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#555] uppercase tracking-wider">Seed (optional)</label>
          <input
            type="number"
            value={activeShot.seed ?? ""}
            onChange={(e) => updateShot(activeShot.id, { seed: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="Random"
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1.5 text-xs text-[#ccc] placeholder-[#333] outline-none focus:border-[#333]"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={isSubmitting || !activeShot.prompt}
          className="w-full py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors"
        >
          {isSubmitting ? "Submitting..." : "Generate"}
        </button>

        {latestGen && (
          <div className="space-y-1">
            <label className="text-[10px] text-[#555] uppercase tracking-wider">Last Generation</label>
            <div className="bg-[#111] border border-[#1a1a1a] rounded p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className={
                  latestGen.status === "completed" ? "text-green-400" :
                  latestGen.status === "failed" ? "text-red-400" :
                  latestGen.status === "processing" ? "text-yellow-400" :
                  "text-[#666]"
                }>
                  {latestGen.status}
                </span>
                <span className="text-[#444]">{latestGen.progress}%</span>
              </div>
              {latestGen.status === "processing" && (
                <div className="mt-1.5 w-full h-1 bg-[#1a1a1a] rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded transition-all"
                    style={{ width: `${latestGen.progress}%` }}
                  />
                </div>
              )}
              {latestGen.errorMessage && (
                <div className="mt-1 text-red-400 text-[10px]">{latestGen.errorMessage}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
