// @vitest-environment jsdom
/**
 * push-tap-entry P1 (docs/design/push-tap-entry-fix-design-2026-11-13.md) —
 * 알림 목적지가 있는 시작은 목적지 화면이 그려지거나 처리가 끝날 때까지 스플래시를 해제하지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 해제 뒤 진짜 `@capacitor/core` 를 불러오면 window.Capacitor 를 덮어 다음 시험의 가짜 브리지가 사라진다 — 막는다. */
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));

vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

type Bridge = {
  dismissSplash: ReturnType<typeof vi.fn>;
  endHandoffCover: ReturnType<typeof vi.fn>;
  homePresentationReady: ReturnType<typeof vi.fn>;
};

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

async function load(path: string, body = "") {
  vi.resetModules();
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
  const bridge: Bridge = { dismissSplash: vi.fn(), endHandoffCover: vi.fn(), homePresentationReady: vi.fn() };
  (window as unknown as { DibayBootBridge: Bridge }).DibayBootBridge = bridge;
  const metrics = await import("@/lib/startup/startup-metrics");
  const gate = await import("@/lib/startup/launch-push-intent-gate");
  return { metrics, gate, bridge };
}

let native: Deferred | null = null;
let platform: "android" | "ios" = "android";
function installNative(mode: "pending" | "reject" | "absent", plat: "android" | "ios" = "android"): void {
  native = null;
  platform = plat;
  if (mode === "absent") {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    return;
  }
  (window as unknown as { Capacitor: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
    isPluginAvailable: (name: string) => name === "NativeIncomingCall" && platform === "android",
    nativePromise: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          native = { resolve, reject };
        })
    ),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";

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
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("첫 화면 신호 해제 보류", () => {
  it("첫 화면 신호: 홈에서는 보류, 목적지 경로가 그려지면 해제", async () => {
    installNative("pending");
    const { metrics, bridge } = await load("/");
    metrics.markInitialDestinationVisualReady();
    native!.resolve({ path: ROOM });
    await flush();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    expect(metrics.isInitialDestinationVisualReady()).toBe(false);
    window.history.replaceState(null, "", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("첫 화면 신호: 목적지 처리가 끝나면(로그인 시트 등) 지금 화면에서 해제", async () => {
    installNative("pending");
    const { metrics, gate, bridge } = await load("/");
    metrics.markInitialDestinationVisualReady();
    native!.resolve({ path: ROOM });
    await flush();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    gate.settleLaunchPushIntent("login_required");
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("첫 화면 신호: 조회 결과가 목적지 없음이면 해제", async () => {
    installNative("pending");
    const { metrics, bridge } = await load("/");
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    native!.resolve({});
    await flush();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});
