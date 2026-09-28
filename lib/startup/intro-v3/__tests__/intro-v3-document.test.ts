import { describe, expect, it } from "vitest";
import { backgroundIsNotALayer } from "@/lib/startup/intro-v3/layer-model";
import { parseIntroV3Document } from "@/lib/startup/intro-v3/document";
import { createIntroV3SeedDocument } from "@/lib/startup/intro-v3/seed";
import { validateIntroV3Document } from "@/lib/startup/intro-v3/validation";

describe("intro-v3 document seed", () => {
  it("seeds exactly one Scene with green COLOR background, TIMER 3200, FADE 300, zero IMAGE layers", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    expect(doc.schemaVersion).toBe(3);
    expect(doc.scenes).toHaveLength(1);
    const scene = doc.scenes[0]!;
    expect(scene.id).toBe("scene-1");
    expect(scene.background).toEqual({ type: "COLOR", color: "#0B5F3A" });
    expect(scene.advance).toBe("TIMER");
    expect(scene.holdMs).toBe(3200);
    expect(scene.transition.preset).toBe("FADE");
    expect(scene.transition.durationMs).toBe(300);
    expect(scene.transition.easing).toBe("STANDARD");
    expect(scene.layers).toEqual([]);
    expect(scene.layers.map((layer) => layer.type)).not.toContain("IMAGE");
  });

  it("does not put BACKGROUND in layers[]", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    expect(backgroundIsNotALayer(doc.scenes[0]!.layers)).toBe(true);
    expect(doc.scenes[0]!.layers).toHaveLength(0);
  });

  it("keeps stable Scene ids across parse", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-stable" });
    const parsed = parseIntroV3Document(doc);
    expect(parsed?.scenes[0]?.id).toBe("scene-stable");
    expect(validateIntroV3Document(doc).ok).toBe(true);
  });

  it("rejects BACKGROUND typed as a Layer", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const raw = {
      ...doc,
      scenes: [
        {
          ...doc.scenes[0],
          layers: [{ id: "bg", type: "BACKGROUND", visible: true, z: 0, geometry: {}, motion: {}, payload: {} }],
        },
      ],
    };
    expect(parseIntroV3Document(raw)).toBeNull();
  });
});
