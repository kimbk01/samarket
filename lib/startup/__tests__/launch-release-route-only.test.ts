// @vitest-environment jsdom
/**
 * 앱 진입 SSOT E-1·E-5 / C1′ (`docs/audit/app-entry-ssot-fix-design-2026-11-26.md` §3·§11 · Owner 「C1′로 진행」 2026-11-26).
 * 콜드 알림 진입: OS 화면은 **알림 목적지 경로**의 첫 프레임에서 걷는다 — 경로(어느 화면)만 보고,
 * 목적지가 「다 그려졌나」(로그인 확인·채팅방 입장 대기 · 옛 설계 23-9)는 보지 않는다.
 * 목적지의 대기 모습은 그 화면 자체의 뼈대·저장본이 맡는다(C2).
 */
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const BLOCKED =
  '<div data-auth-session-boundary="blocked" aria-busy="true"><p>불러오는 중…</p></div>';
const ROOM_BUFFERING =
  '<div data-messenger-shell data-cm-room data-cm-room-entry-empty="" data-cm-room-entry-buffering=""><p>채팅방 입장 중…</p></div>';
const ROOM_SHELL = '<div data-messenger-shell data-cm-room class="cm-room-shell"><div>대화</div></div>';

type AndroidBridge = {
  dismissSplash: ReturnType<typeof vi.fn>;
  homePresentationReady: ReturnType<typeof vi.fn>;
  pendingLaunchRoutePath?: () => string;
};

async function load(path: string, body: string, bridgeTarget: string | null) {
  vi.resetModules();
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
  const bridge: AndroidBridge = { dismissSplash: vi.fn(), homePresentationReady: vi.fn() };
  if (bridgeTarget !== null) bridge.pendingLaunchRoutePath = () => bridgeTarget;
  (window as unknown as { DibayBootBridge: AndroidBridge }).DibayBootBridge = bridge;
  const metrics = await import("@/lib/startup/startup-metrics");
  const hold = await import("@/lib/startup/launch-push-hold");
  return { metrics, hold, bridge };
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
});

describe("Android 콜드 알림 진입 — 해제는 경로만 본다 (C1′)", () => {
  it("목적지가 아닌 경로(홈)에서는 해제하지 않는다 — 홈이 보였다가 튀는 것(OS-4 와 같은 모양) 방지", async () => {
    const { metrics, bridge } = await load("/", "<main>홈</main>", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("목적지 경로 + 로그인 확인 중이어도 첫 신호에서 해제(내용 대기 없음)", async () => {
    const { metrics, bridge } = await load(ROOM, BLOCKED, ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
    expect(metrics.isInitialDestinationVisualReady()).toBe(true);
  });

  it("목적지 경로 + 채팅방 입장 대기여도 첫 신호에서 해제", async () => {
    const { metrics, bridge } = await load(ROOM, ROOM_BUFFERING, ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("목적지가 아닌 경로에서 기다리다 수신자가 이동 아닌 결과로 끝내면(markLaunchPushHandled) 지금 화면에서 해제", async () => {
    const { metrics, hold, bridge } = await load("/", "<main>홈</main>", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    hold.markLaunchPushHandled();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("한 번만 해제", async () => {
    const { metrics, bridge } = await load(ROOM, ROOM_SHELL, ROOM);
    metrics.markInitialDestinationVisualReady();
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});

describe("범위 밖은 이전 그대로", () => {
  it("알림 없는 시작(아이콘): 지금 주소에서 해제", async () => {
    const { metrics, bridge } = await load("/", BLOCKED, "");
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
  it("통화 경로 알림은 목적지 보류 대상이 아니다(통화 흐름 불변)", async () => {
    const call = "/community-messenger/calls/abc";
    const { metrics, hold, bridge } = await load(call, "", call);
    expect(hold.isLaunchPushHoldActive()).toBe(false);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});

describe("구조 계약 (C1′)", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("해제 함수는 내용 판정(목적지 그림·D3)을 부르지 않는다 — 경로 판정 2개(알림 목적지·생명주기 이동)만", () => {
    const code = strip(readFileSync("lib/startup/startup-metrics.ts", "utf8"));
    const fn = code.slice(code.indexOf("function releaseForInitialDestination"), code.indexOf("let lifecycleNavReleaseArmed"));
    expect(fn).toContain("mayReleaseLaunchSplashAt(");
    expect(fn).toContain("mayReleaseForLifecycleNav(");
    expect(fn).not.toMatch(/isLaunchDestinationPaintPending|watchLaunchDestinationPaint|isLifecycleNavDestinationPaintHoldActive/);
  });
  it("내용 판정 모듈은 없다", () => {
    expect(existsSync("lib/startup/launch-destination-paint.ts")).toBe(false);
    expect(existsSync("lib/startup/lifecycle-destination-paint-cap.ts")).toBe(false);
  });
});
