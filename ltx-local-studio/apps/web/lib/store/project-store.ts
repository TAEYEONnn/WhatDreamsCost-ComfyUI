import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Project, AspectRatio, Shot, Asset } from "@ltx-studio/shared-types";
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
  exportProject: (id: string) => Promise<string>;
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
    const generations = await db.generations.where("shotId").anyOf(shotIds.length ? shotIds : [""]).toArray();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), project, shots, assets, generations }, null, 2);
  },

  importProject: async (json) => {
    let data: { project?: Project; shots?: Shot[]; assets?: Asset[] };
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error("Invalid JSON");
    }
    if (!data.project?.id || !data.project?.name) {
      throw new Error("Invalid project export format");
    }
    const now = new Date().toISOString();
    const project: Project = { ...data.project, createdAt: now, updatedAt: now };
    const db = getDb();
    await db.transaction("rw", [db.projects, db.shots, db.assets], async () => {
      await db.projects.put(project);
      for (const shot of data.shots ?? []) await db.shots.put(shot);
      for (const asset of data.assets ?? []) await db.assets.put(asset);
    });
    set((s) => ({ projects: [project, ...s.projects.filter((p) => p.id !== project.id)], activeProjectId: project.id }));
    return project;
  },
}));
