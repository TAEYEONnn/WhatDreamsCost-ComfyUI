import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock fetch for API route calls in generation-store
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Dexie since it needs IndexedDB
vi.mock("@/lib/db", () => {
  const store: Record<string, unknown[]> = {
    projects: [],
    shots: [],
    assets: [],
    assetBlobs: [],
    generations: [],
  };

  const makeTable = (name: string) => ({
    add: vi.fn(async (item: { id: string }) => {
      store[name].push(item);
      return item.id;
    }),
    put: vi.fn(async (item: { id: string }) => {
      const idx = (store[name] as { id: string }[]).findIndex((x) => x.id === item.id);
      if (idx >= 0) (store[name] as unknown[])[idx] = item;
      else store[name].push(item);
      return item.id;
    }),
    get: vi.fn(async (id: string) =>
      (store[name] as { id: string }[]).find((x) => x.id === id)
    ),
    update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
      const idx = (store[name] as { id: string }[]).findIndex((x) => x.id === id);
      if (idx >= 0) Object.assign((store[name] as Record<string, unknown>[])[idx], changes);
    }),
    delete: vi.fn(async (id: string) => {
      const idx = (store[name] as { id: string }[]).findIndex((x) => x.id === id);
      if (idx >= 0) store[name].splice(idx, 1);
    }),
    orderBy: vi.fn(() => ({
      reverse: () => ({
        toArray: async () => [...store[name]],
      }),
      toArray: async () => [...store[name]],
    })),
    where: vi.fn(() => ({
      equals: () => ({
        toArray: async () => store[name],
        sortBy: async () => store[name],
        delete: vi.fn(async () => {}),
        reverse: () => ({ toArray: async () => [...store[name]] }),
        anyOf: () => ({ toArray: async () => [], delete: vi.fn(async () => {}) }),
      }),
      anyOf: () => ({ toArray: async () => [], delete: vi.fn(async () => {}) }),
    })),
    reverse: vi.fn(() => ({ toArray: async () => [...store[name]] })),
  });

  return {
    getDb: vi.fn(() => ({
      projects: makeTable("projects"),
      shots: makeTable("shots"),
      assets: makeTable("assets"),
      assetBlobs: makeTable("assetBlobs"),
      generations: makeTable("generations"),
      transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default fetch mock: provider status endpoint
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes("/api/providers/status")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          providerId: "mock",
          providerName: "Mock Provider",
          connected: true,
          latencyMs: 1,
        }),
      });
    }
    if (String(url).includes("/api/generations")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ providerJobId: "mock-job-123" }),
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({ error: "not found" }) });
  });
});

describe("Project operations", () => {
  it("creates a project with correct defaults", async () => {
    const { useProjectStore } = await import("@/lib/store/project-store");
    const store = useProjectStore.getState();
    const project = await store.createProject("Test Project", "16:9");
    expect(project.name).toBe("Test Project");
    expect(project.aspectRatio).toBe("16:9");
    expect(project.id).toBeTruthy();
    expect(project.shotIds).toEqual([]);
  });

  it("rejects import of invalid JSON", async () => {
    const { useProjectStore } = await import("@/lib/store/project-store");
    const store = useProjectStore.getState();
    await expect(store.importProject("not valid json")).rejects.toThrow();
  });

  it("rejects import of invalid project format", async () => {
    const { useProjectStore } = await import("@/lib/store/project-store");
    const store = useProjectStore.getState();
    await expect(store.importProject('{"foo": "bar"}')).rejects.toThrow();
  });
});

describe("Shot operations", () => {
  it("creates a shot with correct defaults", async () => {
    const { useShotStore } = await import("@/lib/store/shot-store");
    const store = useShotStore.getState();
    const shot = await store.createShot("project-1");
    expect(shot.projectId).toBe("project-1");
    expect(shot.durationSeconds).toBe(5);
    expect(shot.aspectRatio).toBe("16:9");
    expect(shot.referenceAssetIds).toEqual([]);
  });
});

