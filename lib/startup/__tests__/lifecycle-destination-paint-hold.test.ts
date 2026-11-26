// @vitest-environment jsdom
/**
 * 감사 2026-11-26 D3 (docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md) — 아이콘 실행이 직전 채팅방을 복원할 때
 * 주소만 바뀐 순간 덮개가 걷혀 흰 화면 약 0.6초 → 「채팅방 입장 중…」 약 0.8초가 보였다(Samsung 녹화 13:10 PHT).
 * 생명주기 이동을 실제로 낸 문서는 도착한 목적지가 자리 표시인 동안 해제하지 않는다(알림 목적지 23-9 와 같은 판정).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decision = { navigateTo: null as string | null, kind: "os_restore" as string };
vi.mock("@/lib/lifecycle/app-entry-kind", () => ({
  getAppEntryDecision: () => ({ kind: decision.kind, reason: "test", navigateTo: decision.navigateTo }),
  appEntryAllowsIntro: () => false,
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const BLOCKED = '<div data-auth-session-boundary="blocked" aria-busy="true"></div>';
const ROOM_BUFFERING =
  '<div data-messenger-shell data-cm-room data-cm-room-entry-buffering=""><p>채팅방 입장 중…</p></div>';
const ROOM_SHELL = '<div data-messenger-shell data-cm-room class="cm-room-shell"><div>대화</div></div>';

type Bridge = { dismissSplash: ReturnType<typeof vi.fn>; homePresentationReady: ReturnType<typeof vi.fn> };
let resetPaint: (() => void) | null = null;

async function load(navigateTo: string | null) {
  vi.resetModules();
  decision.navigateTo = navigateTo;
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  document.body.innerHTML = "";
  const bridge: Bridge = { dismissSplash: vi.fn(), homePresentationReady: vi.fn() };
  (window as unknown as { DibayBootBridge: Bridge }).DibayBootBridge = bridge;
  const metrics = await import("@/lib/startup/startup-metrics");
  const hold = await import("@/lib/startup/lifecycle-nav-hold");
  const paint = await import("@/lib/startup/launch-destination-paint");
  resetPaint = paint.__resetLaunchDestinationPaintForTests;
  hold.lifecycleNavHoldStartPath();
  return { metrics, hold, bridge };
}

/** 복원 이동이 목적지에 도착한 상태 — 이동 쪽이 부르는 순서 그대로 */
function arrive(hold: typeof import("@/lib/startup/lifecycle-nav-hold"), path: string, body: string) {
  hold.noteLifecycleNavIssued();
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
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

describe("생명주기 복원 목적지 그림 보류 (D3)", () => {
  it("복원 도착 직후 「채팅방 입장 중」이면 해제하지 않고, 채팅방이 그려지면 해제한다", async () => {
    const { metrics, hold, bridge } = await load(ROOM);
    arrive(hold, ROOM, ROOM_BUFFERING);
    hold.settleLifecycleNavHold();
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    document.body.innerHTML = ROOM_SHELL;
    await flush();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("로그인 확인 막음(흰 화면 구간)도 보류한다", async () => {
    const { metrics, hold, bridge } = await load("/mypage");
    arrive(hold, "/mypage", BLOCKED);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    document.body.innerHTML = "<main>내정보</main>";
    await flush();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("셸 신호가 도착 처리보다 먼저 와도(주소만 바뀐 상태) 같은 판정", async () => {
    const { metrics, hold, bridge } = await load(ROOM);
    arrive(hold, ROOM, "");
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("상한이 지나면 지금 화면에서 해제한다", async () => {
    const { metrics, hold, bridge } = await load(ROOM);
    arrive(hold, ROOM, ROOM_BUFFERING);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    hold.capLifecycleNavDestinationPaint();
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("목적지가 자리 표시가 아니면 이전처럼 바로 해제한다", async () => {
    const { metrics, hold, bridge } = await load("/philife");
    arrive(hold, "/philife", "<main>라운지</main>");
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("이동을 내지 않은 문서(알림 의도·사용자 이동)는 보류하지 않는다", async () => {
    const { metrics, hold, bridge } = await load(ROOM);
    hold.settleLifecycleNavHold();
    window.history.replaceState(null, "", ROOM);
    document.body.innerHTML = ROOM_BUFFERING;
    expect(hold.isLifecycleNavDestinationPaintHoldActive(ROOM)).toBe(false);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("보류가 없던 문서(복원 없음)는 이동 표시를 해도 보류하지 않는다", async () => {
    const { hold } = await load(null);
    hold.noteLifecycleNavIssued();
    expect(hold.isLifecycleNavDestinationPaintHoldActive(ROOM)).toBe(false);
  });
});

describe("구조 계약", () => {
  const effects = readFileSync("lib/lifecycle/lifecycle-route-effects.client.ts", "utf8");
  it("D2-R: 복원 채팅방 미리 받기는 실제 이동(router.replace) 직전 한 곳에서만", () => {
    expect(effects).toMatch(
      /prefetchLaunchRoomEntry\(navigateTo, "lifecycle_restore"\);\s*noteLifecycleNavIssued\(\);\s*router\.replace\(navigateTo\);/
    );
    expect(effects.match(/prefetchLaunchRoomEntry\(/g)?.length).toBe(1);
  });
  it("이동 표시는 router.replace 바로 앞에서만", () => {
    expect(effects).toMatch(/noteLifecycleNavIssued\(\);\s*router\.replace\(navigateTo\);/);
    expect(effects.match(/noteLifecycleNavIssued\(\)/g)?.length).toBe(1);
  });
  it("도착 처리: 상한을 건 뒤 해제 판정 · 상한 8초(알림 목적지와 같은 값) · 이동 쪽에는 타이머 없음", () => {
    expect(effects).toMatch(
      /armLifecycleDestinationPaintCap\(\);\s*settleLifecycleNavHold\(\);\s*markInitialDestinationVisualReady\(\);/
    );
    expect(effects).not.toMatch(/setTimeout\(/);
    const cap = readFileSync("lib/startup/lifecycle-destination-paint-cap.ts", "utf8");
    expect(cap).toContain("LIFECYCLE_DESTINATION_PAINT_CAP_MS = 8_000");
  });
});
