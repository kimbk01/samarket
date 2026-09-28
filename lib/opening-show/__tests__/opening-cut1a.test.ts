import { describe, expect, it } from "vitest";
import { DIBAY_OPENING_GREEN } from "@/lib/opening-show/brand";
import {
  createEmptyOpeningDocument,
  parseOpeningDocument,
} from "@/lib/opening-show/document";
import { defaultImageFrame, resizeFrameKeepAspect, translateFrame } from "@/lib/opening-show/geometry";
import {
  addImageLayer,
  replaceLayerMedia,
  removeLayer,
  setLayerFit,
  moveLayerZ,
} from "@/lib/opening-show/layer-ops";
import { validateOpeningImageBytes } from "@/lib/opening-show/media-validate";
import { assertOpeningStoragePath, openingSourcePath } from "@/lib/opening-show/storage";
import { FORBIDDEN_INTRO_STORAGE_PREFIXES } from "@/lib/opening-show/storage";
import { VERCEL_FUNCTION_BODY_BYTES } from "@/lib/opening-show/transport-limits";

describe("opening document", () => {
  it("starts with one scene and brand green, no layers", () => {
    const doc = createEmptyOpeningDocument();
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0]?.background.color).toBe(DIBAY_OPENING_GREEN);
    expect(doc.scenes[0]?.layers).toEqual([]);
  });

  it("rejects extra scenes and non-image layers", () => {
    const doc = createEmptyOpeningDocument();
    expect(parseOpeningDocument({ ...doc, scenes: [...doc.scenes, doc.scenes[0]] })).toBeNull();
    expect(
      parseOpeningDocument({
        ...doc,
        scenes: [{ ...doc.scenes[0], layers: [{ type: "text", id: "x" }] }],
      })
    ).toBeNull();
  });
});

describe("opening layer ops", () => {
  it("adds an image layer only when mediaId is present", () => {
    const doc = createEmptyOpeningDocument();
    expect(addImageLayer(doc, { mediaId: "", frame: defaultImageFrame(1, 1) }).scenes[0]?.layers).toHaveLength(
      0
    );
    const next = addImageLayer(doc, {
      id: "layer-1",
      mediaId: "media-1",
      frame: defaultImageFrame(1, 1),
    });
    expect(next.scenes[0]?.layers).toHaveLength(1);
    expect(next.scenes[0]?.layers[0]?.type).toBe("image");
  });

  it("replace keeps layer id, frame, fit, z, visibility", () => {
    let doc = addImageLayer(createEmptyOpeningDocument(), {
      id: "layer-1",
      mediaId: "media-1",
      frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
      fit: "cover",
    });
    doc = setLayerFit(doc, "layer-1", "cover");
    const replaced = replaceLayerMedia(doc, "layer-1", "media-2");
    const layer = replaced.scenes[0]?.layers[0];
    expect(layer?.id).toBe("layer-1");
    expect(layer?.mediaId).toBe("media-2");
    expect(layer?.fit).toBe("cover");
    expect(layer?.frame.x).toBeCloseTo(0.1);
    expect(layer?.visible).toBe(true);
  });

  it("delete removes only that layer", () => {
    let doc = addImageLayer(createEmptyOpeningDocument(), {
      id: "a",
      mediaId: "m1",
      frame: defaultImageFrame(1, 1),
    });
    doc = addImageLayer(doc, { id: "b", mediaId: "m2", frame: defaultImageFrame(1, 1) });
    doc = removeLayer(doc, "a");
    expect(doc.scenes[0]?.layers.map((l) => l.id)).toEqual(["b"]);
  });

  it("forward/back swaps z-index", () => {
    let doc = addImageLayer(createEmptyOpeningDocument(), {
      id: "a",
      mediaId: "m1",
      frame: defaultImageFrame(1, 1),
    });
    doc = addImageLayer(doc, { id: "b", mediaId: "m2", frame: defaultImageFrame(1, 1) });
    const moved = moveLayerZ(doc, "a", "forward");
    const a = moved.scenes[0]?.layers.find((l) => l.id === "a");
    const b = moved.scenes[0]?.layers.find((l) => l.id === "b");
    expect((a?.zIndex ?? 0) > (b?.zIndex ?? 0)).toBe(true);
  });
});

describe("opening geometry", () => {
  it("stores normalized full-surface coords, not phone px", () => {
    const frame = defaultImageFrame(16 / 9, 9 / 16);
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.w).toBeLessThanOrEqual(1);
    expect(frame.y + frame.h).toBeLessThanOrEqual(1);
  });

  it("resize keeps aspect", () => {
    const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };
    const next = resizeFrameKeepAspect(start, "se", 0.1, 0);
    expect(next.w / next.h).toBeCloseTo(start.w / start.h, 5);
  });

  it("translate does not write network-side state", () => {
    const next = translateFrame({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.05, -0.02);
    expect(next.x).toBeCloseTo(0.15);
    expect(next.y).toBeCloseTo(0.08);
  });

  it("accumulates sequential pointer deltas from the last frame, not the start frame", () => {
    const start = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const staleFromStart = translateFrame(start, 0.01, 0);
    const accumulated = translateFrame(translateFrame(start, 0.2, 0.1), 0.2, 0.1);
    expect(staleFromStart.x).toBeCloseTo(0.11);
    expect(accumulated.x).toBeCloseTo(0.5);
    expect(accumulated.y).toBeCloseTo(0.3);
  });
});

describe("opening media validate", () => {
  it("accepts jpeg/png/webp magic and rejects empty", () => {
    expect(validateOpeningImageBytes({ mimeHint: "image/jpeg", bytes: new Uint8Array() }).ok).toBe(
      false
    );
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateOpeningImageBytes({ mimeHint: "image/jpeg", bytes: jpeg })).toEqual({
      ok: true,
      mime: "image/jpeg",
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateOpeningImageBytes({ mimeHint: "image/png", bytes: png }).ok).toBe(true);
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(validateOpeningImageBytes({ mimeHint: "image/webp", bytes: webp }).ok).toBe(true);
  });
});

describe("opening storage namespace", () => {
  it("uses _opening and never old intro prefixes", () => {
    const path = openingSourcePath("show", "media", "jpg");
    expect(path.startsWith("_opening/")).toBe(true);
    expect(assertOpeningStoragePath(path)).toBe(true);
    expect(FORBIDDEN_INTRO_STORAGE_PREFIXES.some((p) => path.includes(p))).toBe(false);
    expect(assertOpeningStoragePath(["_admin/", "intro-v3/x"].join(""))).toBe(false);
  });

  it("does not invent an 8MB product cap", () => {
    expect(VERCEL_FUNCTION_BODY_BYTES).toBe(4_500_000);
  });
});
