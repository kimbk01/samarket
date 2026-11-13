// @vitest-environment jsdom
/**
 * 재설계 A (docs/design/push-tap-entry-redesign-2026-11-13.md) — 알림 목적지 시작의 스플래시 해제 보류.
 * 핵심: 동기 읽기만 — iOS(브리지 객체 없음)·웹·구버전은 기존 동작, 기다림 없음.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 해제 뒤 진짜 `@capacitor/core` 를 불러오면 전역을 바꿀 수 있어 막는다. */
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const SERVER_BODY = '<main data-main-hub-scroll-body=""><section></section></main>';

type AndroidBridge = {
  dismissSplash: ReturnType<typeof vi.fn>;
  homePresentationReady: ReturnType<typeof vi.fn>;
  pendingLaunchRoutePath?: () => string;
};

async function load(path: string, body: string, bridgeTarget: string | null | "absent" | "throws") {
  vi.resetModules();
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
  const bridge: AndroidBridge = { dismissSplash: vi.fn(), homePresentationReady: vi.fn() };
  if (bridgeTarget === "throws") {
    bridge.pendingLaunchRoutePath = () => {
      throw new Error("boom");
    };
  } else if (bridgeTarget !== "absent") {
    bridge.pendingLaunchRoutePath = () => bridgeTarget ?? "";
  }
  (window as unknown as { DibayBootBridge: AndroidBridge }).DibayBootBridge = bridge;
  const metrics = await import("@/lib/startup/startup-metrics");
  const hold = await import("@/lib/startup/launch-push-hold");
  return { metrics, hold, bridge };
}

/** iOS: window.DibayBootBridge 객체가 없고 webkit 메시지 핸들러만 있다. */
async function loadIos(path: string, body: string) {
  vi.resetModules();
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  delete (window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge;
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
  const postMessage = vi.fn();
  (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { DibayBootBridge: { postMessage } } };
  const metrics = await import("@/lib/startup/startup-metrics");
  const hold = await import("@/lib/startup/launch-push-hold");
  return { metrics, hold, postMessage };
}

beforeEach(() => {
  vi.spyOn(performance, "getEntriesByName").mockImplementation(((n: string) =>
    n === "first-contentful-paint" ? [{} as PerformanceEntry] : []) as typeof performance.getEntriesByName);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge;
  delete (window as unknown as { webkit?: unknown }).webkit;
});

describe("목적지 읽기 (동기)", () => {
  it("메서드 없음(구버전 Android) → 목적지 없음", async () => {
    const { hold } = await load("/", "", "absent");
    expect(hold.readLaunchPushTarget()).toBeNull();
    expect(hold.mayReleaseLaunchSplashAt("/")).toBe(true);
  });
  it("빈 문자열 → 목적지 없음", async () => {
    const { hold } = await load("/", "", "");
    expect(hold.readLaunchPushTarget()).toBeNull();
  });
  it("메서드 예외 → 목적지 없음", async () => {
    const { hold } = await load("/", "", "throws");
    expect(hold.readLaunchPushTarget()).toBeNull();
  });
  it("통화 경로 → 목적지 없음(통화 흐름 불변)", async () => {
    const { hold } = await load("/", "", "/community-messenger/calls-v4/x?action=accept");
    expect(hold.readLaunchPushTarget()).toBeNull();
  });
  it("목적지 있음 → 그 경로에서만 해제, 수신자가 끝내면 어디서든", async () => {
    const { hold } = await load("/", "", ROOM);
    expect(hold.mayReleaseLaunchSplashAt("/")).toBe(false);
    expect(hold.mayReleaseLaunchSplashAt(ROOM)).toBe(true);
    hold.markLaunchPushHandled();
    expect(hold.mayReleaseLaunchSplashAt("/")).toBe(true);
  });
});

describe("iOS — 브리지 객체 없음: 기존 동작 그대로, 기다림 없음", () => {
  it("P3 홈 서버 본문 첫 그림에서 바로 해제", async () => {
    const { metrics, hold, postMessage } = await loadIos("/", SERVER_BODY);
    metrics.releaseNativeSplashAtServerBodyFrame();
    expect(hold.readLaunchPushTarget()).toBeNull();
    expect(postMessage).toHaveBeenCalled();
  });
  it("첫 목적지 신호에서 바로 해제", async () => {
    const { metrics } = await loadIos("/", "");
    metrics.markInitialDestinationVisualReady();
    expect(metrics.isInitialDestinationVisualReady()).toBe(true);
  });
});

describe("Android — 알림 목적지 시작", () => {
  it("P3: 홈 서버 본문 첫 그림에서 해제하지 않음", async () => {
    const { metrics, bridge } = await load("/", SERVER_BODY, ROOM);
    metrics.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });
  it("첫 목적지 신호: 홈에서는 보류, 목적지 경로가 그려지면 해제", async () => {
    const { metrics, bridge } = await load("/", "", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    window.history.replaceState(null, "", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
  it("수신자가 이동 아닌 결과로 끝내면 지금 화면에서 해제", async () => {
    const { metrics, hold, bridge } = await load("/", "", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    hold.markLaunchPushHandled();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
  it("알림 없는 시작(빈 값) → 기존처럼 홈에서 해제", async () => {
    const { metrics, bridge } = await load("/", SERVER_BODY, "");
    metrics.releaseNativeSplashAtServerBodyFrame();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});

describe("구조 계약", () => {
  const hold = readFileSync("lib/startup/launch-push-hold.ts", "utf8");
  const code = hold.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("비동기 호출·기다림 없음 (iOS 무응답 장애 재발 방지)", () => {
    expect(code).not.toMatch(/nativePromise|await |Promise|setTimeout|then\(/);
  });
  const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it("수신자는 단일 종료 지점에서만 해제 허용", () => {
    expect(listener).toMatch(/if \(launchOutcome === "ended"\) markLaunchPushHandled\(\);/);
    expect(listener.match(/launchOutcome = "held"/g)?.length).toBe(1);
    expect(listener.match(/launchOutcome = "navigated"/g)?.length).toBe(1);
  });
});
