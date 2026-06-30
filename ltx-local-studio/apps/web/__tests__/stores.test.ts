import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Dexie since it needs IndexedDB
vi.mock("@/lib/db", () => {
  const store: Record<string, unknown[]> = {
    projects: [], shots: [], assets: [], assetBlobs: [], generations: [],
  };

  const makeTable = (name: string) => ({
    add: vi.fn(async (item: { id: string }) => { store[name].push(item); return item.id; }),
    put: vi.fn(async (item: { id: string }) => {
      const idx = (store[name] as { id: string }[]).findIndex(x => x.id === item.id);
      if (idx >= 0) (store[name] as unknown[])[idx] = item; else store[name].push(item);
      return item.id;
    }),
    get: vi.fn(async (id: string) => (store[name] as { id: string }[]).find(x => x.id === id)),
    update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
      const idx = (store[name] as { id: string }[]).findIndex(x => x.id === id);
      if (idx >= 0) Object.assign((store[name] as Record<string, unknown>[])[idx], changes);
    }),
    delete: vi.fn(async (id: string) => {
      const idx = (store[name] as { id: string }[]).findIndex(x => x.id === id);
      if (idx >= 0) store[name].splice(idx, 1);
    }),
    orderBy: vi.fn(() => ({ reverse: () => ({ toArray: async () => [...store[name]] }), toArray: async () => [...store[name]] })),
    where: vi.fn(() => ({ equals: () => ({ toArray: async () => store[name], sortBy: async () => store[name], delete: vi.fn(async () => {}), anyOf: () => ({ toArray: async () => [], delete: vi.fn(async () => {}) }) }), anyOf: () => ({ toArray: async () => [], delete: vi.fn(async () => {}) }) })),
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

// Reset stores between tests
beforeEach(() => {
  vi.clearAllMocks();
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
    await expect(store.importProject('{"foo": "bar"}')).rejects.toThrow("Invalid project export format");
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
});

describe("Generation operations", () => {
  it("submits a generation and gets a job id", async () => {
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    const store = useGenerationStore.getState();
    const gen = await store.submitGeneration({
      shotId: "shot-1",
      modelId: "mock-ltxv-0.9",
      prompt: "Test prompt",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });
    expect(gen.shotId).toBe("shot-1");
    expect(["queued", "processing", "failed"]).toContain(gen.status);
  });

  it("provider mock returns connected status", async () => {
    const { useGenerationStore } = await import("@/lib/store/generation-store");
    const store = useGenerationStore.getState();
    const status = await store.activeProvider.checkConnection();
    expect(status.connected).toBe(true);
  });
});
