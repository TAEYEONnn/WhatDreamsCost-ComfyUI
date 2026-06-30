import { describe, it, expect, vi } from "vitest";
import { MockVideoProvider } from "../providers/mock-provider";
import type { VideoGenerationInput } from "../types";

const mockInput: VideoGenerationInput = {
  shotId: "shot-1",
  generationId: "gen-1",
  modelId: "mock-ltxv-0.9",
  prompt: "A cinematic shot of mountains at sunset",
  durationSeconds: 5,
  aspectRatio: "16:9",
  seed: 42,
};

describe("MockVideoProvider", () => {
  it("reports connected", async () => {
    const provider = new MockVideoProvider();
    const status = await provider.checkConnection();
    expect(status.connected).toBe(true);
  });

  it("returns capabilities", async () => {
    const provider = new MockVideoProvider();
    const caps = await provider.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].modelId).toBeDefined();
  });

  it("submits a generation and returns a job id", async () => {
    const provider = new MockVideoProvider({ failureRate: 0 });
    const submission = await provider.submitGeneration(mockInput);
    expect(submission.providerJobId).toBeTruthy();
    expect(submission.providerJobId).toMatch(/^mock-/);
  });

  it("transitions queued → processing → completed", async () => {
    const provider = new MockVideoProvider({
      failureRate: 0,
      processingDurationMs: 200,
    });

    const { providerJobId } = await provider.submitGeneration(mockInput);

    const initial = await provider.getGenerationStatus(providerJobId);
    expect(["queued", "processing"]).toContain(initial.status);

    // Wait for completion
    await new Promise((r) => setTimeout(r, 600));
    const final = await provider.getGenerationStatus(providerJobId);
    expect(final.status).toBe("completed");
    expect(final.progress).toBe(100);
    expect(final.outputUrl).toBeDefined();
  });

  it("can cancel a job", async () => {
    const provider = new MockVideoProvider({
      failureRate: 0,
      processingDurationMs: 5000,
    });
    const { providerJobId } = await provider.submitGeneration(mockInput);
    await provider.cancelGeneration!(providerJobId);
    const status = await provider.getGenerationStatus(providerJobId);
    expect(status.status).toBe("cancelled");
  });

  it("deterministically fails when shouldFail: true", async () => {
    const provider = new MockVideoProvider({
      shouldFail: true,
      processingDurationMs: 50,
    });

    const { providerJobId } = await provider.submitGeneration(mockInput);

    // Wait long enough to move past queued (>500ms) → processing → fail check
    await new Promise((r) => setTimeout(r, 700));

    const status = await provider.getGenerationStatus(providerJobId);
    expect(status.status).toBe("failed");
    expect(status.errorCode).toMatch(/MOCK/);
  });

  it("returns error for unknown job id", async () => {
    const provider = new MockVideoProvider();
    const status = await provider.getGenerationStatus("nonexistent-job");
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("JOB_NOT_FOUND");
  });
});
