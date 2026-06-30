import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Shot } from "@ltx-studio/shared-types";
import { getDb } from "../db";

interface ShotState {
  shots: Shot[];
  activeShotId: string | null;
  loadShots: (projectId: string) => Promise<void>;
  createShot: (projectId: string) => Promise<Shot>;
  duplicateShot: (shotId: string) => Promise<Shot>;
  updateShot: (id: string, changes: Partial<Omit<Shot, "id" | "projectId">>) => Promise<void>;
  deleteShot: (id: string) => Promise<void>;
  reorderShots: (projectId: string, orderedIds: string[]) => Promise<void>;
  setActiveShot: (id: string | null) => void;
}

export const useShotStore = create<ShotState>((set, get) => ({
  shots: [],
  activeShotId: null,

  loadShots: async (projectId) => {
    const db = getDb();
    const shots = await db.shots.where("projectId").equals(projectId).sortBy("order");
    set({ shots });
  },

  createShot: async (projectId) => {
    const shots = get().shots.filter((s) => s.projectId === projectId);
    const shot: Shot = {
      id: uuidv4(),
      projectId,
      name: `Shot ${shots.length + 1}`,
      order: shots.length,
      prompt: "",
      durationSeconds: 5,
      aspectRatio: "16:9",
      referenceAssetIds: [],
    };
    const db = getDb();
    await db.shots.add(shot);
    await db.projects.update(projectId, {
      shotIds: [...shots.map((s) => s.id), shot.id],
      updatedAt: new Date().toISOString(),
    });
    set((s) => ({ shots: [...s.shots, shot], activeShotId: shot.id }));
    return shot;
  },

  duplicateShot: async (shotId) => {
    const source = get().shots.find((s) => s.id === shotId);
    if (!source) throw new Error("Shot not found");
    const shots = get().shots.filter((s) => s.projectId === source.projectId);
    const shot: Shot = {
      ...source,
      id: uuidv4(),
      name: `${source.name} (copy)`,
      order: shots.length,
      selectedGenerationId: undefined,
    };
    const db = getDb();
    await db.shots.add(shot);
    const project = await db.projects.get(source.projectId);
    if (project) {
      const existingIds = project.shotIds?.length
        ? project.shotIds
        : shots.map((s) => s.id);
      await db.projects.update(source.projectId, {
        shotIds: [...existingIds, shot.id],
        updatedAt: new Date().toISOString(),
      });
    }
    set((s) => ({ shots: [...s.shots, shot], activeShotId: shot.id }));
    return shot;
  },

  updateShot: async (id, changes) => {
    const db = getDb();
    await db.shots.update(id, changes);
    set((s) => ({
      shots: s.shots.map((sh) => (sh.id === id ? { ...sh, ...changes } : sh)),
    }));
  },

  deleteShot: async (id) => {
    const shot = get().shots.find((s) => s.id === id);
    const db = getDb();
    await db.shots.delete(id);
    await db.generations.where("shotId").equals(id).delete();
    if (shot) {
      const project = await db.projects.get(shot.projectId);
      if (project) {
        await db.projects.update(shot.projectId, {
          shotIds: (project.shotIds ?? []).filter((sid) => sid !== id),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    set((s) => {
      const shots = s.shots.filter((sh) => sh.id !== id);
      return { shots, activeShotId: s.activeShotId === id ? (shots[0]?.id ?? null) : s.activeShotId };
    });
  },

  reorderShots: async (projectId, orderedIds) => {
    const db = getDb();
    await db.transaction("rw", [db.shots, db.projects], async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.shots.update(orderedIds[i], { order: i });
      }
      await db.projects.update(projectId, {
        shotIds: orderedIds,
        updatedAt: new Date().toISOString(),
      });
    });
    set((s) => ({
      shots: s.shots
        .map((sh) => {
          const idx = orderedIds.indexOf(sh.id);
          return idx >= 0 ? { ...sh, order: idx } : sh;
        })
        .sort((a, b) => a.order - b.order),
    }));
  },

  setActiveShot: (id) => set({ activeShotId: id }),
}));
