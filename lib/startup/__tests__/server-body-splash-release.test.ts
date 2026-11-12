// @vitest-environment jsdom
/** P3 — 서버 본문 첫 프레임 시작 화면 해제 (Owner 「P3 진행」 2026-11-12) */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const destination = vi.hoisted(() => ({ value: "community" as "community" | "intro" }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: destination.value, reason: "test", snapshot: null }),
}));

type Bridge = { dismissSplash: ReturnType<typeof vi.fn>; endHandoffCover: ReturnType<typeof vi.fn> };

async function load(path: string, body: string): Promise<{ mod: typeof import("@/lib/startup/startup-metrics"); bridge: Bridge }> {
  vi.resetModules();
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
  const bridge: Bridge = { dismissSplash: vi.fn(), endHandoffCover: vi.fn() };
  (window as unknown as { DibayBootBridge: Bridge }).DibayBootBridge = bridge;
  const mod = await import("@/lib/startup/startup-metrics");
  return { mod, bridge };
}

const SERVER_BODY = '<main data-main-hub-scroll-body=""><section data-home-banner-slot></section></main>';
const SKELETON = '<main data-main-hub-scroll-body=""><div data-main-shell-document-loading=""></div></main>';

/** 첫 글자 표시(FCP) 기록 흉내 */
const fcp = vi.hoisted(() => ({ painted: true }));

beforeEach(() => {
  destination.value = "community";
  fcp.painted = true;
  vi.spyOn(performance, "getEntriesByName").mockImplementation(((n: string) =>
    n === "first-contentful-paint" && fcp.painted ? [{} as PerformanceEntry] : []) as typeof performance.getEntriesByName);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as { DibayBootBridge?: Bridge }).DibayBootBridge;
});

describe("releaseNativeSplashAtServerBodyFrame", () => {
  it("홈 + 서버 본문 + 커뮤니티 해제 주체 → 다음 프레임에 네이티브 해제 1회, 기록·앱 준비는 하지 않음", async () => {
    const { mod, bridge } = await load("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
    expect(window.__dibayBootMetrics?.serverBodySplashRelease).not.toBeNull();
    expect(mod.getAppReadySnapshot()).toBe(false);
    /** 화면 준비 뒤 기존 경로: 브리지는 다시 부르지 않고 앱 준비 처리만 */
    mod.tryDismissNativeSplash("initialDestinationVisualReady");
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
    expect(mod.getAppReadySnapshot()).toBe(true);
  });

  it("회색 줄 본문(서버 본문 아님)이면 해제하지 않음", async () => {
    const { mod, bridge } = await load("/home", SKELETON);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("허용 목록 밖 화면이면 해제하지 않음", async () => {
    const { mod, bridge } = await load("/philife", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("첫 글자 표시(FCP) 전에는 해제하지 않고, 표시된 다음 프레임에 해제", async () => {
    fcp.painted = false;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const { mod, bridge } = await load("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    frames.shift()!(0);
    frames.shift()!(0);
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    fcp.painted = true;
    frames.shift()!(0);
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    frames.shift()!(0);
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("인트로가 해제를 맡는 문서면 해제하지 않음 (계약 §9)", async () => {
    destination.value = "intro";
    const { mod, bridge } = await load("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("앞당긴 해제가 없으면 기존 경로가 해제한다(무변경)", async () => {
    const { mod, bridge } = await load("/philife", SKELETON);
    mod.tryDismissNativeSplash("initialDestinationVisualReady");
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});
