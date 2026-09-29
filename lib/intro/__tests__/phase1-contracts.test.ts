/**
 * DIBAY INTRO — Phase 1 test matrix
 * Canonical contracts / validators / fixtures only.
 */

import { describe, expect, it } from "vitest";
import {
  BASE_COMPOSITION_ASPECT,
  CANONICAL_INTRO_FIXTURE_DOCUMENT,
  CANONICAL_TIMELINE_8100_MS,
  DeviceCandidateStatus,
  DeviceVisibleStatus,
  GEOMETRY_FIXTURES,
  GIF_FIXTURE_METADATA,
  GIF_RUNTIME_CONTRACT,
  GifForbiddenPath,
  GifRuntimeFormat,
  HomeEvent,
  IntroEvent,
  MediaStatus,
  PublishStatus,
  ServerLiveStatus,
  TABLET_LANDSCAPE_ASPECT,
  TABLET_NO_OVERRIDE_EXPECTED,
  TEXT_LINE_COUNT_CONFORMANCE,
  abandonIntroByCall,
  assertCanonical8100,
  canResumeAbandonedIntroSession,
  computeIntroDurationMs,
  decideHandoff,
  evaluateDeviceCompatibility,
  firstFrameReadyIsNotCompleted,
  fitContentRegion,
  isNoLiveIntro,
  isPositionedCoverForbidden,
  isFullyVisibleInViewport,
  parseIntroDocument,
  resolveLayerGeometry,
  resolveViewportImageRect,
  validateDraft,
  validateDeviceCompatibility,
  validatePackManifest,
  validatePublish,
  type IntroDocumentV1,
  type LayerV1,
} from "../index";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Mutable draft clone for invalidation tests. */
type MutableDoc = {
  schemaVersion: number;
  documentId: string;
  title: string;
  settings: IntroDocumentV1["settings"];
  scenes: Array<{
    sceneId: string;
    name: string;
    durationMs: number;
    background: IntroDocumentV1["scenes"][number]["background"];
    transitionAfter: unknown;
    layers: Array<Record<string, unknown>>;
  }>;
};

function mutableClone(doc: IntroDocumentV1): MutableDoc {
  return deepClone(doc) as unknown as MutableDoc;
}

function asDoc(doc: MutableDoc): IntroDocumentV1 {
  return doc as unknown as IntroDocumentV1;
}

