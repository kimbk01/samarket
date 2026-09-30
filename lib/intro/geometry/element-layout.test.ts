import { describe, expect, it } from "vitest";
import {
  centerFrame,
  containMediaFrame,
  DEFAULT_MEDIA_MAX_H,
  DEFAULT_MEDIA_MAX_W,
  roundNorm,
  type FrameV1,
  type MediaSize,
} from "@/lib/intro/geometry/element-layout";

/** Simulate Operator SAVE → JSON → RELOAD equality on normalized frames. */
function persistReload(frame: FrameV1): FrameV1 {
  const json = JSON.stringify(frame);
  return JSON.parse(json) as FrameV1;
}

function insertContainCenter(meta: MediaSize): FrameV1 {
  return containMediaFrame(meta, DEFAULT_MEDIA_MAX_W, DEFAULT_MEDIA_MAX_H);
}

describe("intro geometry element-layout (C3)", () => {
  it("roundNorm stabilizes float noise for seal", () => {
    expect(roundNorm(0.82)).toBe(0.82);
    expect(roundNorm(0.09000000000000002)).toBe(0.09);
  });

  it("null intrinsic metadata does not invent square 1:1 authority", () => {
    const f = containMediaFrame(null, DEFAULT_MEDIA_MAX_W, DEFAULT_MEDIA_MAX_H);
    expect(f.w).toBe(roundNorm(DEFAULT_MEDIA_MAX_W * 0.5));
    expect(f.h).toBe(roundNorm(DEFAULT_MEDIA_MAX_H * 0.35));
    expect(Math.abs(f.w - f.h)).toBeGreaterThan(1e-6);
    // Placeholder can be SAVED — fail-closed means no false aspect claim, not Apply block alone.
    const reloaded = persistReload(f);
    expect(reloaded).toEqual(f);
  });

  it.each([
    ["16:9", 1600, 900],
    ["9:16", 900, 1600],
    ["1:1", 1000, 1000],
    ["4:3", 1200, 900],
    ["3:4", 900, 1200],
  ] as const)(
    "%s INSERT→CONTAIN→CENTER→SAVE→RELOAD→REPLACE→RECENTER",
    (_label, width, height) => {
      const meta = { width, height };
      const inserted = insertContainCenter(meta);
      const aspect = width / height;
      expect(inserted.w / inserted.h).toBeCloseTo(aspect, 5);
      expect(inserted.x + inserted.w / 2).toBeCloseTo(0.5, 5);
      expect(inserted.y + inserted.h / 2).toBeCloseTo(0.5, 5);

      const saved = persistReload(inserted);
      expect(saved).toEqual(inserted);
      expect(saved.w / saved.h).toBeCloseTo(aspect, 5);

      // REPLACE with same aspect meta → equal contain frame
      const replaced = insertContainCenter(meta);
      expect(replaced).toEqual(inserted);

      // RECENTER is idempotent for already-centered contain frame
      const recentered = centerFrame(replaced);
      expect(recentered.x).toBeCloseTo(replaced.x, 7);
      expect(recentered.y).toBeCloseTo(replaced.y, 7);
      expect(recentered.w / recentered.h).toBeCloseTo(aspect, 5);
    },
  );
});
