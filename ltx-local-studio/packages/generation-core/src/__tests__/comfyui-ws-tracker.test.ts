/**
 * Unit tests for ComfyUIWsTracker.
 *
 * Uses a MockWs that implements WsLike so no real WebSocket server is needed.
 * All tests call tracker.stop() in afterEach to prevent open timer handles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ComfyUIWsTracker } from "../providers/comfyui-ws-tracker";
import type { WsLike, WsFactory } from "../providers/comfyui-ws-tracker";

// ─── MockWs — minimal EventEmitter-like WsLike implementation ────────────────

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
    for (const fn of this.listeners[event] ?? []) {
      fn(...args);
    }
  }

  simulateOpen(): void { this._emit("open"); }
  simulateClose(): void { this._emit("close"); }
  simulateError(err: Error): void { this._emit("error", err); }
  simulateMessage(msg: unknown): void {
    this._emit("message", JSON.stringify(msg));
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeSingleFactory(): { factory: WsFactory; ws: MockWs } {
  const ws = new MockWs();
  const factory: WsFactory = () => ws;
  return { factory, ws };
}

function makeMultiFactory(): { factory: WsFactory; connections: MockWs[] } {
  const connections: MockWs[] = [];
  const factory: WsFactory = () => {
    const ws = new MockWs();
    connections.push(ws);
    return ws;
  };
  return { factory, connections };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ComfyUIWsTracker — progress mapping", () => {
  let tracker: ComfyUIWsTracker;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    tracker?.stop();
    vi.useRealTimers();
  });

  it("registerJob sets initial progress to 8%", () => {
    const { factory } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-1");
    expect(tracker.getProgress("p-1")?.progress).toBe(8);
    expect(tracker.getProgress("p-1")?.stage).toBe("생성대기중");
  });

  it("execution_start event sets progress to 12%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-2");
    ws.simulateMessage({ type: "execution_start", data: { prompt_id: "p-2" } });

    expect(tracker.getProgress("p-2")?.progress).toBe(12);
    expect(tracker.getProgress("p-2")?.stage).toBe("모델준비중");
  });

  it("progress event on sampler node 72 maps value/max to 15-90%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-3");
    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "p-3", node: "72", value: 15, max: 30 },
    });
    // 15 + round(15/30 * 75) = 15 + 38 = 53 (clamped 15-90)
    expect(tracker.getProgress("p-3")?.progress).toBe(53);
    expect(tracker.getProgress("p-3")?.stage).toBe("영상프레임생성중");
  });

  it("progress event on sampler: value=1, max=30 gives 15% + ~3 = 17%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-4");
    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "p-4", node: "72", value: 1, max: 30 },
    });
    // 15 + round(1/30 * 75) = 15 + round(2.5) = 15 + 3 = 18
    expect(tracker.getProgress("p-4")?.progress).toBe(18);
  });

  it("progress event on sampler: value=30, max=30 gives 90%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-5");
    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "p-5", node: "72", value: 30, max: 30 },
    });
    expect(tracker.getProgress("p-5")?.progress).toBe(90);
  });

  it("progress event on non-sampler node is ignored", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-6");
    // node 8 is VAEDecode, not sampler — progress event for it is ignored
    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "p-6", node: "8", value: 5, max: 10 },
    });
    // Still at initial 8%
    expect(tracker.getProgress("p-6")?.progress).toBe(8);
  });

  it("executing node 8 (VAEDecode) sets 93%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-7");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-7", node: "8" } });
    expect(tracker.getProgress("p-7")?.progress).toBe(93);
    expect(tracker.getProgress("p-7")?.stage).toBe("영상디코딩중");
  });

  it("executing node 80 (CreateVideo) sets 96%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-8");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-8", node: "80" } });
    expect(tracker.getProgress("p-8")?.progress).toBe(96);
  });

  it("executing node 81 (SaveVideo) sets 98%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-9");
    ws.simulateMessage({ type: "executing", data: { prompt_id: "p-9", node: "81" } });
    expect(tracker.getProgress("p-9")?.progress).toBe(98);
    expect(tracker.getProgress("p-9")?.stage).toBe("영상파일저장중");
  });

  it("execution_success sets progress to 100%", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-10");
    ws.simulateMessage({ type: "execution_success", data: { prompt_id: "p-10" } });
    expect(tracker.getProgress("p-10")?.progress).toBe(100);
    expect(tracker.getProgress("p-10")?.stage).toBe("완료");
  });

  it("progress never goes backward (Math.max rule)", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-11");
    // Advance to 90% via sampler
    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "p-11", node: "72", value: 30, max: 30 },
    });
    expect(tracker.getProgress("p-11")?.progress).toBe(90);

    // Now send a lower value — should be ignored
    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "p-11", node: "72", value: 1, max: 30 },
    });
    expect(tracker.getProgress("p-11")?.progress).toBe(90); // unchanged
  });

  it("events for different promptId do not affect each other", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("job-A");
    tracker.registerJob("job-B");

    ws.simulateMessage({
      type: "progress",
      data: { prompt_id: "job-A", node: "72", value: 20, max: 30 },
    });

    // job-B should still be at initial 8%
    expect(tracker.getProgress("job-B")?.progress).toBe(8);
    // job-A should have advanced
    expect(tracker.getProgress("job-A")!.progress).toBeGreaterThan(8);
  });

  it("unknown prompt_id event is handled without error", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    // Not registered — should not throw
    expect(() => {
      ws.simulateMessage({
        type: "progress",
        data: { prompt_id: "unknown-id", node: "72", value: 5, max: 10 },
      });
    }).not.toThrow();
  });

  it("malformed JSON message is silently ignored", () => {
    const { factory, ws } = makeSingleFactory();
    tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    expect(() => {
      ws._emit("message", "{ this is not json }");
    }).not.toThrow();
  });
});

// ─── markCompleted ────────────────────────────────────────────────────────────

describe("ComfyUIWsTracker — markCompleted", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("markCompleted forces progress to 100 regardless of current value", () => {
    vi.useFakeTimers();
    const { factory } = makeSingleFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    tracker.registerJob("p-done");
    tracker.markCompleted("p-done");
    expect(tracker.getProgress("p-done")?.progress).toBe(100);
    tracker.stop();
  });
});

// ─── Reconnection ─────────────────────────────────────────────────────────────

describe("ComfyUIWsTracker — reconnection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnects after WebSocket close with exponential backoff", async () => {
    vi.useFakeTimers();
    const { factory, connections } = makeMultiFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    expect(connections).toHaveLength(1);

    // First close → reconnect after 1 s
    connections[0].simulateClose();
    expect(connections).toHaveLength(1); // not yet

    await vi.advanceTimersByTimeAsync(1_100);
    expect(connections).toHaveLength(2); // reconnected

    // Second close → reconnect after 2 s
    connections[1].simulateClose();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(connections).toHaveLength(2); // still waiting

    await vi.advanceTimersByTimeAsync(700);
    expect(connections).toHaveLength(3); // reconnected after ~2 s total

    tracker.stop();
  });

  it("resets backoff to 1 s after a successful open", async () => {
    vi.useFakeTimers();
    const { factory, connections } = makeMultiFactory();
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", factory);
    tracker.start();

    // Fail twice to push backoff to 2 s
    connections[0].simulateClose();
    await vi.advanceTimersByTimeAsync(1_100);
    connections[1].simulateClose();
    await vi.advanceTimersByTimeAsync(2_100);
    expect(connections).toHaveLength(3);

    // Successful open on connection 3 resets backoff
    connections[2].simulateOpen();
    connections[2].simulateClose();

    // Next reconnect should be back at 1 s
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
    // Still only 1 connection — no reconnect after stop
    expect(connections).toHaveLength(1);
  });

  it("handles factory throwing without crashing (ws package unavailable)", async () => {
    vi.useFakeTimers();
    const throwingFactory: WsFactory = () => {
      throw new Error("Cannot require ws");
    };
    const tracker = new ComfyUIWsTracker("http://localhost:8188", "test-id", throwingFactory);

    expect(() => tracker.start()).not.toThrow();

    // Schedules reconnect, no crash
    await vi.advanceTimersByTimeAsync(1_100);

    tracker.stop();
  });
});
