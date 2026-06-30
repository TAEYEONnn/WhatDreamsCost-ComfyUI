"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/studio/Header";
import { AssetLibrary } from "@/components/studio/AssetLibrary";
import { PreviewPanel } from "@/components/studio/PreviewPanel";
import { Inspector } from "@/components/studio/Inspector";
import { ShotTimeline } from "@/components/studio/ShotTimeline";
import { ProjectSidebar } from "@/components/studio/ProjectSidebar";
import { NewProjectDialog, ImportProjectDialog } from "@/components/studio/Dialogs";
import { useProjectStore } from "@/lib/store/project-store";
import { useShotStore } from "@/lib/store/shot-store";
import { useAssetStore } from "@/lib/store/asset-store";
import { useGenerationStore } from "@/lib/store/generation-store";

export default function Home() {
  const { loadProjects, activeProjectId } = useProjectStore();
  const { loadShots, activeShotId } = useShotStore();
  const { loadAssets } = useAssetStore();
  const { loadGenerations } = useGenerationStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    loadProjects().then(() => setHydrated(true));
  }, [loadProjects]);

  useEffect(() => {
    if (activeProjectId) {
      void loadShots(activeProjectId);
      void loadAssets(activeProjectId);
    }
  }, [activeProjectId, loadShots, loadAssets]);

  useEffect(() => {
    if (activeShotId) {
      void loadGenerations(activeShotId);
    }
  }, [activeShotId, loadGenerations]);

  if (!hydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-[#333] text-xs">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      <Header
        onNewProject={() => setShowNewProject(true)}
        onImportProject={() => setShowImport(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar onNewProject={() => setShowNewProject(true)} />

        <div className="flex flex-1 overflow-hidden flex-col">
          <div className="flex flex-1 overflow-hidden border-b border-[#111]">
            <div className="w-48 border-r border-[#111] overflow-hidden flex flex-col shrink-0">
              <AssetLibrary projectId={activeProjectId} />
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <PreviewPanel projectId={activeProjectId} />
            </div>

            <div className="w-64 border-l border-[#111] overflow-hidden flex flex-col shrink-0">
              <Inspector projectId={activeProjectId} />
            </div>
          </div>

          <div className="h-24 border-t border-[#111] overflow-hidden">
            <ShotTimeline projectId={activeProjectId} />
          </div>
        </div>
      </div>

      <NewProjectDialog open={showNewProject} onClose={() => setShowNewProject(false)} />
      <ImportProjectDialog open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
