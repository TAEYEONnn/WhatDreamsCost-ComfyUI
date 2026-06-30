import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Generation, GenerationStatus } from "@ltx-studio/shared-types";
import { getDb } from "../db";

interface ProviderStatus {
  providerId: string;
  providerName: string;
  connected: boolean;
  latencyMs?: number;
  serverVersion?: string;
  error?: string;
  checking: boolean;
}

interface GenerationState {
  generations: Generation[];
  providerStatus: ProviderStatus;
  pollingIntervals: Map<string, ReturnType<typeof setInterval>>;
  loadGenerations: (shotId: string) => Promise<void>;
  checkProviderStatus: () => Promise<void>;
  submitGeneration: (
    input: Omit<
      Generation,
      | "id"
      | "status"
      | "progress"
      | "createdAt"
      | "providerJobId"
      | "outputUrl"
      | "outputAssetId"
      | "errorCode"
      | "errorMessage"
      | "completedAt"
    >
  ) => Promise<Generation>;
  cancelGeneration: (generationId: string) => Promise<void>;
  retryGeneration: (generationId: string) => Promise<Generation>;
  adoptGeneration: (generationId: string) => Promise<void>;
  _poll: (generationId: string, providerJobId: string) => void;
  _stopPolling: (generationId: string) => void;
  _updateGeneration: (id: string, changes: Partial<Generation>) => Promise<void>;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  generations: [],
  providerStatus: {
    providerId: "mock",
    providerName: "Mock Provider",
    connected: false,
    checking: true,
  },
  pollingIntervals: new Map(),

  loadGenerations: async (shotId) => {
    const db = getDb();
    const generations = await db.generations
      .where("shotId")
      .equals(shotId)
      .reverse()
      .toArray();
    set({ generations });
  },

  checkProviderStatus: async () => {
    set((s) => ({ providerStatus: { ...s.providerStatus, checking: true } }));
    try {
      const res = await fetch("/api/providers/status");
      const data = (await res.json()) as Omit<ProviderStatus, "checking">;
      set({ providerStatus: { ...data, checking: false } });
    } catch {
      set((s) => ({
        providerStatus: {
          ...s.providerStatus,
          connected: false,
          error: "연결 실패",
          checking: false,
        },
      }));
    }
  },

  submitGeneration: async (input) => {
    const now = new Date().toISOString();
    const generation: Generation = {
      id: uuidv4(),
      status: "queued",
      progress: 0,
      createdAt: now,
      ...input,
    };

    const db = getDb();
    await db.generations.add(generation);
    set((s) => ({ generations: [generation, ...s.generations] }));

    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, generationId: generation.id }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Submission failed");
      }
      const submission = (await res.json()) as { providerJobId: string };
      await get()._updateGeneration(generation.id, {
        providerJobId: submission.providerJobId,
      });
      get()._poll(generation.id, submission.providerJobId);
      return { ...generation, providerJobId: submission.providerJobId };
    } catch (err) {
      await get()._updateGeneration(generation.id, {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Submission failed",
      });
      return { ...generation, status: "failed" };
    }
  },

  cancelGeneration: async (generationId) => {
    const gen = get().generations.find((g) => g.id === generationId);
    if (!gen || !gen.providerJobId) return;
    get()._stopPolling(generationId);
    try {
      await fetch(`/api/generations/${gen.providerJobId}/cancel`, {
        method: "POST",
      });
    } catch {
      // best-effort
    }
    await get()._updateGeneration(generationId, { status: "cancelled" });
  },

  retryGeneration: async (generationId) => {
    const gen = get().generations.find((g) => g.id === generationId);
    if (!gen) throw new Error("Generation not found");
    return get().submitGeneration({
      shotId: gen.shotId,
      providerId: gen.providerId,
      modelId: gen.modelId,
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt,
      seed: gen.seed,
      durationSeconds: gen.durationSeconds,
      aspectRatio: gen.aspectRatio,
      cameraPresetId: gen.cameraPresetId,
      startFrameAssetId: gen.startFrameAssetId,
      endFrameAssetId: gen.endFrameAssetId,
      referenceAssetIds: gen.referenceAssetIds,
      parentGenerationId: gen.id,
    });
  },

  adoptGeneration: async (generationId) => {
    const gen = get().generations.find((g) => g.id === generationId);
    if (!gen || gen.status !== "completed") return;
    const db = getDb();
    await db.shots.update(gen.shotId, { selectedGenerationId: generationId });
    const { useShotStore } = await import("./shot-store");
    useShotStore.getState().updateShot(gen.shotId, {
      selectedGenerationId: generationId,
    });
  },

  _poll: (generationId, providerJobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${providerJobId}`);
        if (!res.ok) return;
        const result = (await res.json()) as {
          status: GenerationStatus;
          progress: number;
          outputUrl?: string;
          errorCode?: string;
          errorMessage?: string;
        };
        const changes: Partial<Generation> = {
          status: result.status,
          progress: result.progress,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        };
        if (result.outputUrl) changes.outputUrl = result.outputUrl;
        if (["completed", "failed", "cancelled"].includes(result.status)) {
          if (result.status === "completed") {
            changes.completedAt = new Date().toISOString();
          }
          get()._stopPolling(generationId);
        }
        await get()._updateGeneration(generationId, changes);
      } catch {
        // ignore transient polling errors
      }
    }, 1000);

    set((s) => {
      const m = new Map(s.pollingIntervals);
      m.set(generationId, interval);
      return { pollingIntervals: m };
    });
  },

  _stopPolling: (generationId) => {
    const interval = get().pollingIntervals.get(generationId);
    if (interval) clearInterval(interval);
    set((s) => {
      const m = new Map(s.pollingIntervals);
      m.delete(generationId);
      return { pollingIntervals: m };
    });
  },

  _updateGeneration: async (id, changes) => {
    const db = getDb();
    await db.generations.update(id, changes);
    set((s) => ({
      generations: s.generations.map((g) =>
        g.id === id ? { ...g, ...changes } : g
      ),
    }));
  },
}));
