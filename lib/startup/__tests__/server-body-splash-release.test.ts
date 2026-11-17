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
  delete (window as unknown as { __DIBAY_NATIVE_SPLASH_COVER__?: string }).__DIBAY_NATIVE_SPLASH_COVER__;
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

  it("G1: Android 앱 안 덮개가 있는 실행(빌드 69 문서 시작 값 \"1\")도 P3 로 해제 1회 · 화면 준비 뒤 다시 부르지 않음", async () => {
    (window as unknown as { __DIBAY_NATIVE_SPLASH_COVER__?: string }).__DIBAY_NATIVE_SPLASH_COVER__ = "1";
    const { mod, bridge } = await load("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
    mod.tryDismissNativeSplash("initialDestinationVisualReady");
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("앞당긴 해제가 없으면 기존 경로가 해제한다(무변경)", async () => {
    const { mod, bridge } = await load("/philife", SKELETON);
    mod.tryDismissNativeSplash("initialDestinationVisualReady");
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});

/** 설계 H (Owner 「Approve design H」 2026-11-18 · 문서 §11·§12) */
describe("H1·H2 — 서버 본문 프레임 표시가 있으면 FCP·다음 프레임 없이 즉시 새 해제", () => {
  type MarkWin = { __DIBAY_SERVER_BODY_FRAME__?: boolean; __dibayServerBodyFrame?: () => void };
  async function loadPainted(path: string, body: string) {
    const r = await load(path, body);
    const painted = vi.fn();
    (window as unknown as { DibayBootBridge: Bridge & { dismissSplashPainted: () => void } }).DibayBootBridge.dismissSplashPainted =
      painted;
    return { ...r, painted };
  }
  afterEach(() => {
    delete (window as unknown as MarkWin).__DIBAY_SERVER_BODY_FRAME__;
    delete (window as unknown as MarkWin).__dibayServerBodyFrame;
  });

  it("표시가 이미 있으면 FCP 가 없어도 즉시 새 해제 1회 · 기존 해제는 부르지 않음 · 화면 준비 뒤 다시 부르지 않음", async () => {
    fcp.painted = false;
    vi.stubGlobal("requestAnimationFrame", () => 0); // 다음 프레임이 오지 않는 상황(hydration 스크립트 연속 실행)
    (window as unknown as MarkWin).__DIBAY_SERVER_BODY_FRAME__ = true;
    const { mod, bridge, painted } = await loadPainted("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(painted).toHaveBeenCalledTimes(1);
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    mod.tryDismissNativeSplash("initialDestinationVisualReady");
    expect(painted).toHaveBeenCalledTimes(1);
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    expect(mod.getAppReadySnapshot()).toBe(true);
  });

  it("표시가 아직 없으면 기다렸다가 표시가 생길 때 새 해제", async () => {
    fcp.painted = false;
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const { mod, bridge, painted } = await loadPainted("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(painted).not.toHaveBeenCalled();
    (window as unknown as MarkWin).__DIBAY_SERVER_BODY_FRAME__ = true;
    (window as unknown as MarkWin).__dibayServerBodyFrame?.();
    expect(painted).toHaveBeenCalledTimes(1);
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("회색 줄 본문 · 인트로 문서면 새 해제도 하지 않음", async () => {
    (window as unknown as MarkWin).__DIBAY_SERVER_BODY_FRAME__ = true;
    const a = await loadPainted("/home", SKELETON);
    a.mod.releaseNativeSplashAtServerBodyFrame();
    expect(a.painted).not.toHaveBeenCalled();
    destination.value = "intro";
    const b = await loadPainted("/home", SERVER_BODY);
    b.mod.releaseNativeSplashAtServerBodyFrame();
    expect(b.painted).not.toHaveBeenCalled();
  });

  it("새 해제가 없는 설치 앱(≤70)은 표시가 있어도 FCP 경로 그대로", async () => {
    (window as unknown as MarkWin).__DIBAY_SERVER_BODY_FRAME__ = true;
    const { mod, bridge } = await load("/home", SERVER_BODY);
    mod.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("H1 인라인 스크립트: 새 해제가 있는 앱에서만 프레임 2번 뒤 표시 + 등록된 함수 호출", async () => {
    const { SERVER_BODY_FRAME_MARK_SCRIPT } = await import("@/lib/startup/server-body-frame-mark");
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const w = window as unknown as MarkWin & { DibayBootBridge?: Record<string, unknown> };
    w.DibayBootBridge = { dismissSplash: vi.fn() };
    new Function(SERVER_BODY_FRAME_MARK_SCRIPT)();
    expect(frames.length).toBe(0); // 구 설치 앱 — 무동작
    const listener = vi.fn();
    w.__dibayServerBodyFrame = listener;
    w.DibayBootBridge = { dismissSplash: vi.fn(), dismissSplashPainted: vi.fn() };
    new Function(SERVER_BODY_FRAME_MARK_SCRIPT)();
    frames.shift()?.(0);
    expect(w.__DIBAY_SERVER_BODY_FRAME__).toBeUndefined();
    frames.shift()?.(0);
    expect(w.__DIBAY_SERVER_BODY_FRAME__).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
