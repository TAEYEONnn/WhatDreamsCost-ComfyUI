import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Project, AspectRatio } from "@ltx-studio/shared-types";
import { ProjectExportSchema } from "@ltx-studio/shared-types";
import { getDb } from "../db";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  loadProjects: () => Promise<void>;
  createProject: (name: string, aspectRatio?: AspectRatio) => Promise<Project>;
  updateProject: (id: string, changes: Partial<Pick<Project, "name" | "aspectRatio">>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  exportProject: (id: string) => Promise<void>;
  importProject: (json: string) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  isLoading: false,

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const db = getDb();
      const projects = await db.projects.orderBy("updatedAt").reverse().toArray();
      set({ projects });
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (name, aspectRatio = "16:9") => {
    const now = new Date().toISOString();
    const project: Project = {
      id: uuidv4(),
      name,
      aspectRatio,
      shotIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const db = getDb();
    await db.projects.add(project);
    set((s) => ({ projects: [project, ...s.projects], activeProjectId: project.id }));
    return project;
  },

  updateProject: async (id, changes) => {
    const now = new Date().toISOString();
    const db = getDb();
    await db.projects.update(id, { ...changes, updatedAt: now });
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, ...changes, updatedAt: now } : p
      ),
    }));
  },

  deleteProject: async (id) => {
    const db = getDb();
    await db.transaction("rw", [db.projects, db.shots, db.assets, db.generations, db.assetBlobs], async () => {
      const shots = await db.shots.where("projectId").equals(id).toArray();
      const shotIds = shots.map((s) => s.id);
      const assets = await db.assets.where("projectId").equals(id).toArray();
      const assetIds = assets.map((a) => a.id);
      await db.generations.where("shotId").anyOf(shotIds).delete();
      await db.shots.where("projectId").equals(id).delete();
      await db.assetBlobs.where("id").anyOf(assetIds).delete();
      await db.assets.where("projectId").equals(id).delete();
      await db.projects.delete(id);
    });
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      return {
        projects,
        activeProjectId: s.activeProjectId === id ? (projects[0]?.id ?? null) : s.activeProjectId,
      };
    });
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  exportProject: async (id) => {
    const db = getDb();
    const project = await db.projects.get(id);
    if (!project) throw new Error("Project not found");
    const shots = await db.shots.where("projectId").equals(id).toArray();
    const assets = await db.assets.where("projectId").equals(id).toArray();
    const shotIds = shots.map((s) => s.id);
    const generations = await db.generations
      .where("shotId")
      .anyOf(shotIds.length ? shotIds : [""])
      .toArray();

    const payload = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      project,
      shots,
      assets,
      generations,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importProject: async (json) => {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("잘못된 JSON 형식입니다.");
    }

    const parsed = ProjectExportSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("프로젝트 내보내기 형식이 올바르지 않습니다.");
    }

    const data = parsed.data;
    const now = new Date().toISOString();

    const projectId = uuidv4();
    const shotIdMap = new Map<string, string>(data.shots.map((s) => [s.id, uuidv4()]));
    const assetIdMap = new Map<string, string>(data.assets.map((a) => [a.id, uuidv4()]));
    const genIdMap = new Map<string, string>(data.generations.map((g) => [g.id, uuidv4()]));

    const remapAssetId = (id?: string) =>
      id ? (assetIdMap.get(id) ?? id) : undefined;

    const project: Project = {
      ...data.project,
      id: projectId,
      shotIds: data.project.shotIds.map((id) => shotIdMap.get(id) ?? id),
      createdAt: now,
      updatedAt: now,
    };

    const shots = data.shots.map((s) => ({
      ...s,
      id: shotIdMap.get(s.id) ?? s.id,
      projectId,
      startFrameAssetId: remapAssetId(s.startFrameAssetId),
      endFrameAssetId: remapAssetId(s.endFrameAssetId),
      referenceAssetIds: s.referenceAssetIds.map((id) => assetIdMap.get(id) ?? id),
      selectedGenerationId: s.selectedGenerationId
        ? (genIdMap.get(s.selectedGenerationId) ?? s.selectedGenerationId)
        : undefined,
    }));

    const assets = data.assets.map((a) => ({
      ...a,
      id: assetIdMap.get(a.id) ?? a.id,
      projectId,
    }));

    const generations = data.generations.map((g) => ({
      ...g,
      id: genIdMap.get(g.id) ?? g.id,
      shotId: shotIdMap.get(g.shotId) ?? g.shotId,
      parentGenerationId: g.parentGenerationId
        ? (genIdMap.get(g.parentGenerationId) ?? g.parentGenerationId)
        : undefined,
    }));

    const db = getDb();
    await db.transaction("rw", [db.projects, db.shots, db.assets, db.generations], async () => {
      await db.projects.put(project);
      for (const shot of shots) await db.shots.put(shot);
      for (const asset of assets) await db.assets.put(asset);
      for (const gen of generations) await db.generations.put(gen);
    });

    set((s) => ({
      projects: [project, ...s.projects],
      activeProjectId: project.id,
    }));
    return project;
  },
}));
