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

  it("initial IMAGE placement contains intrinsic aspect in the Scene surface without occupancy %", () => {
    const geo = initialIntroV3ImageGeometry({
      mediaWidth: 1600,
      mediaHeight: 900,
      surfaceWidth: 900,
      surfaceHeight: 1600,
    });
    expect(geo.fit).toBe("CONTAIN");
    expect(geo.widthPct).toBe(100);
    expect(geo.heightPct).toBe(31.6);
    expect(geo.widthPct).not.toBe(72);
  });

  it("rejects STRETCH", () => {
    expect(normalizeIntroV3Geometry({ ...defaultIntroV3ImageGeometry(), fit: "STRETCH" })).toBeNull();
  });
});
