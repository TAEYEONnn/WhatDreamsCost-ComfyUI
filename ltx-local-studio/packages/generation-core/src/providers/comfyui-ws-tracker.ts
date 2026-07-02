/**
 * ComfyUIWsTracker — server-side WebSocket listener for ComfyUI progress events.
 *
 * Connects to ws://<host>/ws?clientId=<id>, receives execution events, and maps
 * them to a 0-100 progress scale and a GenerationStage per promptId. The provider
 * reads these values via getProgress() when answering polling requests.
 *
 * Progress never goes backward (Math.max rule). Reconnects with exponential
 * backoff (1 s → 2 s → 4 s … capped at 30 s).
 */
import type { GenerationStage } from "@ltx-studio/shared-types";

// ─── WsLike interface — subset needed for injection + mocking ─────────────────

export interface WsLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this;
  close(): void;
}

export type WsFactory = (url: string) => WsLike;

// ─── Stage transition record — one entry per stage change ─────────────────────

export interface StageTransition {
  stage: GenerationStage;
  progress: number;
  occurredAt: number;
}

// ─── Progress state stored per promptId ──────────────────────────────────────

export interface ProgressState {
  progress: number;
  stage?: GenerationStage;
  updatedAt: number;
  /** Ordered history of stage changes — used to surface pendingStages to the browser. */
  transitions: StageTransition[];
}

// ─── Node IDs that carry meaningful stage transitions ─────────────────────────

const NODE = {
  SAMPLER: "72",
  VAE_DECODE: "8",
  CREATE_VIDEO: "80",
  SAVE_VIDEO: "81",
} as const;

// ─── Default ws factory — lazy-require so webpack won't bundle for client ─────

function defaultWsFactory(url: string): WsLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call
  const WS = require("ws") as new (u: string) => WsLike;
  return new WS(url);
}

// ─── Tracker class ────────────────────────────────────────────────────────────

export class ComfyUIWsTracker {
  private readonly wsUrl: string;
  private readonly wsFactory: WsFactory;

  /** Map<promptId, ProgressState> */
  private readonly progressMap = new Map<string, ProgressState>();

  private ws: WsLike | null = null;
  private stopping = false;
  private reconnectDelay = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly MAX_DELAY = 30_000;
  private static readonly INITIAL_DELAY = 1_000;

  constructor(baseUrl: string, clientId: string, wsFactory?: WsFactory) {
    const wsBase = baseUrl.replace(/^http/, "ws");
    this.wsUrl = `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`;
    this.wsFactory = wsFactory ?? defaultWsFactory;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  start(): void {
    this.stopping = false;
    this._connect();
  }

  stop(): void {
    this.stopping = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Register a job after its prompt is submitted to ComfyUI.
   * Sets initial progress to 8% / stage "queued".
   */
  registerJob(promptId: string): void {
    // Initialize with empty transitions so getProgress always returns a defined array.
    this.progressMap.set(promptId, { progress: 0, updatedAt: Date.now(), transitions: [] });
    this._setProgress(promptId, 8, "queued");
  }

  /**
   * Called by the provider when history confirms the job completed.
   * Forces progress to 100 / stage "completed" and cleans up after 60 s.
   */
  markCompleted(promptId: string): void {
    this._setProgress(promptId, 100, "completed");
    setTimeout(() => {
      this.progressMap.delete(promptId);
    }, 60_000);
  }

  getProgress(promptId: string): ProgressState | undefined {
    return this.progressMap.get(promptId);
  }

  // ─── Connection management ───────────────────────────────────────────────────

  private _connect(): void {
    if (this.stopping) return;

    let ws: WsLike;
    try {
      ws = this.wsFactory(this.wsUrl);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.on("open", () => {
      this.reconnectDelay = ComfyUIWsTracker.INITIAL_DELAY;
    });

    ws.on("message", (raw: string | Buffer) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        this._handleMessage(JSON.parse(text) as ComfyEvent);
      } catch {
        // Malformed JSON — ignore
      }
    });

    ws.on("error", () => {
      // Error is always followed by close; reconnect there
    });

    ws.on("close", () => {
      this.ws = null;
      this._scheduleReconnect();
    });
  }

  private _scheduleReconnect(): void {
    if (this.stopping) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, ComfyUIWsTracker.MAX_DELAY);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, delay);
  }

  // ─── Event processing ────────────────────────────────────────────────────────

  private _handleMessage(event: ComfyEvent): void {
    if (!event?.type) return;

    switch (event.type) {
      case "execution_start":
        if (event.data?.prompt_id) {
          this._setProgress(event.data.prompt_id, 12, "preparing");
        }
        break;

      case "executing": {
        const promptId = event.data?.prompt_id;
        if (!promptId) break;

        const nodeId = event.data?.node;

        if (process.env.NODE_ENV === "development" && nodeId) {
          const prev = this.progressMap.get(promptId);
          console.debug("[ComfyUI Progress]", {
            promptId,
            eventType: "executing",
            node: nodeId,
            currentProgress: prev?.progress ?? 0,
            currentStage: prev?.stage,
          });
        }

        switch (nodeId) {
          case NODE.SAMPLER:
            this._setProgress(promptId, 15, "sampling");
            break;
          case NODE.VAE_DECODE:
            this._setProgress(promptId, 93, "decoding");
            break;
          case NODE.CREATE_VIDEO:
            this._setProgress(promptId, 96, "encoding");
            break;
          case NODE.SAVE_VIDEO:
            this._setProgress(promptId, 98, "saving");
            break;
        }
        break;
      }

      case "progress": {
        const promptId = event.data?.prompt_id;
        if (!promptId) break;
        if (event.data?.node !== NODE.SAMPLER) break;

        const value = event.data.value ?? 0;
        const max = event.data.max ?? 1;
        const ratio = max > 0 ? value / max : 0;
        const pct = Math.round(15 + ratio * 75);
        const clamped = Math.min(Math.max(pct, 15), 90);
        this._setProgress(promptId, clamped, "sampling");
        break;
      }

      case "execution_success": {
        const promptId = event.data?.prompt_id;
        if (promptId) {
          this._setProgress(promptId, 100, "completed");
        }
        break;
      }

      case "execution_error":
        // Don't update — let HTTP history poll surface the error
        break;
    }
  }

  // ─── Progress helpers ─────────────────────────────────────────────────────────

  private _setProgress(promptId: string, pct: number, stage?: GenerationStage): void {
    const prev = this.progressMap.get(promptId);
    const next = Math.min(Math.max(pct, 0), 100);
    if (prev && prev.progress >= next) return; // never go backward

    // Append a transition record when the stage changes.
    const prevTransitions = prev?.transitions ?? [];
    let transitions = prevTransitions;
    if (stage && stage !== prev?.stage) {
      transitions = [
        ...prevTransitions,
        { stage, progress: next, occurredAt: Date.now() },
      ];
      if (process.env.NODE_ENV === "development") {
        console.debug("[ComfyUI Progress]", {
          promptId,
          eventType: "stage_change",
          stage,
          progress: next,
        });
      }
    }

    this.progressMap.set(promptId, {
      progress: next,
      stage,
      updatedAt: Date.now(),
      transitions,
    });
  }
}

// ─── ComfyUI WebSocket event shape ───────────────────────────────────────────

interface ComfyEvent {
  type: string;
  data?: {
    prompt_id?: string;
    node?: string | null;
    value?: number;
    max?: number;
  };
}
