/**
 * Unit tests for ComfyUIWsTracker.
 *
 * Uses a MockWs that implements WsLike so no real WebSocket server is needed.
 * All tests call tracker.stop() in afterEach to prevent open timer handles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ComfyUIWsTracker } from "../providers/comfyui-ws-tracker";
import type { WsLike, WsFactory } from "../providers/comfyui-ws-tracker";

// ─── MockWs ──────────────────────────────────────────────────────────────────

class MockWs implements WsLike {
  closed = false;
  private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
    return this;
  }

  close(): void {
    this.closed = true;
    this._emit("close");
  }

  _emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners[event] ?? []) fn(...args);
  }

  simulateOpen(): void { this._emit("open"); }
  simulateClose(): void { this._emit("close"); }
  simulateError(err: Error): void { this._emit("error", err); }
  simulateMessage(msg: unknown): void {
    this._emit("message", JSON.stringify(msg));
  }
}

function makeSingleFactory(): { factory: WsFactory; ws: MockWs } {
  const ws = new MockWs();
  return { factory: () => ws, ws };
}

function makeMultiFactory(): { factory: WsFactory; connections: MockWs[] } {
  const connections: MockWs[] = [];
  return {
    factory: () => {
      const ws = new MockWs();
      connections.push(ws);
      return ws;
    },
    connections,
  };
}

// ─── Progress mapping ─────────────────────────────────────────────────────────

describe("ComfyUIWsTracker — progress & stage mapping", () => {
  let tracker: ComfyUIWsTracker;

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    tracker?.stop();
    vi.useRealTimers();
  });

  it("registerJob sets progress=8, stage='queued'", () => {
    const { factory } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-1");
    expect(tracker.getProgress("p-1")?.progress).toBe(8);
    expect(tracker.getProgress("p-1")?.stage).toBe("queued");
  });

  it("execution_start sets progress=12, stage='preparing'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-2");
    ws.simulateMessage({ type: "execution_start", data: { prompt_id: "p-2" } });
    expect(tracker.getProgress("p-2")?.progress).toBe(12);
    expect(tracker.getProgress("p-2")?.stage).toBe("preparing");
  });

  it("progress event on node 72 maps value/max to 15-90%, stage='sampling'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-3");
    ws.simulateMessage({ type: "progress", data: { prompt_id: "p-3", node: "72", value: 15, max: 30 } });
    // 15 + round(15/30 * 75) = 15 + 38 = 53
    expect(tracker.getProgress("p-3")?.progress).toBe(53);
    expect(tracker.getProgress("p-3")?.stage).toBe("sampling");
  });

  it("progress event on node 72: value=1, max=30 gives 18%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-4");
    ws.simulateMessage({ type: "progress", data: { prompt_id: "p-4", node: "72", value: 1, max: 30 } });
    // 15 + round(1/30 * 75) = 15 + round(2.5) = 18
    expect(tracker.getProgress("p-4")?.progress).toBe(18);
  });

  it("progress event on node 72: value=30, max=30 gives 90%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-5");
    ws.simulateMessage({ type: "progress", data: { prompt_id: "p-5", node: "72", value: 30, max: 30 } });
    expect(tracker.getProgress("p-5")?.progress).toBe(90);
  });

  it("progress event on non-sampler node is ignored", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-6");
    ws.simulateMessage({ type: "progress", data: { prompt_id: "p-6", node: "8", value: 5, max: 10 } });
    expect(tracker.getProgress("p-6")?.progress).toBe(8); // unchanged
  });

  it("executing node 72 sets progress=15, stage='sampling'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-7a");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-7a", node: "72" } });
    expect(tracker.getProgress("p-7a")?.progress).toBe(15);
    expect(tracker.getProgress("p-7a")?.stage).toBe("sampling");
  });

  it("executing node 8 (VAEDecode) sets progress=93, stage='decoding'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-7");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-7", node: "8" } });
    expect(tracker.getProgress("p-7")?.progress).toBe(93);
    expect(tracker.getProgress("p-7")?.stage).toBe("decoding");
  });

  it("executing node 80 (CreateVideo) sets progress=96, stage='encoding'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-8");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-8", node: "80" } });
    expect(tracker.getProgress("p-8")?.progress).toBe(96);
    expect(tracker.getProgress("p-8")?.stage).toBe("encoding");
  });

  it("executing node 81 (SaveVideo) sets progress=98, stage='saving'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-9");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-9", node: "81" } });
    expect(tracker.getProgress("p-9")?.progress).toBe(98);
    expect(tracker.getProgress("p-9")?.stage).toBe("saving");
  });

  it("execution_success sets progress=100, stage='completed'", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-10");
    ws.simulateMessage({ type: "execution_success", data: { prompt_id: "p-10" } });
    expect(tracker.getProgress("p-10")?.progress).toBe(100);
    expect(tracker.getProgress("p-10")?.stage).toBe("completed");
  });

  it("progress never goes backward", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-11");
    ws.simulateMessage({ type: "progress", data: { prompt_id: "p-11", node: "72", value: 30, max: 30 } });
    expect(tracker.getProgress("p-11")?.progress).toBe(90);
    // Lower value — should be ignored
    ws.simulateMessage({ type: "progress", data: { prompt_id: "p-11", node: "72", value: 1, max: 30 } });
    expect(tracker.getProgress("p-11")?.progress).toBe(90);
  });

  it("events for a different promptId do not affect other jobs", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("job-A");
    tracker.registerJob("job-B");
    ws.simulateMessage({ type: "progress", data: { prompt_id: "job-A", node: "72", value: 20, max: 30 } });
    expect(tracker.getProgress("job-B")?.progress).toBe(8); // unchanged
    expect(tracker.getProgress("job-A")!.progress).toBeGreaterThan(8);
  });

  it("unknown promptId event does not throw", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    expect(() => {
      ws.simulateMessage({ type: "progress", data: { prompt_id: "unknown-id", node: "72", value: 5, max: 10 } });
    }).not.toThrow();
  });

  it("malformed JSON message is silently ignored", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    expect(() => { ws._emit("message", "{ not json }"); }).not.toThrow();
  });
});

// ─── markCompleted ────────────────────────────────────────────────────────────

describe("ComfyUIWsTracker — markCompleted", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("forces progress=100, stage='completed' regardless of current value", () => {
    vi.useFakeTimers();
    const { factory } = makeSingleFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    tracker.registerJob("p-done");
    tracker.markCompleted("p-done");
    expect(tracker.getProgress("p-done")?.progress).toBe(100);
    expect(tracker.getProgress("p-done")?.stage).toBe("completed");
    tracker.stop();
  });
});

// ─── Reconnection ─────────────────────────────────────────────────────────────

describe("ComfyUIWsTracker — reconnection", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("reconnects after close with exponential backoff", async () => {
    vi.useFakeTimers();
    const { factory, connections } = makeMultiFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    expect(connections).toHaveLength(1);

    connections[0].simulateClose();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(connections).toHaveLength(2);

    connections[1].simulateClose();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(connections).toHaveLength(2); // still waiting for 2 s
    await vi.advanceTimersByTimeAsync(700);
    expect(connections).toHaveLength(3);

    tracker.stop();
  });

  it("resets backoff to 1 s after successful open", async () => {
    vi.useFakeTimers();
    const { factory, connections } = makeMultiFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    connections[0].simulateClose();
    await vi.advanceTimersByTimeAsync(1_100);
    connections[1].simulateClose();
    await vi.advanceTimersByTimeAsync(2_100);
    expect(connections).toHaveLength(3);

    connections[2].simulateOpen(); // reset backoff
    connections[2].simulateClose();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(connections).toHaveLength(4);
    tracker.stop();
  });

  it("stop() prevents further reconnections", async () => {
    vi.useFakeTimers();
    const { factory, connections } = makeMultiFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();
    connections[0].simulateClose();
    tracker.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(connections).toHaveLength(1);
  });

  it("factory throwing is handled gracefully", async () => {
    vi.useFakeTimers();
    const throwingFactory: WsFactory = () => { throw new Error("no ws"); };
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", throwingFactory);
    expect(() => tracker.start()).not.toThrow();
    await vi.advanceTimersByTimeAsync(1_100);
    tracker.stop();
  });
});

// ─── Stage label consistency ──────────────────────────────────────────────────

describe("ComfyUIWsTracker — stage and progress consistency", () => {
  // Verify that the stage values match the expected progress range (not a unit
  // test of UI logic, but a contract test between tracker and the expected labels).
  afterEach(() => { vi.useRealTimers(); });

  const STAGE_PROGRESS_MAP = [
    { stage: "queued",   progress: 8  },
    { stage: "preparing",progress: 12 },
    { stage: "sampling", progress: 53 }, // example mid-point
    { stage: "decoding", progress: 93 },
    { stage: "encoding", progress: 96 },
    { stage: "saving",   progress: 98 },
    { stage: "completed",progress: 100},
  ] as const;

  for (const { stage, progress } of STAGE_PROGRESS_MAP) {
    it(`progress ${progress}% maps to stage '${stage}'`, () => {
      vi.useFakeTimers();
      const { factory, ws } = makeSingleFactory();
      const tracker = new ComfyUIWsTracker("http://localhost:8188", "t", factory);
      tracker.start();

      const pid = `p-${stage}`;
      tracker.registerJob(pid);

      // Drive to the expected stage
      if (stage === "preparing") {
        ws.simulateMessage({ type: "execution_start", data: { prompt_id: pid } });
      } else if (stage === "sampling") {
        ws.simulateMessage({ type: "progress", data: { prompt_id: pid, node: "72", value: 15, max: 30 } });
      } else if (stage === "decoding") {
        ws.simulateMessage({ type: "executing", data: { prompt_id: pid, node: "8" } });
      } else if (stage === "encoding") {
        ws.simulateMessage({ type: "executing", data: { prompt_id: pid, node: "80" } });
      } else if (stage === "saving") {
        ws.simulateMessage({ type: "executing", data: { prompt_id: pid, node: "81" } });
      } else if (stage === "completed") {
        ws.simulateMessage({ type: "execution_success", data: { prompt_id: pid } });
      }
      // "queued" is the initial state from registerJob — no event needed

      const state = tracker.getProgress(pid);
      expect(state?.stage).toBe(stage);
      expect(state?.progress).toBe(progress);

      tracker.stop();
      vi.useRealTimers();
    });
  }
});