describe("Asset operations", () => {
  it("uploads an image asset", async () => {
    const { useAssetStore } = await import("@/lib/store/asset-store");
    const store = useAssetStore.getState();
    const file = new File(["data"], "test.png", { type: "image/png" });
    const asset = await store.uploadAsset("project-1", file, "reference");
    expect(asset.kind).toBe("image");
    expect(asset.role).toBe("reference");
    expect(asset.name).toBe("test.png");
  });

  it("rejects unsupported mime types", async () => {
    const { useAssetStore } = await import("@/lib/store/asset-store");
    const store = useAssetStore.getState();
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    await expect(store.uploadAsset("project-1", file)).rejects.toThrow("지원하지 않는");
  });
});

describe("Generation operations", () => {
  it("submits a generation via API and gets a job id", async () => {
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    const store = useGenerationStore.getState();
    const gen = await store.submitGeneration({
      shotId: "shot-1",
      providerId: "mock",
      modelId: "mock-ltxv-0.9",
      prompt: "Test prompt",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });
    expect(gen.shotId).toBe("shot-1");
    expect(["queued", "failed"]).toContain(gen.status);
  });

  it("checkProviderStatus updates store state", async () => {
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    const store = useGenerationStore.getState();
    await store.checkProviderStatus();
    const { providerStatus } = useGenerationStore.getState();
    expect(providerStatus.connected).toBe(true);
    expect(providerStatus.checking).toBe(false);
  });
});

describe("Generation — startFrameData resolution", () => {
  // Helper: capture the POST body sent to /api/generations
  function captureGenerationPost(): { body: Record<string, unknown> | undefined } {
    const captured: { body: Record<string, unknown> | undefined } = { body: undefined };
    mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/providers/status")) {
        return { ok: true, json: async () => ({ providerId: "comfyui", providerName: "ComfyUI", connected: true }) };
      }
      if (u.includes("/api/generations")) {
        captured.body = JSON.parse((opts?.body as string) ?? "{}") as Record<string, unknown>;
        return { ok: true, json: async () => ({ providerJobId: "job-ok" }) };
      }
      return { ok: false, json: async () => ({ error: "not found" }) };
    });
    return captured;
  }

  it("resolves startFrameAssetId to data: URL in POST body", async () => {
    const { useAssetStore } = await import("@/lib/store/asset-store");
    const assetStore = useAssetStore.getState();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "frame.png", {
      type: "image/png",
    });
    const asset = await assetStore.uploadAsset("project-1", file, "reference");

    const captured = captureGenerationPost();
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    await useGenerationStore.getState().submitGeneration({
      shotId: "shot-1",
      providerId: "comfyui",
      modelId: "ltxv-0.9.5",
      prompt: "test",
      durationSeconds: 4,
      aspectRatio: "16:9",
      startFrameAssetId: asset.id,
    });

    expect(typeof captured.body?.startFrameData).toBe("string");
    expect(captured.body?.startFrameData as string).toMatch(/^data:image\/png;base64,/);
  });

  it("auto-promotes first image referenceAssetId when no startFrameAssetId", async () => {
    const { useAssetStore } = await import("@/lib/store/asset-store");
    const assetStore = useAssetStore.getState();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "ref.png", {
      type: "image/png",
    });
    const asset = await assetStore.uploadAsset("project-2", file, "reference");

    const captured = captureGenerationPost();
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    await useGenerationStore.getState().submitGeneration({
      shotId: "shot-2",
      providerId: "comfyui",
      modelId: "ltxv-0.9.5",
      prompt: "fallback test",
      durationSeconds: 4,
      aspectRatio: "16:9",
      referenceAssetIds: [asset.id],
      // no startFrameAssetId
    });

    expect(captured.body?.startFrameData as string).toMatch(/^data:image\/png;base64,/);
  });

  it("sends no startFrameData when no image asset is set", async () => {
    const captured = captureGenerationPost();
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    await useGenerationStore.getState().submitGeneration({
      shotId: "shot-3",
      providerId: "comfyui",
      modelId: "ltxv-0.9.5",
      prompt: "no image",
      durationSeconds: 4,
      aspectRatio: "16:9",
    });

    // startFrameData should be absent (not a blob URL, not a string)
    expect(captured.body?.startFrameData).toBeUndefined();
  });

  it("does not promote a non-image referenceAssetId to startFrameData", async () => {
    const { useAssetStore } = await import("@/lib/store/asset-store");
    const assetStore = useAssetStore.getState();
    const videoFile = new File([new Uint8Array([0, 0, 0])], "clip.mp4", {
      type: "video/mp4",
    });
    const videoAsset = await assetStore.uploadAsset("project-3", videoFile, "reference");

    const captured = captureGenerationPost();
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    await useGenerationStore.getState().submitGeneration({
      shotId: "shot-4",
      providerId: "comfyui",
      modelId: "ltxv-0.9.5",
      prompt: "video ref test",
      durationSeconds: 4,
      aspectRatio: "16:9",
      referenceAssetIds: [videoAsset.id],
    });

    // Video blob should NOT be promoted to startFrameData
    expect(captured.body?.startFrameData).toBeUndefined();
  });
});

