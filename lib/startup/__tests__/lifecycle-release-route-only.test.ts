// @vitest-environment jsdom
/**
 * 앱 진입 SSOT E-1·E-5 / C1′ (`docs/audit/app-entry-ssot-fix-design-2026-11-26.md` §11 · Owner 「C1′로 진행」 2026-11-26).
 * 직전 화면 복원·첫 화면 설정(생명주기 이동) 콜드 실행:
 * - 시작 주소(`/`)에서는 해제하지 않는다 — 홈이 보였다가 직전 화면으로 튀는 것(11-17 OS-4) 방지.
 * - 목적지 경로에 도착한 첫 프레임에서 해제한다 — 목적지가 「다 그려졌나」(옛 D3)는 보지 않는다.
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
const ROOM_BUFFERING =
  '<div data-messenger-shell data-cm-room data-cm-room-entry-buffering=""></div>';

type Bridge = { dismissSplash: ReturnType<typeof vi.fn>; homePresentationReady: ReturnType<typeof vi.fn> };

async function load(navigateTo: string | null) {
  vi.resetModules();
  decision.navigateTo = navigateTo;
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  document.body.innerHTML = "<main>홈</main>";
  const bridge: Bridge = { dismissSplash: vi.fn(), homePresentationReady: vi.fn() };
  (window as unknown as { DibayBootBridge: Bridge }).DibayBootBridge = bridge;
  const metrics = await import("@/lib/startup/startup-metrics");
  const hold = await import("@/lib/startup/lifecycle-nav-hold");
  hold.lifecycleNavHoldStartPath();
  return { metrics, hold, bridge };
}

beforeEach(() => {
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

describe("생명주기 이동 콜드 실행 — 해제는 경로만 본다 (C1′)", () => {
  it("시작 주소(홈)의 첫 프레임에서는 해제하지 않는다(OS-4 방지)", async () => {
    const { metrics, bridge } = await load(ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
  });

  it("목적지 도착 첫 프레임에서 해제 — 채팅방 입장 대기여도 기다리지 않는다", async () => {
    const { metrics, hold, bridge } = await load(ROOM);
    metrics.markInitialDestinationVisualReady();
    window.history.replaceState(null, "", ROOM);
    document.body.innerHTML = ROOM_BUFFERING;
    hold.settleLifecycleNavHold();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("이동하지 않기로 정해지면(알림 의도·사용자 이동·같은 화면) 지금 화면에서 해제", async () => {
    const { metrics, hold, bridge } = await load(ROOM);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).not.toHaveBeenCalled();
    hold.settleLifecycleNavHold();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("이동 예정이 없는 문서는 바로 해제", async () => {
    const { metrics, bridge } = await load(null);
    metrics.markInitialDestinationVisualReady();
    expect(bridge.dismissSplash).toHaveBeenCalledTimes(1);
  });
});

describe("구조 계약", () => {
  const effects = readFileSync("lib/lifecycle/lifecycle-route-effects.client.ts", "utf8");
  it("D2-R: 복원 채팅방 미리 받기는 실제 이동(router.replace) 직전 한 곳에서만", () => {
    expect(effects).toMatch(/prefetchLaunchRoomEntry\(navigateTo, "lifecycle_restore"\);\s*router\.replace\(navigateTo\);/);
    expect(effects.match(/prefetchLaunchRoomEntry\(/g)?.length).toBe(1);
  });
  it("도착 처리: 두 프레임 뒤 보류 해제 → 해제 판정 · 타이머·내용 판정 없음", () => {
    expect(effects).toMatch(/settleLifecycleNavHold\(\);\s*markInitialDestinationVisualReady\(\);/);
    expect(effects).not.toMatch(/setTimeout\(|armLifecycleDestinationPaintCap|noteLifecycleNavIssued/);
  });
});
