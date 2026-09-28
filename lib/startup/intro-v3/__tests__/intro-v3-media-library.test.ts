import { describe, expect, it } from "vitest";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import { introV3MediaIsReady } from "@/lib/startup/intro-v3/media-types";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";
import { validateIntroV3MediaReady } from "@/lib/startup/intro-v3/validation";
import type { IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";
import type { IntroV3Layer } from "@/lib/startup/intro-v3/document";
import { defaultIntroV3ImageGeometry } from "@/lib/startup/intro-v3/geometry";
import { defaultIntroV3LayerMotion } from "@/lib/startup/intro-v3/motion";

function source(over: Partial<IntroV3MediaSource> = {}): IntroV3MediaSource {
  return {
    id: "src-1",
    filename: "a.jpg",
    mime: "image/jpeg",
    width: 800,
    height: 600,
    aspect: 800 / 600,
    bytes: 12000,
    orientationDeg: 0,
    storagePath: "_admin/intro-v3/sources/u/src-1.jpg",
    publicUrl: "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/intro-v3/sources/u/src-1.jpg",
    status: "ready",
    errorCode: null,
    createdAt: "2026-09-28T00:00:00.000Z",
    ...over,
  };
}

function derivative(over: Partial<IntroV3MediaDerivative> = {}): IntroV3MediaDerivative {
  return {
    id: "der-1",
    sourceId: "src-1",
    kind: "STILL_RUNTIME",
    format: "webp",
    width: 800,
    height: 600,
    aspect: 800 / 600,
    bytes: 4000,
    storagePath: "_admin/intro-v3/derivatives/src-1/der-1.webp",
    publicUrl: "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/intro-v3/derivatives/src-1/der-1.webp",
    status: "ready",
    revision: 1,
    ...over,
  };
}

function selection(over: Partial<IntroV3LibrarySelection> = {}): IntroV3LibrarySelection {
  const src = source();
  const der = derivative();
  return {
    intent: "ADD_IMAGE",
    mediaRef: { sourceId: src.id, derivativeId: der.id },
    source: src,
    derivative: der,
    ...over,
  };
}

describe("intro-v3 media ready + library", () => {
  it("never marks READY on failure or missing derivative", () => {
    expect(
      introV3MediaIsReady({
        sourceStatus: "failed",
        derivativeStatus: "ready",
        sourcePersistable: true,
        derivativePersistable: true,
        derivativeExists: true,
      })
    ).toBe(false);
    expect(
      validateIntroV3MediaReady({
        sourceStatus: "ready",
        derivativeStatus: "ready",
        sourceRef: "blob:https://example/1",
        derivativeRef: "_admin/intro-v3/derivatives/a.webp",
        derivativeExists: true,
      })
    ).toBe(false);
    expect(
      introV3MediaIsReady({
        sourceStatus: "ready",
        derivativeStatus: "ready",
        sourcePersistable: true,
        derivativePersistable: true,
        derivativeExists: false,
      })
    ).toBe(false);
  });

  it("rejects blob and localhost persistable refs", () => {
    expect(isIntroV3PersistableRef("blob:https://localhost/abc")).toBe(false);
    expect(isIntroV3PersistableRef("http://127.0.0.1/x")).toBe(false);
    expect(isIntroV3PersistableRef("https://localhost/storage/v1/object/public/x")).toBe(false);
    expect(
      isIntroV3PersistableRef(
        "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/intro-v3/sources/a.jpg"
      )
    ).toBe(true);
  });

  it("library cancel and failed ADD create no selection and no Layer", () => {
    expect(applyIntroV3LibraryOutcome({ kind: "cancel" }).selected).toBeNull();
    expect(applyIntroV3LibraryOutcome({ kind: "cancel" }).layersCreated).toBe(0);
    expect(applyIntroV3LibraryOutcome({ kind: "cancel" }).sceneMutated).toBe(false);
    const failed = applyIntroV3LibraryOutcome({ kind: "fail", errorCode: "decode_failed" });
    expect(failed.selected).toBeNull();
    expect(failed.layersCreated).toBe(0);
    expect(failed.sceneMutated).toBe(false);
  });

  it("library selection is not a Scene mutation until ADD/REPLACE commit", () => {
    const applied = applyIntroV3LibraryOutcome({ kind: "select", selection: selection() });
    expect(applied.selected?.mediaRef.derivativeId).toBe("der-1");
    expect(applied.layersCreated).toBe(0);
    expect(applied.sceneMutated).toBe(false);
  });

  it("REPLACE returns a new mediaRef and does not detach the old asset", () => {
    const layer: IntroV3Layer = {
      id: "layer-keep",
      type: "IMAGE",
      visible: true,
      z: 2,
      geometry: defaultIntroV3ImageGeometry(),
      motion: defaultIntroV3LayerMotion(),
      payload: { mediaRef: "src-old:der-old" },
    };
    const applied = applyIntroV3LibraryOutcome(
      {
        kind: "select",
        selection: selection({
          intent: "REPLACE_MEDIA",
          mediaRef: { sourceId: "src-1", derivativeId: "der-1" },
        }),
      },
      { replaceLayer: layer }
    );
    expect(applied.detachedOldAsset).toBe(false);
    expect(applied.previousMediaRef).toEqual({ sourceId: "src-old", derivativeId: "der-old" });
    expect(applied.nextMediaRef).toEqual({ sourceId: "src-1", derivativeId: "der-1" });
    expect(applied.layersCreated).toBe(0);
    expect(layer.id).toBe("layer-keep");
    expect(layer.payload.mediaRef).toBe("src-old:der-old");
  });
});
