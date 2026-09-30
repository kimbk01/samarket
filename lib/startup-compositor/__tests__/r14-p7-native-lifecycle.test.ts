/**
 * R14-P7 — native lifecycle wiring + static old-authority audit.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getStartupCompositorActivation,
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
} from "@/lib/startup-compositor/runtime/activation";
import {
  OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
  evaluateOwnerLiveContentClass,
} from "@/lib/intro/live/owner-live-eligibility";

const ROOT = process.cwd();
const MAIN = join(ROOT, "android/app/src/main/java/com/dibay/app/MainActivity.java");
const ANDROID_HOST = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorHost.java",
);
const ANDROID_SESSION = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorSession.java",
);
const ANDROID_ENV = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/DibayStartupEnvelopeVerifiedStore.java",
);
const IOS_HOST = join(ROOT, "ios/App/App/DibayStartupCompositorHost.swift");
const IOS_ROOT = join(ROOT, "ios/App/App/DibayRootBridgeViewController.swift");

function read(p: string) {
  return readFileSync(p, "utf8");
}

describe("R14-P7 native lifecycle", () => {
  it("P7-01 activation true + phase P7", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(true);
    expect(getStartupCompositorActivation().phase).toBe(
      "P7_NATIVE_LIFECYCLE_INTEGRATION",
    );
  });

  it("P7-02 Android MainActivity wires ONE compositor session", () => {
    const main = read(MAIN);
    expect(main).toContain("DibayStartupCompositorSession");
    expect(main).toContain("startStartupCompositorSession");
    expect(main).toContain("compositorFirstProductFrame");
    expect(main).toContain("compositorSkippedNoOwnerEnvelope");
    expect(main).toContain("onHomePresentationReady");
  });

  it("P7-03 Android host production active + surface access", () => {
    const host = read(ANDROID_HOST);
    expect(host).toContain("PRODUCTION_PRESENTATION_ACTIVE = true");
    expect(host).toContain("surfaceOrNull");
    expect(host).toContain("requestHandoffYield");
    expect(host).not.toContain("DibayStartupBridge");
    expect(host).not.toContain("SystemStartSurface");
  });

  it("P7-04 Android envelope store rejects non-OWNER", () => {
    const src = read(ANDROID_ENV);
    expect(src).toContain("startup-envelope.json");
    expect(src).toContain('OWNER');
    expect(src).toContain("reject_non_owner_envelope");
  });

  it("P7-05 Android session SS→Intro→HOME handoff hold", () => {
    const src = read(ANDROID_SESSION);
    expect(src).toContain("SYSTEM_START");
    expect(src).toContain("last_frame_hold");
    expect(src).toContain("HOME_PRESENTATION_READY");
    expect(src).toContain("HANDOFF");
    expect(src).toContain("GIF / MP4");
  });

  it("P7-06 iOS RootBridge wires compositor + boot bridge", () => {
    const root = read(IOS_ROOT);
    expect(root).toContain("DibayStartupCompositorHost");
    expect(root).toContain("startStartupCompositor");
    expect(root).toContain("DibayBootBridge");
    expect(root).toContain("homePresentationReady");
    expect(root).not.toContain("DibayStartupBridgeViewController");
  });

  it("P7-07 iOS host envelope OWNER gate + paint", () => {
    const host = read(IOS_HOST);
    expect(host).toContain("productionPresentationActive = true");
    expect(host).toContain("startup-envelope.json");
    expect(host).toContain("OWNER");
    expect(host).toContain("SYSTEM_START");
    expect(host).toContain("last_frame_hold");
  });

  it("P7-08 PRECHECK B still fail-closed at setLiveRelease", () => {
    expect(evaluateOwnerLiveContentClass("QA").ok).toBe(false);
    expect(evaluateOwnerLiveContentClass("OWNER").ok).toBe(true);
    expect(OWNER_LIVE_FORBIDDEN_CONTENT_CLASS).toBe(
      "owner_live_forbidden_content_class",
    );
    const service = read(join(ROOT, "lib/intro/live/service.ts"));
    expect(service).toContain("evaluateOwnerLiveContentClass");
    expect(service).toContain("ownerLiveForbiddenError");
  });

  it("P7-09 static old-authority audit — Bridge / cream / dual surface forbidden", () => {
    for (const p of [
      ANDROID_HOST,
      ANDROID_SESSION,
      IOS_HOST,
      IOS_ROOT,
      MAIN,
    ]) {
      expect(existsSync(p)).toBe(true);
      const src = read(p);
      expect(src).not.toMatch(/DibayStartupBridgeViewController/);
      expect(src).not.toMatch(/creamHold|#FFFCFC.*fallback|createErrorBoard/);
      expect(src).not.toMatch(/DibayIntroSceneSurface|DibaySystemStartSurface/);
    }
  });

  it("P7-10 pack.json is not cold presentation authority in session", () => {
    const session = read(ANDROID_SESSION);
    expect(session).toContain("StartupPackageEnvelope");
    expect(session).toContain("envelopeRetrievalUrl");
    // Session may call IntroLiveDelivery for assets, but presentation authority is envelope.
    expect(session).toContain("readEnvelopeOrNull");
  });
});