describe("Generation — polling lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts polling after successful submitGeneration", async () => {
    let statusCallCount = 0;
    mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/providers/status")) {
        return { ok: true, json: async () => ({ providerId: "comfyui", providerName: "ComfyUI", connected: true }) };
      }
      if (u.includes("/api/generations") && opts?.method === "POST") {
        return { ok: true, json: async () => ({ providerJobId: "poll-job-1" }) };
      }
      if (u.includes("/api/generations/poll-job-1")) {
        statusCallCount++;
        return {
          ok: true,
          json: async () => ({ status: "processing", progress: 50 }),
        };
      }
      return { ok: false, json: async () => ({ error: "not found" }) };
    });

    const { useGenerationStore } = await import("@/lib/store/generation-store");
    await useGenerationStore.getState().submitGeneration({
      shotId: "shot-poll-1",
      providerId: "comfyui",
      modelId: "ltxv-0.9.5",
      prompt: "polling test",
      durationSeconds: 4,
      aspectRatio: "16:9",
    });

    // Advance past first poll interval (1000 ms)
    await vi.advanceTimersByTimeAsync(1_100);
    expect(statusCallCount).toBeGreaterThanOrEqual(1);

    // Stop all polling to clean up
    const state = useGenerationStore.getState();
    state.pollingIntervals.forEach((_, id) => state._stopPolling(id));
  });

  it("stops polling when generation status becomes completed", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/providers/status")) {
        return { ok: true, json: async () => ({ providerId: "comfyui", connected: true }) };
      }
      if (u.includes("/api/generations") && opts?.method === "POST") {
        return { ok: true, json: async () => ({ providerJobId: "poll-job-2" }) };
      }
      if (u.includes("/api/generations/poll-job-2")) {
        callCount++;
        return {
          ok: true,
          json: async () => ({ status: "completed", progress: 100, outputUrl: "/api/comfyui-proxy/video?filename=out.mp4" }),
        };
      }
      return { ok: false, json: async () => ({ error: "not found" }) };
    });

    const { useGenerationStore } = await import("@/lib/store/generation-store");
    await useGenerationStore.getState().submitGeneration({
      shotId: "shot-poll-2",
      providerId: "comfyui",
      modelId: "ltxv-0.9.5",
      prompt: "completion test",
      durationSeconds: 4,
      aspectRatio: "16:9",
    });

    // First poll — completes
    await vi.advanceTimersByTimeAsync(1_100);
    const firstCallCount = callCount;

    // Advance further — should not poll again since completed
    await vi.advanceTimersByTimeAsync(3_000);
    expect(callCount).toBe(firstCallCount); // no more calls after completion
  });
});
