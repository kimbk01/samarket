// @vitest-environment jsdom
/**
 * 설계 23-9 (docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md) — 알림 목적지 시작에서
 * 경로만 맞고 화면이 목적지 자리 표시(로그인 확인 중·채팅방 입장 대기·채팅방 화면 없음)면 시작 화면을 걷지 않는다.
 * 실측: 11-18 Xiaomi 실제 채팅 알림 탭 — 해제 순간 화면 = `data-auth-session-boundary="blocked"` 「불러오는 중…」.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const ORDER = "/orders/store/9f1c";
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

let resetPaint: (() => void) | null = null;

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
  const paint = await import("@/lib/startup/launch-destination-paint");
  resetPaint = paint.__resetLaunchDestinationPaintForTests;
  return { metrics, hold, paint, bridge };
}

/** MutationObserver 콜백(마이크로태스크) 처리 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.spyOn(performance, "getEntriesByName").mockImplementation(((n: string) =>
    n === "first-contentful-paint" ? [{} as PerformanceEntry] : []) as typeof performance.getEntriesByName);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  resetPaint?.();
  resetPaint = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge;
});

describe("목적지 그림 판정 (순수)", () => {
  it("로그인 확인 막음이 보이면 대기 — 경로와 무관", async () => {
    const { paint } = await load(ORDER, BLOCKED, null);
    expect(paint.isLaunchDestinationPaintPending(ORDER)).toBe(true);
  });
  it("숨긴 보관 화면 안의 막음·입장 대기는 세지 않는다", async () => {
    const { paint } = await load(ORDER, `<div style="display: none">${BLOCKED}${ROOM_BUFFERING}</div>`, null);
    expect(paint.isLaunchDestinationPaintPending(ORDER)).toBe(false);
  });
  it("채팅방 경로: 입장 대기면 대기 · 채팅방 화면이 없으면 대기 · 그려지면 아님", async () => {
    const { paint } = await load(ROOM, ROOM_BUFFERING, null);
    expect(paint.isLaunchDestinationPaintPending(ROOM)).toBe(true);
    document.body.innerHTML = "";
    expect(paint.isLaunchDestinationPaintPending(ROOM)).toBe(true);
    document.body.innerHTML = ROOM_SHELL;
    expect(paint.isLaunchDestinationPaintPending(ROOM)).toBe(false);
  });
  it("채팅방 입장 실패 화면(최종 상태)은 그림으로 본다", async () => {
    const { paint } = await load(
      ROOM,
      '<div data-messenger-shell data-cm-room data-cm-room-entry-empty="" data-cm-room-entry-failed=""></div>',
      null
    );
    expect(paint.isLaunchDestinationPaintPending(ROOM)).toBe(false);
  });
  it("채팅방이 아닌 목적지는 막음이 없으면 바로 그림", async () => {
    const { paint } = await load(ORDER, "<main><section>주문</section></main>", null);
    expect(paint.isLaunchDestinationPaintPending(ORDER)).toBe(false);
  });
});

describe("Android 알림 목적지 시작 — 해제 시점 (실측 재현)", () => {
  it("채팅방 경로 + 로그인 확인 중 → 해제 안 함 · 막음 풀리고 채팅방이 그려지면 해제", async () => {
    const { metrics, bridge } = await load(ROOM, BLOCKED, ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();

    document.body.innerHTML = ROOM_BUFFERING;
    await flush();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();

    document.body.innerHTML = ROOM_SHELL;
    await flush();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
    expect(metrics.isInitialDestinationVisualReady()).toBe(true);
  });

  it("채팅방 경로 + 아무것도 없음(휴대폰 loading.tsx) → 해제 안 함", async () => {
    const { metrics, bridge } = await load(ROOM, "", ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("상한: 수신자가 끝냄(8초 확인 실패 → markLaunchPushHandled) → 지금 화면에서 해제", async () => {
    const { metrics, hold, bridge } = await load(ROOM, BLOCKED, ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    hold.markLaunchPushHandled();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("해제 뒤에는 화면 변경을 더 관찰하지 않는다(한 번만 해제)", async () => {
    const { metrics, bridge } = await load(ROOM, BLOCKED, ROOM);
    metrics.markInitialDestinationVisualReady();
    document.body.innerHTML = ROOM_SHELL;
    await flush();
    document.body.innerHTML = BLOCKED;
    await flush();
    document.body.innerHTML = ROOM_SHELL;
    await flush();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("채팅방이 아닌 목적지 + 막음 없음 → 경로가 맞는 첫 신호에서 바로 해제(이전과 같음)", async () => {
    const { metrics, bridge } = await load(ORDER, "<main>주문</main>", ORDER);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});

describe("범위 밖은 이전 그대로", () => {
  it("알림 없는 시작(아이콘): 막음이 보여도 판정하지 않는다", async () => {
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

describe("구조 계약", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("판정 모듈: 타이머·비동기 없음(화면 변경 관찰만)", () => {
    const code = strip(readFileSync("lib/startup/launch-destination-paint.ts", "utf8"));
    expect(code).not.toMatch(/setTimeout|setInterval|await |Promise|then\(/);
    expect(code).toContain("MutationObserver");
  });
  const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it("수신자 확인: 같은 8초 상한 안에서 목적지 그림까지 지켜본다", () => {
    expect(listener).toMatch(/acked && \(!isLaunchPushHoldActive\(\) \|\| isInitialDestinationVisualReady\(\)\)/);
    expect(listener).toMatch(/Date\.now\(\) - started > 8_000\) \{\s*window\.clearInterval\(timer\);/);
  });
  it("통화 경로는 확인 루프에 들어가지 않는다", () => {
    const fn = listener.slice(listener.indexOf("function finalizePushRouteConsume"));
    expect(fn.indexOf("if (isCallPushRoutePath(path)) {")).toBeLessThan(fn.indexOf("setInterval"));
  });
});