describe("DIBAY INTRO Phase 1 — contracts / validators / fixtures", () => {
  describe("1 contract parse valid", () => {
    it("parses canonical fixture as valid draft", () => {
      const r = parseIntroDocument(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      expect(r.ok).toBe(true);
      expect(r.mode).toBe("DRAFT");
    });
  });

  describe("2 contract invalid version", () => {
    it("rejects unknown schemaVersion", () => {
      const bad = { ...CANONICAL_INTRO_FIXTURE_DOCUMENT, schemaVersion: 99 };
      const r = parseIntroDocument(bad);
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === "INVALID_SCHEMA_VERSION")).toBe(
        true,
      );
    });
  });

  describe("3 invalid layer type", () => {
    it("rejects unsupported layer type", () => {
      const doc = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      doc.scenes[0]!.layers[0]!.type = "DECORATION";
      const r = validateDraft(asDoc(doc));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === "INVALID_LAYER_TYPE")).toBe(true);
    });
  });

  describe("4 invalid geometry", () => {
    it("rejects non-positive frame", () => {
      const doc = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      doc.scenes[0]!.layers[1]!.frame = { x: 0.1, y: 0.1, w: 0, h: 0.1 };
      const r = validateDraft(asDoc(doc));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === "INVALID_GEOMETRY")).toBe(true);
    });
  });

  describe("5 invalid duration", () => {
    it("rejects negative duration", () => {
      const doc = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      doc.scenes[0]!.durationMs = -1;
      const r = validateDraft(asDoc(doc));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === "INVALID_DURATION")).toBe(true);
    });
  });

  describe("6 invalid transition", () => {
    it("rejects CUT with nonzero duration", () => {
      const doc = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      doc.scenes[0]!.transitionAfter = {
        type: "CUT",
        durationMs: 100,
      };
      const r = validateDraft(asDoc(doc));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === "INVALID_TRANSITION")).toBe(true);
    });
  });

  describe("7 invalid CTA action", () => {
    it("rejects arbitrary CTA action", () => {
      const doc = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      const cta = doc.scenes[2]!.layers.find((l) => l.type === "CTA")!;
      cta.action = { type: "EXECUTE_JS" };
      const r = validateDraft(asDoc(doc));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === "INVALID_CTA_ACTION")).toBe(true);
    });
  });

  describe("8–11 responsive mapping", () => {
    it("maps PHONE 360×800 via 9:16 FIT", () => {
      const region = fitContentRegion(
        GEOMETRY_FIXTURES.PHONE_360x800,
        BASE_COMPOSITION_ASPECT,
      );
      expect(region.RW).toBeCloseTo(360, 6);
      expect(region.RH).toBeCloseTo(640, 6);
      expect(region.OX).toBeCloseTo(0, 6);
      expect(region.OY).toBeCloseTo(80, 6);
    });

    it("maps iPhone 430×932 via 9:16 FIT", () => {
      const region = fitContentRegion(
        GEOMETRY_FIXTURES.IPHONE_430x932,
        BASE_COMPOSITION_ASPECT,
      );
      expect(region.RW).toBeCloseTo(430, 6);
      expect(region.RH).toBeCloseTo((430 * 16) / 9, 6);
      expect(region.OX).toBeCloseTo(0, 6);
      expect(region.OY).toBeCloseTo(
        (932 - (430 * 16) / 9) / 2,
        6,
      );
    });

    it("tablet 1280×800 no-override region is 450×800 @ OX=415", () => {
      const region = fitContentRegion(
        GEOMETRY_FIXTURES.TABLET_1280x800,
        BASE_COMPOSITION_ASPECT,
      );
      expect(region.RW).toBeCloseTo(TABLET_NO_OVERRIDE_EXPECTED.RW, 6);
      expect(region.RH).toBeCloseTo(TABLET_NO_OVERRIDE_EXPECTED.RH, 6);
      expect(region.OX).toBeCloseTo(TABLET_NO_OVERRIDE_EXPECTED.OX, 6);
      expect(region.OY).toBeCloseTo(TABLET_NO_OVERRIDE_EXPECTED.OY, 6);
    });

    it("tablet 1280×800 with override uses 16:10 full region", () => {
      const region = fitContentRegion(
        GEOMETRY_FIXTURES.TABLET_1280x800,
        TABLET_LANDSCAPE_ASPECT,
      );
      expect(region.RW).toBeCloseTo(1280, 6);
      expect(region.RH).toBeCloseTo(800, 6);
      expect(region.OX).toBeCloseTo(0, 6);
      expect(region.OY).toBeCloseTo(0, 6);
    });
  });

  describe("12 positioned COVER forbidden", () => {
    it("locks LOGO/TEXT/CTA/CONTENT IMAGE against viewport COVER mapping", () => {
      const logo = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[0]!.layers.find(
        (l) => l.type === "LOGO",
      )!;
      const text = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[0]!.layers.find(
        (l) => l.type === "TEXT",
      )!;
      const cta = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[2]!.layers.find(
        (l) => l.type === "CTA",
      )!;
      const content = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[1]!.layers.find(
        (l) => l.type === "IMAGE" && l.surface === "CONTENT",
      )!;
      const viewport = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[0]!.layers.find(
        (l) => l.type === "IMAGE" && l.surface === "VIEWPORT",
      )!;

      expect(isPositionedCoverForbidden(logo)).toBe(true);
      expect(isPositionedCoverForbidden(text)).toBe(true);
      expect(isPositionedCoverForbidden(cta)).toBe(true);
      expect(isPositionedCoverForbidden(content)).toBe(true);
      expect(isPositionedCoverForbidden(viewport)).toBe(false);

      for (const layer of [logo, text, cta, content] as LayerV1[]) {
        const resolved = resolveLayerGeometry(
          layer,
          GEOMETRY_FIXTURES.TABLET_1280x800,
          "TABLET_LANDSCAPE",
        );
        expect(resolved.mapping).toBe("CONTENT_FIT");
      }
    });
  });

  describe("13 tablet identity preserved", () => {
    it("override changes geometry only for same layerId/content/media", () => {
      const logo = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[0]!.layers.find(
        (l) => l.type === "LOGO",
      )!;
      expect(logo.layoutOverrides?.TABLET_LANDSCAPE).toBeTruthy();
      const phone = resolveLayerGeometry(
        logo,
        GEOMETRY_FIXTURES.PHONE_360x800,
        "PHONE_PORTRAIT",
      );
      const tablet = resolveLayerGeometry(
        logo,
        GEOMETRY_FIXTURES.TABLET_1280x800,
        "TABLET_LANDSCAPE",
      );
      expect(phone.layerId).toBe(tablet.layerId);
      expect(phone.layerId).toBe(logo.layerId);
      expect(logo.type).toBe("LOGO");
      expect(logo.mediaRefId).toBe("fixture-media-ref-logo");
      expect(phone.usedTabletOverride).toBe(false);
      expect(tablet.usedTabletOverride).toBe(true);
      expect(phone.frame).toEqual(logo.frame);
      expect(tablet.frame).toEqual(logo.layoutOverrides!.TABLET_LANDSCAPE!.frame);
      expect(phone.frame).not.toEqual(tablet.frame);
    });
  });

  describe("14–15 CTA visibility phone/tablet", () => {
    it("FINISH_INTRO CTA fully visible on phone and tablet paths", () => {
      const cta = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[2]!.layers.find(
        (l) => l.type === "CTA",
      )!;
      const phone = resolveLayerGeometry(
        cta,
        GEOMETRY_FIXTURES.PHONE_360x800,
        "PHONE_PORTRAIT",
      );
      const tablet = resolveLayerGeometry(
        cta,
        GEOMETRY_FIXTURES.TABLET_1280x800,
        "TABLET_LANDSCAPE",
      );
      expect(
        isFullyVisibleInViewport(phone.deviceRect, GEOMETRY_FIXTURES.PHONE_360x800),
      ).toBe(true);
      expect(
        isFullyVisibleInViewport(
          tablet.deviceRect,
          GEOMETRY_FIXTURES.TABLET_1280x800,
        ),
      ).toBe(true);

      const publish = validatePublish(CANONICAL_INTRO_FIXTURE_DOCUMENT, {
        isMediaReady: () => true,
      });
      expect(publish.ok).toBe(true);
    });
  });

  describe("16 timeline 8100", () => {
    it("derives exactly 8100ms from scene+transition ownership", () => {
      const total = computeIntroDurationMs(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      expect(total).toBe(CANONICAL_TIMELINE_8100_MS);
      expect(() => assertCanonical8100(CANONICAL_INTRO_FIXTURE_DOCUMENT)).not.toThrow();
      // 2500 + 300 + 3000 + 300 + 2000
      expect(2500 + 300 + 3000 + 300 + 2000).toBe(8100);
    });
  });

  describe("17 status separation", () => {
    it("keeps domain READY enums distinct", () => {
      expect(MediaStatus.READY).toBe("MEDIA_READY");
      expect(PublishStatus.COMMITTED).toBe("PUBLISH_COMMITTED");
      expect(ServerLiveStatus.LIVE).toBe("SERVER_LIVE");
      expect(DeviceCandidateStatus.READY).toBe("DEVICE_READY");
      expect(DeviceCandidateStatus.ACTIVE).toBe("DEVICE_ACTIVE");
      expect(DeviceVisibleStatus.PASS).toBe("DEVICE_VISIBLE_PASS");

      expect(MediaStatus.READY).not.toBe(PublishStatus.COMMITTED);
      expect(PublishStatus.COMMITTED).not.toBe(ServerLiveStatus.LIVE);
      expect(ServerLiveStatus.LIVE).not.toBe(DeviceCandidateStatus.READY);
      expect(DeviceCandidateStatus.READY).not.toBe(DeviceCandidateStatus.ACTIVE);
      expect(DeviceCandidateStatus.ACTIVE).not.toBe(DeviceVisibleStatus.PASS);
    });
  });

  describe("18 no-live semantics", () => {
    it("distinguishes NO_LIVE_INTRO from synced / fetch failure / incompatible", () => {
      expect(isNoLiveIntro({ kind: ServerLiveStatus.NO_LIVE_INTRO })).toBe(true);
      expect(isNoLiveIntro({ kind: ServerLiveStatus.ALREADY_SYNCED })).toBe(false);
      expect(isNoLiveIntro({ kind: ServerLiveStatus.FETCH_FAILURE })).toBe(false);
      expect(isNoLiveIntro({ kind: ServerLiveStatus.INCOMPATIBLE })).toBe(false);
      expect(ServerLiveStatus.NO_LIVE_INTRO).not.toBe(
        ServerLiveStatus.ALREADY_SYNCED,
      );
    });
  });

  describe("19 compatibility reject unknown", () => {
    it("rejects unknown schema without silent downgrade", () => {
      const decision = evaluateDeviceCompatibility({
        candidate: {
          schemaVersion: 99,
          protocolVersion: 1,
          renderSpecVersion: 1,
          fontSpecVersion: 1,
          mediaRuntimeFormat: GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
          transitions: ["CUT", "FADE", "SLIDE"],
          actions: ["CONTINUE", "FINISH_INTRO"],
        },
        device: {
          supportedSchemaVersions: [1],
          supportedProtocolVersions: [1],
          supportedRenderSpecVersions: [1],
          supportedFontSpecVersions: [1],
          supportedMediaRuntimeFormats: [GifRuntimeFormat.CANONICAL_ANIMATED_GIF],
          supportedTransitions: ["CUT", "FADE", "SLIDE"],
          supportedActions: ["CONTINUE", "FINISH_INTRO", "APPROVED_INTERNAL_ROUTE"],
        },
      });
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        expect(decision.activate).toBe("REJECT");
        expect(decision.reason).toBe("UNKNOWN_SCHEMA");
      }
      const r = validateDeviceCompatibility({
        candidate: {
          schemaVersion: 1,
          protocolVersion: 1,
          renderSpecVersion: 1,
          fontSpecVersion: 1,
          mediaRuntimeFormat: "WEIRD_FORMAT",
          transitions: ["CUT"],
          actions: ["FINISH_INTRO"],
        },
        device: {
          supportedSchemaVersions: [1],
          supportedProtocolVersions: [1],
          supportedRenderSpecVersions: [1],
          supportedFontSpecVersions: [1],
          supportedMediaRuntimeFormats: [GifRuntimeFormat.CANONICAL_ANIMATED_GIF],
          supportedTransitions: ["CUT", "FADE", "SLIDE"],
          supportedActions: ["FINISH_INTRO"],
        },
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("20 first-frame != completed", () => {
    it("keeps event names distinct without boolean overload", () => {
      expect(firstFrameReadyIsNotCompleted()).toBe(true);
      expect(IntroEvent.FIRST_FRAME_READY).toBe("INTRO_FIRST_FRAME_READY");
      expect(IntroEvent.COMPLETED).toBe("INTRO_COMPLETED");
      expect(HomeEvent.PRESENTATION_READY).toBe("HOME_PRESENTATION_READY");
      expect(HomeEvent.PRESENTATION_READY).not.toBe("dismissSplash");
      expect(HomeEvent.PRESENTATION_READY).not.toBe("shellReady");
    });
  });

  describe("21–22 handoff + final-frame hold", () => {
    it("KEEP / HOLD / HANDOFF with no blank intermediate", () => {
      expect(
        decideHandoff({ introCompleted: false, homePresentationReady: false }),
      ).toEqual({ action: "KEEP_INTRO" });
      expect(
        decideHandoff({ introCompleted: false, homePresentationReady: true }),
      ).toEqual({ action: "KEEP_INTRO" });
      expect(
        decideHandoff({ introCompleted: true, homePresentationReady: false }),
      ).toEqual({ action: "HOLD_FINAL_INTRO_FRAME" });
      expect(
        decideHandoff({ introCompleted: true, homePresentationReady: true }),
      ).toEqual({ action: "HANDOFF_HOME" });
    });
  });

  describe("23 Call abandoned semantics", () => {
    it("abandons session and forbids resume/restart", () => {
      const abandoned = abandonIntroByCall({ status: "PLAYING" });
      expect(abandoned).toEqual({ status: "ABANDONED_BY_CALL" });
      expect(canResumeAbandonedIntroSession(abandoned)).toBe(false);
      expect(IntroEvent.ABANDONED_BY_CALL).toBe("INTRO_ABANDONED_BY_CALL");
    });
  });

  describe("24 GIF C-R1 contract", () => {
    it("locks canonical animated GIF runtime format without processor PASS claim", () => {
      expect(GIF_RUNTIME_CONTRACT.runtimeFormat).toBe(
        GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
      );
      expect(GIF_RUNTIME_CONTRACT.processingPath).toBe(
        "B2_SHARP_PAGES_OMGGIF_ENCODE",
      );
      expect(GIF_RUNTIME_CONTRACT.forbiddenPaths).toContain(
        GifForbiddenPath.SHARP_CGIF_ENCODE,
      );
      expect(GIF_RUNTIME_CONTRACT.mandatoryDisposalFixtureId).toBe("05");
      expect(GIF_RUNTIME_CONTRACT.processorPassClaimed).toBe(false);
      expect(GIF_FIXTURE_METADATA.processorPassClaimed).toBe(false);
      expect(GIF_FIXTURE_METADATA.fixtureClasses).toContain("disposal-sensitive");
    });
  });

  describe("25 pack validation", () => {
    it("validates structural pack manifest", () => {
      const ok = validatePackManifest({
        schemaVersion: 1,
        protocolVersion: 1,
        renderSpecVersion: 1,
        fontSpecVersion: 1,
        packId: "fixture-pack-1",
        publishedRevisionId: "fixture-rev-1",
        documentIntegrity: {
          documentId: "fixture-document-canonical-v1",
          documentDigest: "sha256:fixture",
        },
        sealedAssets: [
          {
            sealedAssetId: "fixture-sealed-1",
            mediaRefId: "fixture-media-ref-gif-05",
            integrity: "sha256:sealed",
          },
        ],
      });
      expect(ok.ok).toBe(true);
    });
  });

  describe("26 text regression contract", () => {
    it("encodes same-class unexpected line-count divergence as FAIL", () => {
      expect(TEXT_LINE_COUNT_CONFORMANCE.outcome).toBe("FAIL");
      expect(TEXT_LINE_COUNT_CONFORMANCE.universalPlusMinusOneAcceptance).toBe(
        false,
      );
    });
  });

  describe("27 VIEWPORT vs CONTENT", () => {
    it("VIEWPORT fills physical viewport; CONTENT uses FIT", () => {
      const vp = resolveViewportImageRect(GEOMETRY_FIXTURES.TABLET_1280x800);
      expect(vp).toEqual({ vx: 0, vy: 0, vw: 1280, vh: 800 });
      const content = CANONICAL_INTRO_FIXTURE_DOCUMENT.scenes[1]!.layers.find(
        (l) => l.type === "IMAGE" && l.surface === "CONTENT",
      )!;
      const mapped = resolveLayerGeometry(
        content,
        GEOMETRY_FIXTURES.PHONE_360x800,
        "PHONE_PORTRAIT",
      );
      expect(mapped.mapping).toBe("CONTENT_FIT");
      expect(mapped.deviceRect.vw).toBeLessThan(360);
    });
  });

  describe("28 CUT present in transition set", () => {
    it("accepts valid CUT transition", () => {
      const doc = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
      doc.scenes[0]!.transitionAfter = { type: "CUT", durationMs: 0 };
      const r = validateDraft(asDoc(doc));
      expect(r.ok).toBe(true);
      // timeline changes when FADE 300 → CUT 0
      expect(computeIntroDurationMs(asDoc(doc))).toBe(8100 - 300);
    });
  });
});
