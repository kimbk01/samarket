import { describe, expect, it } from "vitest";
import { threeSceneAcceptanceDocument } from "@/lib/dibay-intro/__tests__/three-scene-fixture";
import { documentDurationMs, resolveTimeline } from "@/lib/dibay-intro/engine/timeline";
import { computeEngineSourceHash } from "@/lib/dibay-intro/engine/hash";
import { ENGINE_FILES, ENGINE_ID } from "@/lib/dibay-intro/engine/identity";
import { fittedMediaRect } from "@/lib/dibay-intro/engine/media-fit";

describe("intro engine timeline", () => {
  it("plays three scenes with transitions without collapsing to one scene", () => {
    const doc = threeSceneAcceptanceDocument();
    expect(doc.scenes).toHaveLength(3);
    const total = documentDurationMs(doc);
    expect(total).toBe(2400 + 3200 + 2800);
    const first = resolveTimeline(doc, 100);
    expect(first.sceneIndex).toBe(0);
    expect(first.transitionProgress).toBeLessThan(1);
    const second = resolveTimeline(doc, 2500);
    expect(second.sceneIndex).toBe(1);
    const third = resolveTimeline(doc, 6000);
    expect(third.sceneIndex).toBe(2);
    const done = resolveTimeline(doc, total);
    expect(done.done).toBe(true);
  });
});

describe("intro engine identity", () => {
  it("hashes the single engine source set deterministically", () => {
    expect(ENGINE_ID).toBe("dibay-intro-engine");
    expect(ENGINE_FILES.some((f) => f.includes("player.ts"))).toBe(true);
    const a = computeEngineSourceHash();
    const b = computeEngineSourceHash();
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("media-fit authority", () => {
  it("contain and cover stay distinct", () => {
    const box = { x: 0, y: 0, width: 1, height: 1 };
    const contain = fittedMediaRect(200, 100, box, "contain");
    const cover = fittedMediaRect(200, 100, box, "cover");
    expect(contain.height).toBeCloseTo(0.5);
    expect(cover.width).toBeGreaterThan(1);
  });
});
