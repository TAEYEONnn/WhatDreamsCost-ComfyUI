import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Generation, GenerationStage, GenerationStatus } from "@ltx-studio/shared-types";
import { getDb } from "../db";

/**
 * Converts a Blob/File to a data URL (data:mime;base64,...).
 * Uses arrayBuffer() + btoa so it works in browsers and jsdom tests alike.
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

/**
 * Resolves an asset ID to a base64 data URL by reading its blob from IndexedDB.
 * Returns undefined if the asset does not exist or is not an image.
 */
async function resolveAssetToDataUrl(
  assetId: string
): Promise<string | undefined> {
  const db = getDb();
  const entry = await db.assetBlobs.get(assetId);
  if (!entry?.blob) return undefined;
  if (!entry.blob.type.startsWith("image/")) return undefined;
  return blobToDataUrl(entry.blob);
}

interface ProviderStatus {
  providerId: string;
  providerName: string;
  connected: boolean;
  latencyMs?: number;
  serverVersion?: string;
  error?: string;
  checking: boolean;
}

/** A pending stage waiting to be shown in the UI. */
export interface PendingStageEntry {
  stage: GenerationStage;
  progress: number;
}

interface GenerationState {
  generations: Generation[];
  providerStatus: ProviderStatus;
  pollingIntervals: Map<string, ReturnType<typeof setInterval>>;
  /**
   * In-memory queues of post-sampling stages (decoding/encoding/saving) that
   * the browser has not yet displayed. Not persisted to IndexedDB.
   */
  stageQueues: Map<string, PendingStageEntry[]>;
  /**
   * Tracks which stage names have already been enqueued per generationId,
   * so re-polls don't add the same stage twice.
   */
  seenStages: Map<string, Set<GenerationStage>>;
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
  /** Remove the first entry from the stage queue for a generation. */
  dequeueStage: (generationId: string) => void;
  _poll: (generationId: string, providerJobId: string) => void;
  _stopPolling: (generationId: string) => void;
  _clearStageQueue: (generationId: string) => void;
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
  stageQueues: new Map(),
  seenStages: new Map(),

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
      // Resolve the start frame image to a base64 data URL before sending to
      // the server. The server-side ComfyUI provider needs an actual data URL,
      // not a UUID or a blob: URL that only exists in this browser tab.
      let startFrameData: string | undefined;

      if (input.startFrameAssetId) {
        startFrameData = await resolveAssetToDataUrl(input.startFrameAssetId);
      }

      // Fallback: use first image in referenceAssetIds if no explicit start frame
      // Note: referenceAssetIds are NOT auto-promoted to startFrameData.
      // The UI enforces a single explicit start image via startFrameAssetId.

      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          generationId: generation.id,
          ...(startFrameData ? { startFrameData } : {}),
        }),
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
    get()._clearStageQueue(generationId);
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

  dequeueStage: (generationId) => {
    const q = get().stageQueues.get(generationId);
    if (!q?.length) return;
    const [, ...tail] = q;
    const sq = new Map(get().stageQueues);
    sq.set(generationId, tail);
    set({ stageQueues: sq });
  },

  _clearStageQueue: (generationId) => {
    const sq = new Map(get().stageQueues);
    const ss = new Map(get().seenStages);
    sq.delete(generationId);
    ss.delete(generationId);
    set({ stageQueues: sq, seenStages: ss });
  },

  _poll: (generationId, providerJobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${providerJobId}`);
        if (!res.ok) return;
        const result = (await res.json()) as {
          status: GenerationStatus;
          progress: number;
          stage?: Generation["stage"];
          outputUrl?: string;
          errorCode?: string;
          errorMessage?: string;
          pendingStages?: Array<{ stage: string; progress: number }>;
        };

        const changes: Partial<Generation> = {
          status: result.status,
          progress: result.progress,
          stage: result.stage,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        };
        if (result.outputUrl) changes.outputUrl = result.outputUrl;

        // Enqueue new post-sampling stage transitions for UI drain.
        if (result.pendingStages?.length) {
          const seen = get().seenStages.get(generationId) ?? new Set<GenerationStage>();
          const newEntries = result.pendingStages.filter(
            (s) => !seen.has(s.stage as GenerationStage)
          );
          if (newEntries.length > 0) {
            const sq = new Map(get().stageQueues);
            const existing = sq.get(generationId) ?? [];
            sq.set(generationId, [
              ...existing,
              ...newEntries.map((s) => ({
                stage: s.stage as GenerationStage,
                progress: s.progress,
              })),
            ]);
            const ss = new Map(get().seenStages);
            const updatedSeen = new Set(seen);
            for (const s of newEntries) updatedSeen.add(s.stage as GenerationStage);
            ss.set(generationId, updatedSeen);
            set({ stageQueues: sq, seenStages: ss });
          }
        }

        if (["completed", "failed", "cancelled"].includes(result.status)) {
          if (result.status === "completed") {
            changes.completedAt = new Date().toISOString();
          }
          // Clear queue on failure/cancel; keep queue for completed (drain continues after stop).
          if (result.status !== "completed") {
            get()._clearStageQueue(generationId);
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
