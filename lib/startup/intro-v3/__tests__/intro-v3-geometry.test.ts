import { describe, expect, it } from "vitest";
import {
  introV3GeometryHasCssPixels,
  normalizeIntroV3Geometry,
  defaultIntroV3ImageGeometry,
  initialIntroV3ImageGeometry,
} from "@/lib/startup/intro-v3/geometry";

describe("intro-v3 geometry", () => {
  it("normalizes SCENE_NORMALIZED_PCT and defaults IMAGE fit to CONTAIN", () => {
    const geo = defaultIntroV3ImageGeometry();
    expect(geo.fit).toBe("CONTAIN");
    expect(geo.anchor).toBe("middle-center");
    expect(geo.safeArea).toBe(true);
    const next = normalizeIntroV3Geometry({ ...geo, xPct: 120, yPct: -4 });
    expect(next?.xPct).toBe(100);
    expect(next?.yPct).toBe(0);
  });

  it("rejects CSS px persist fields", () => {
    expect(introV3GeometryHasCssPixels({ xPx: 12, yPx: 8 })).toBe(true);
    expect(normalizeIntroV3Geometry({ ...defaultIntroV3ImageGeometry(), widthPx: 320 })).toBeNull();
  });

  it("initial IMAGE placement preserves intrinsic aspect inside occupancy", () => {
    const geo = initialIntroV3ImageGeometry({ mediaWidth: 1080, mediaHeight: 1920 });
    expect(geo.fit).toBe("CONTAIN");
    expect(geo.widthPct).toBe(72);
    expect(geo.heightPct).toBe(72);
  });

  it("rejects STRETCH", () => {
    expect(normalizeIntroV3Geometry({ ...defaultIntroV3ImageGeometry(), fit: "STRETCH" })).toBeNull();
  });
});
