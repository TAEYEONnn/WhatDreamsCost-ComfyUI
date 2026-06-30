import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Generation, GenerationStatus } from "@ltx-studio/shared-types";
import { getDb } from "../db";
import { MockVideoProvider } from "@ltx-studio/generation-core";
import type { VideoGenerationProvider, VideoGenerationInput } from "@ltx-studio/generation-core";

interface GenerationState {
  generations: Generation[];
  activeProvider: VideoGenerationProvider;
  pollingIntervals: Map<string, ReturnType<typeof setInterval>>;
  loadGenerations: (shotId: string) => Promise<void>;
  submitGeneration: (input: Omit<VideoGenerationInput, "generationId">) => Promise<Generation>;
  cancelGeneration: (generationId: string) => Promise<void>;
  retryGeneration: (generationId: string) => Promise<Generation>;
  setProvider: (provider: VideoGenerationProvider) => void;
  _poll: (generationId: string, providerJobId: string) => void;
  _stopPolling: (generationId: string) => void;
  _updateGeneration: (id: string, changes: Partial<Generation>) => Promise<void>;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  generations: [],
  activeProvider: new MockVideoProvider(),
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

  submitGeneration: async (input) => {
    const provider = get().activeProvider;
    const now = new Date().toISOString();
    const generation: Generation = {
      id: uuidv4(),
      shotId: input.shotId,
      providerId: provider.id,
      modelId: input.modelId,
      status: "queued",
      progress: 0,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      seed: input.seed,
      createdAt: now,
    };

    const db = getDb();
    await db.generations.add(generation);
    set((s) => ({ generations: [generation, ...s.generations] }));

    try {
      const submission = await provider.submitGeneration({ ...input, generationId: generation.id });
      const updated = { ...generation, providerJobId: submission.providerJobId };
      await get()._updateGeneration(generation.id, { providerJobId: submission.providerJobId });
      get()._poll(generation.id, submission.providerJobId);
      return updated;
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
    const provider = get().activeProvider;
    if (provider.cancelGeneration) {
      await provider.cancelGeneration(gen.providerJobId).catch(() => {});
    }
    get()._stopPolling(generationId);
    await get()._updateGeneration(generationId, { status: "cancelled" });
  },

  retryGeneration: async (generationId) => {
    const gen = get().generations.find((g) => g.id === generationId);
    if (!gen) throw new Error("Generation not found");
    return get().submitGeneration({
      shotId: gen.shotId,
      modelId: gen.modelId,
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt,
      seed: gen.seed,
      durationSeconds: 5,
      aspectRatio: "16:9",
      parentGenerationId: gen.id,
    } as Omit<VideoGenerationInput, "generationId"> & { parentGenerationId?: string });
  },

  setProvider: (provider) => set({ activeProvider: provider }),

  _poll: (generationId, providerJobId) => {
    const interval = setInterval(async () => {
      const provider = get().activeProvider;
      try {
        const result = await provider.getGenerationStatus(providerJobId);
        await get()._updateGeneration(generationId, {
          status: result.status as GenerationStatus,
          progress: result.progress,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
        if (["completed", "failed", "cancelled"].includes(result.status)) {
          get()._stopPolling(generationId);
        }
      } catch {
        // ignore transient errors
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
      generations: s.generations.map((g) => (g.id === id ? { ...g, ...changes } : g)),
    }));
  },
}));
