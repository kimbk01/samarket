/**
 * REBUILD 14 — R14-P2 ONE COMPOSITOR SKELETON structural tests (T01–T20).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

import {
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
  getStartupCompositorActivation,
  StartupCompositorEngine,
  COMPOSITOR_EVENT_OWNERSHIP,
} from "@/lib/startup-compositor";

const ROOT = join(__dirname, "../../..");
const ANDROID_HOST = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorHost.java",
);
const IOS_HOST = join(ROOT, "ios/App/App/DibayStartupCompositorHost.swift");
const MAIN_ACTIVITY = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/MainActivity.java",
);
const IOS_ROOT_VC = join(ROOT, "ios/App/App/DibayRootBridgeViewController.swift");

/** Strip block/line comments so audit tokens in docs do not false-fail. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*\*.*$/gm, " ");
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readCode(path: string): string {
  return stripComments(read(path));
}

describe("R14-P2 compositor skeleton", () => {
  beforeEach(() => {
    StartupCompositorEngine.resetRegistryForTests();
  });

  it("T01 one compositor instance per root", () => {
    const a = StartupCompositorEngine.getOrCreate("root-a");
    const b = StartupCompositorEngine.getOrCreate("root-a");
    expect(a).toBe(b);
    expect(StartupCompositorEngine.instanceCountForTests()).toBe(1);
    StartupCompositorEngine.getOrCreate("root-b");
    expect(StartupCompositorEngine.instanceCountForTests()).toBe(2);
  });

  it("T02 duplicate attach idempotent", () => {
    const e = StartupCompositorEngine.getOrCreate("t02");
    expect(e.attach().ok).toBe(true);
    expect(e.attach().ok).toBe(true);
    expect(e.getPhase()).toBe("ATTACHED");
  });

  it("T03 thin host cannot own semantic transition", () => {
    const e = StartupCompositorEngine.getOrCreate("t03");
    e.attach();
    const r = e.hostAttemptSemanticTransition("choose_package");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("host_semantic_transition_forbidden");
  });

  it("T04 HOME_PRESENTATION_READY single ingress", () => {
    const homeRows = COMPOSITOR_EVENT_OWNERSHIP.filter(
      (r) => r.event === "HOME_PRESENTATION_READY",
    );
    expect(homeRows).toHaveLength(1);
    expect(homeRows[0]?.producer).toContain("ingestHomePresentationReady");
    const e = StartupCompositorEngine.getOrCreate("t04");
    e.attach();
    expect(e.ingestHomePresentationReady("test").ok).toBe(true);
  });

  it("T05 duplicate HOME_READY ignored (idempotent)", () => {
    const e = StartupCompositorEngine.getOrCreate("t05");
    e.attach();
    e.ingestHomePresentationReady("a");
    const phase = e.getPhase();
    e.ingestHomePresentationReady("b");
    expect(e.getPhase()).toBe(phase);
  });

  it("T06 handoff exactly once", () => {
    const e = StartupCompositorEngine.getOrCreate("t06");
    e.attach();
    e.ingestHomePresentationReady("home");
    expect(e.requestHandoff().ok).toBe(true);
    expect(e.completeHandoff().ok).toBe(true);
    expect(e.getPhase()).toBe("DONE");
    e.detach();
    expect(e.wasDetachedAfterHandoff()).toBe(true);
  });

  it("T07 duplicate handoff ignored", () => {
    const e = StartupCompositorEngine.getOrCreate("t07");
    e.attach();
    e.ingestHomePresentationReady("home");
    e.requestHandoff();
    e.completeHandoff();
    expect(e.requestHandoff().ok).toBe(false); // late after DONE
    expect(e.completeHandoff().ok).toBe(true); // idempotent complete
    expect(e.getPhase()).toBe("DONE");
  });

  it("T08 late event after DONE ignored", () => {
    const e = StartupCompositorEngine.getOrCreate("t08");
    e.attach();
    e.ingestHomePresentationReady("home");
    e.requestHandoff();
    e.completeHandoff();
    expect(e.notifyPaintable().ok).toBe(false);
    const lateFrame = e.notifyFirstFrameCommitted();
    expect(lateFrame.ok).toBe(false);
    if (!lateFrame.ok) expect(lateFrame.reason).toBe("late_event_after_done");
    const lateHome = e.ingestHomePresentationReady("late");
    expect(lateHome.ok).toBe(false);
    if (!lateHome.ok) expect(lateHome.reason).toBe("late_event_after_done");
  });

  it("T09 destroy cleans compositor", () => {
    const e = StartupCompositorEngine.getOrCreate("t09");
    e.attach();
    expect(e.destroy().ok).toBe(true);
    expect(e.isDestroyed()).toBe(true);
    expect(e.getPhase()).toBe("DESTROYED");
    expect(StartupCompositorEngine.instanceCountForTests()).toBe(0);
    // new getOrCreate after destroy is a fresh instance
    const e2 = StartupCompositorEngine.getOrCreate("t09");
    expect(e2.isDestroyed()).toBe(false);
    expect(e2.getPhase()).toBe("IDLE");
  });

  it("T10 background/foreground no duplicate", () => {
    const e = StartupCompositorEngine.getOrCreate("t10");
    e.attach();
    e.notifyBackground();
    e.notifyForeground();
    expect(StartupCompositorEngine.instanceCountForTests()).toBe(1);
    expect(StartupCompositorEngine.getOrCreate("t10")).toBe(e);
  });

  it("T11 Android adapter contains no package policy", () => {
    expect(existsSync(ANDROID_HOST)).toBe(true);
    const src = read(ANDROID_HOST);
    const code = readCode(ANDROID_HOST);
    expect(src).toContain("PRODUCTION_PRESENTATION_ACTIVE = true");
    for (const token of [
      "choosePackage",
      "selectGeneration",
      "fallbackVisual",
      "StartupBridge",
      "SystemStartSurface",
      "IntroRuntime",
    ]) {
      expect(code.includes(token)).toBe(false);
    }
    expect(code).not.toMatch(/GenerationAuthority|resolveColdActive|promoteStaging/);
  });

  it("T12 iOS adapter contains no package policy", () => {
    expect(existsSync(IOS_HOST)).toBe(true);
    const src = read(IOS_HOST);
    const code = readCode(IOS_HOST);
    expect(src).toContain("productionPresentationActive = true");
    for (const token of [
      "choosePackage",
      "selectGeneration",
      "fallbackVisual",
      "StartupBridge",
      "DibayStartupBridge",
      "SystemStartSurface",
      "IntroRuntime",
    ]) {
      expect(code.includes(token)).toBe(false);
    }
    expect(code).not.toMatch(/GenerationAuthority|resolveColdActive|promoteStaging/);
  });

  it("T13 host has no Cap splash timer ownership", () => {
    const android = readCode(ANDROID_HOST);
    const ios = readCode(IOS_HOST);
    // P7 may schedule SS minVisible / scene duration on host/session — not Cap splash timers.
    expect(android).not.toMatch(/SplashScreen\.|showOnLaunch|CapSplash/);
    expect(ios).not.toMatch(/SplashScreen\.|showOnLaunch|CapSplash/);
  });

  it("T14 no cream / error-board fallback policy", () => {
    const android = readCode(ANDROID_HOST);
    const ios = readCode(IOS_HOST);
    for (const bad of [
      "#FFFCFC",
      "solidHold",
      "ERROR_CONTINUITY",
      "R.drawable",
      "ic_launcher",
    ]) {
      expect(android.includes(bad)).toBe(false);
      expect(ios.includes(bad)).toBe(false);
    }
    expect(android).not.toMatch(/fallbackVisual|createErrorBoard|creamHold/);
    expect(ios).not.toMatch(/fallbackVisual|createErrorBoard|creamHold/);
  });

  it("T15 Cap splash not owned by host; P7 roots wire ONE compositor", () => {
    const android = read(ANDROID_HOST);
    const ios = read(IOS_HOST);
    expect(android).not.toMatch(/SplashScreen|CapSplash|showOnLaunch/);
    expect(ios).not.toMatch(/SplashScreen|CapSplash|showOnLaunch/);
    // P7: MainActivity / RootBridge wire the ONE host (not Cap product splash)
    const main = read(MAIN_ACTIVITY);
    expect(main).toContain("DibayStartupCompositorHost");
    expect(main).toContain("DibayStartupCompositorSession");
    const rootVc = read(IOS_ROOT_VC);
    expect(rootVc).toContain("DibayStartupCompositorHost");
  });

  it("T16 no WebView hide ownership workaround", () => {
    const android = read(ANDROID_HOST);
    const ios = read(IOS_HOST);
    expect(android).not.toMatch(/webView\.|getBridge\(\)|setAlpha|CSS/);
    expect(ios).not.toMatch(/webView\.isHidden|isOpaque|scrollView\.backgroundColor|#FFFCFC/);
  });

  it("T17 no old runtime dependency", () => {
    const android = readCode(ANDROID_HOST);
    const ios = readCode(IOS_HOST);
    const engine = readCode(
      join(ROOT, "lib/startup-compositor/runtime/engine.ts"),
    );
    for (const bad of [
      "DibayStartupBridge",
      "DibaySystemStartSurface",
      "DibayIntroRuntimeController",
      "DibayIntroSceneSurface",
      "presentationReleased",
    ]) {
      expect(android.includes(bad)).toBe(false);
      expect(ios.includes(bad)).toBe(false);
      expect(engine.includes(bad)).toBe(false);
    }
  });

  it("T18 no SystemStart separate surface", () => {
    const android = read(ANDROID_HOST);
    const ios = read(IOS_HOST);
    expect(android).not.toMatch(/SystemStartSurface|SystemStartHost|SystemStartDialog/);
    expect(ios).not.toMatch(/SystemStartSurface|SystemStartHost|SystemStartViewController/);
  });

  it("T19 no Intro separate surface", () => {
    const android = read(ANDROID_HOST);
    const ios = read(IOS_HOST);
    expect(android).not.toMatch(/IntroSurface|IntroHost|IntroDialog|IntroOverlay/);
    expect(ios).not.toMatch(/IntroSurface|IntroHost|IntroViewController|IntroOverlay/);
  });

  it("T20 presentation surface authority count = ONE + Production active (P7)", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(true);
    expect(getStartupCompositorActivation().productionPresentationActive).toBe(true);
    expect(getStartupCompositorActivation().phase).toBe(
      "P7_NATIVE_LIFECYCLE_INTEGRATION",
    );
    const e = StartupCompositorEngine.getOrCreate("t20");
    expect(e.isProductionPresentationActive()).toBe(true);
    e.attach();
    // one engine surface authority — no second engine
    expect(StartupCompositorEngine.instanceCountForTests()).toBe(1);
    expect(COMPOSITOR_EVENT_OWNERSHIP.map((r) => r.event).filter((x) => x === "ATTACH")).toHaveLength(
      1,
    );
  });
});
