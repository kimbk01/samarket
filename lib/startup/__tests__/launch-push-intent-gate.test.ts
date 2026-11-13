// @vitest-environment jsdom
/**
 * push-tap-entry P1 (docs/design/push-tap-entry-fix-design-2026-11-13.md) —
 * 알림 목적지가 있는 시작은 목적지 화면이 그려지거나 처리가 끝날 때까지 스플래시를 해제하지 않는다.
 */
import { readFileSync } from "node:fs";
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

const SERVER_BODY = '<main data-main-hub-scroll-body=""><section></section></main>';
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

describe("launch-push-intent-gate 상태", () => {
  it("네이티브 조회 불가(웹·구버전) → 즉시 none, 어디서든 해제 가능", async () => {
    installNative("absent");
    const { gate } = await load("/");
    gate.startLaunchPushIntentProbe();
    expect(gate.getLaunchPushIntentState().kind).toBe("none");
    expect(gate.mayReleaseSplashAtPath("/")).toBe(true);
  });

  it("조회 중(unknown)에는 해제하지 않음 → 목적지 없음이면 none", async () => {
    installNative("pending");
    const { gate } = await load("/");
    gate.startLaunchPushIntentProbe();
    expect(gate.mayReleaseSplashAtPath("/")).toBe(false);
    native!.resolve({});
    await flush();
    expect(gate.getLaunchPushIntentState().kind).toBe("none");
  });

  it("iOS(플러그인 없음) → 네이티브를 부르지 않고 즉시 none — iOS 브리지는 없는 플러그인에 응답하지 않는다", async () => {
    installNative("pending", "ios");
    const { gate } = await load("/");
    gate.startLaunchPushIntentProbe();
    expect(gate.getLaunchPushIntentState().kind).toBe("none");
    const cap = (window as unknown as { Capacitor: { nativePromise: ReturnType<typeof vi.fn> } }).Capacitor;
    expect(cap.nativePromise).not.toHaveBeenCalled();
  });

  it("네이티브 오류(iOS 메서드 없음 등) → none", async () => {
    installNative("pending");
    const { gate } = await load("/");
    gate.startLaunchPushIntentProbe();
    native!.reject(new Error("not implemented"));
    await flush();
    expect(gate.getLaunchPushIntentState().kind).toBe("none");
  });

  it("목적지 있음 → 그 경로에서만 해제 가능, settle 후에는 어디서든", async () => {
    installNative("pending");
    const { gate } = await load("/");
    gate.startLaunchPushIntentProbe();
    native!.resolve({ path: ROOM, notificationId: "n1" });
    await flush();
    expect(gate.getLaunchPushIntentState()).toEqual({ kind: "pending", path: ROOM });
    expect(gate.mayReleaseSplashAtPath("/")).toBe(false);
    expect(gate.mayReleaseSplashAtPath(ROOM)).toBe(true);
    gate.settleLaunchPushIntent("login_required");
    expect(gate.mayReleaseSplashAtPath("/")).toBe(true);
  });

  it("통화 경로 목적지는 대상 아님 → none (통화 시작 흐름 불변)", async () => {
    installNative("pending");
    const { gate } = await load("/");
    gate.startLaunchPushIntentProbe();
    native!.resolve({ path: "/community-messenger/calls-v4/abc?action=accept" });
    await flush();
    expect(gate.getLaunchPushIntentState().kind).toBe("none");
  });
});

describe("스플래시 해제 연결", () => {
  it("P3: 알림 목적지가 있으면 홈 서버 본문 첫 그림에서 해제하지 않음", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    installNative("pending");
    const { metrics, bridge } = await load("/", SERVER_BODY);
    metrics.releaseNativeSplashAtServerBodyFrame();
    frames.shift()!(0);
    native!.resolve({ path: ROOM });
    await flush();
    while (frames.length) frames.shift()!(0);
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("P3: 목적지 없음이 확인되면 기존처럼 홈에서 해제", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    installNative("pending");
    const { metrics, bridge } = await load("/", SERVER_BODY);
    metrics.releaseNativeSplashAtServerBodyFrame();
    frames.shift()!(0); // 조회 중 → 다음 프레임 예약
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    native!.resolve({});
    await flush();
    while (frames.length) frames.shift()!(0);
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

});

describe("PushRouteListener 종료 분기 계약", () => {
  const src = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it.each([
    "route_consumed",
    "consume_unconfirmed",
    "account_mismatch",
    "unsafe_path",
    "login_required",
    "write_draft_kept",
    "support_modal",
    "notification_tap_dropped",
  ])("settleLaunchPushIntent(%s) 호출이 있다", (reason) => {
    expect(src).toMatch(new RegExp(`settleLaunchPushIntent\\(\\s*[^)]*"${reason}"`));
  });
  it("비회원·손상으로 로그인 확인이 끝나면 보류 해제", () => {
    expect(src).toMatch(/phase === "terminal_guest" \|\| phase === "corrupt"\) settleLaunchPushIntent/);
  });
  it("auth_resolution_hold 분기는 보류를 유지(해제 호출 없음)", () => {
    const hold = src.slice(src.indexOf('source: "auth_resolution_hold"'), src.indexOf('console.info("[push-route] auth_resolution_hold"'));
    expect(hold).not.toContain("settleLaunchPushIntent");
  });
});
