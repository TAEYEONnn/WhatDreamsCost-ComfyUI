/**
 * ComfyUIWsTracker — server-side WebSocket listener for ComfyUI progress events.
 *
 * Connects to ws://<host>/ws?clientId=<id>, receives execution events, and maps
 * them to a 0-100 progress scale per promptId. The provider reads these values
 * via getProgress() when answering GET /api/generations/{jobId} polls.
 *
 * Progress never goes backward (Math.max rule). Reconnects with exponential
 * backoff (1 s → 2 s → 4 s … capped at 30 s) so a ComfyUI restart is recovered
 * automatically.
 */

// ─── WsLike interface — subset needed for injection + mocking ─────────────────

export interface WsLike {
  // Generic overload so mock objects satisfy the interface without full WebSocket types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this;
  close(): void;
}

export type WsFactory = (url: string) => WsLike;

// ─── Progress state stored per promptId ──────────────────────────────────────

export interface ProgressState {
  progress: number;
  stage?: string;
  updatedAt: number;
}

// ─── Node IDs that carry meaningful stage transitions ─────────────────────────
// Must match the node IDs in ltxv-i2v-0.9.5.json.

const NODE = {
  SAMPLER: "72",    // SamplerCustom — reports value/max progress ticks
  VAE_DECODE: "8",  // VAEDecode — post-sampling decode
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
  private reconnectDelay = 1_000; // ms, doubles on each failure up to MAX_DELAY
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
   * Register a job when it's first submitted so the tracker knows to watch for
   * its events. Sets initial progress to 8% ("submitted to queue").
   */
  registerJob(promptId: string): void {
    this._setProgress(promptId, 8, "생성대기중");
  }

  /**
   * Called by the provider when history confirms the job is completed.
   * Forces progress to 100 and clears the entry after a short delay.
   */
  markCompleted(promptId: string): void {
    this._setProgress(promptId, 100, "완료");
    // Keep state for 60 s so in-flight polls still read 100%
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
      // Factory failed (e.g. ws package not available)
      this._scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.on("open", () => {
      // Reset backoff on successful connection
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
      // Error is always followed by close; we reconnect there
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
        // promptId starts executing (dequeued from pending)
        if (event.data?.prompt_id) {
          this._setProgress(event.data.prompt_id, 12, "모델준비중");
        }
        break;

      case "executing": {
        // Node is about to start executing
        const promptId = event.data?.prompt_id;
        if (!promptId) break;

        switch (event.data?.node) {
          case null:
          case undefined:
            // null node = execution finished, wait for execution_success
            break;
          case NODE.VAE_DECODE:
            this._setProgress(promptId, 93, "영상디코딩중");
            break;
          case NODE.CREATE_VIDEO:
            this._setProgress(promptId, 96, "영상디코딩중");
            break;
          case NODE.SAVE_VIDEO:
            this._setProgress(promptId, 98, "영상파일저장중");
            break;
        }
        break;
      }

      case "progress": {
        // Sampler step tick — only meaningful for the sampler node
        const promptId = event.data?.prompt_id;
        if (!promptId) break;
        if (event.data?.node !== NODE.SAMPLER) break;

        const value = event.data.value ?? 0;
        const max = event.data.max ?? 1;
        const ratio = max > 0 ? value / max : 0;
        // Map sampler steps to 15–90%
        const pct = Math.round(15 + ratio * 75);
        const clamped = Math.min(Math.max(pct, 15), 90);
        this._setProgress(promptId, clamped, "영상프레임생성중");
        break;
      }

      case "execution_success": {
        const promptId = event.data?.prompt_id;
        if (promptId) {
          this._setProgress(promptId, 100, "완료");
        }
        break;
      }

      case "execution_error": {
        // Don't update progress — let the HTTP history poll surface the error
        break;
      }
    }
  }

  // ─── Progress helpers ─────────────────────────────────────────────────────────

  /** Updates progress, enforcing the no-backward rule. */
  private _setProgress(promptId: string, pct: number, stage?: string): void {
    const prev = this.progressMap.get(promptId);
    const next = Math.min(Math.max(pct, 0), 100);
    if (prev && prev.progress >= next) return; // never go backward
    this.progressMap.set(promptId, {
      progress: next,
      stage,
      updatedAt: Date.now(),
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
