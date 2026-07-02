import { describe, it, expect } from "vitest";
import { stageLabel, STAGE_KO } from "../lib/stage-label";

describe("stageLabel safety net", () => {
  it("stage=sampling, progress=93 → 영상 디코딩 중", () => {
    expect(stageLabel("sampling", 93)).toBe(STAGE_KO.decoding);
  });

  it("stage=sampling, progress=96 → 영상 파일 생성 중", () => {
    expect(stageLabel("sampling", 96)).toBe(STAGE_KO.encoding);
  });

  it("stage=sampling, progress=98 → 영상 저장 중", () => {
    expect(stageLabel("sampling", 98)).toBe(STAGE_KO.saving);
  });

  it("stage=sampling, progress=100 → 완료", () => {
    expect(stageLabel("sampling", 100)).toBe(STAGE_KO.completed);
  });

  it("stage=decoding, progress=93 → 영상 디코딩 중 (explicit stage, still in range)", () => {
    expect(stageLabel("decoding", 93)).toBe(STAGE_KO.decoding);
  });

  it("stage=encoding, progress=96 → 영상 파일 생성 중", () => {
    expect(stageLabel("encoding", 96)).toBe(STAGE_KO.encoding);
  });

  it("explicit stage wins below progress 93", () => {
    expect(stageLabel("preparing", 12)).toBe(STAGE_KO.preparing);
    expect(stageLabel("sampling", 50)).toBe(STAGE_KO.sampling);
    expect(stageLabel("sampling", 90)).toBe(STAGE_KO.sampling);
  });

  it("undefined stage falls back to progress-based label", () => {
    expect(stageLabel(undefined, 50)).toBe(STAGE_KO.sampling);
    expect(stageLabel(undefined, 10)).toBe(STAGE_KO.queued);
  });
});
