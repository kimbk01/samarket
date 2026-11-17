// @vitest-environment jsdom
/**
 * 설계 §24 D2·D4·D7 (docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md) — 알림 진입 중복·병목.
 * 실측(11-18 Xiaomi 채팅 알림): 같은 이동 2회 → 채팅방 RSC 2회 · 덮개 아래 탭 미리 받기 RSC 8건.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const ROOM_SHELL = '<div data-messenger-shell data-cm-room class="cm-room-shell"></div>';

async function load(path: string, body: string, bridgeTarget: string | null) {
  vi.resetModules();
  delete (window as unknown as { __dibayBootMetrics?: unknown }).__dibayBootMetrics;
  window.history.replaceState(null, "", path);
  document.body.innerHTML = body;
  const bridge: Record<string, unknown> = { dismissSplash: vi.fn(), homePresentationReady: vi.fn() };
  if (bridgeTarget !== null) bridge.pendingLaunchRoutePath = () => bridgeTarget;
  (window as unknown as { DibayBootBridge: unknown }).DibayBootBridge = bridge;
  const metrics = await import("@/lib/startup/startup-metrics");
  const hold = await import("@/lib/startup/launch-push-hold");
  const pending = await import("@/lib/startup/launch-push-destination-pending");
  const paint = await import("@/lib/startup/launch-destination-paint");
  return { metrics, hold, pending, paint };
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

describe("D4 알림 목적지 대기 — 탭 미리 받기 멈춤의 기준", () => {
  it("알림 목적지 대기 중 = true · 덮개가 걷히면 false 이고 미룬 일을 1번 실행", async () => {
    const { metrics, pending } = await load(ROOM, "", ROOM);
    expect(pending.isLaunchPushDestinationPending()).toBe(true);
    const run = vi.fn();
    pending.whenLaunchPushDestinationSettled(run);
    expect(run).not.toHaveBeenCalled();
    document.body.innerHTML = ROOM_SHELL;
    metrics.markInitialDestinationVisualReady();
    expect(pending.isLaunchPushDestinationPending()).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("수신자가 끝내도(8초 상한) 미룬 일을 실행", async () => {
    const { hold, pending } = await load(ROOM, "", ROOM);
    const run = vi.fn();
    pending.whenLaunchPushDestinationSettled(run);
    hold.markLaunchPushHandled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("알림 목적지 없는 실행(아이콘·iOS) = 대기 없음 → 바로 실행(이전과 같음)", async () => {
    const { pending } = await load("/", "", null);
    expect(pending.isLaunchPushDestinationPending()).toBe(false);
    const run = vi.fn();
    pending.whenLaunchPushDestinationSettled(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("취소하면 실행하지 않는다", async () => {
    const { metrics, pending } = await load(ROOM, "", ROOM);
    const run = vi.fn();
    const cancel = pending.whenLaunchPushDestinationSettled(run);
    cancel();
    document.body.innerHTML = ROOM_SHELL;
    metrics.markInitialDestinationVisualReady();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("D7 숨김 판정 — 브라우저 한 번 판정 우선", () => {
  it("checkVisibility 가 있으면 그 결과만 쓴다(조상 스타일 순회 없음)", async () => {
    const { paint } = await load(ROOM, ROOM_SHELL, null);
    const el = document.querySelector("[data-cm-room]") as Element & { checkVisibility?: () => boolean };
    const spy = vi.spyOn(window, "getComputedStyle");
    el.checkVisibility = () => false;
    expect(paint.isLaunchDestinationPaintPending(ROOM)).toBe(true);
    el.checkVisibility = () => true;
    expect(paint.isLaunchDestinationPaintPending(ROOM)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("구조 계약", () => {
  const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it("D2: 실제 이동만 기록하고, 같은 경로 2초 안 재이동은 다시 넣기(skip 옵션)여도 무시 · 통화 경로 제외", () => {
    const deliver = listener.slice(listener.indexOf("const deliverRoute = () => {"));
    expect(deliver.slice(0, 200)).toContain("lastDeliveredRouteRef.current = { path, at: Date.now() };");
    const check = listener.indexOf("const delivered = lastDeliveredRouteRef.current;");
    expect(check).toBeGreaterThan(0);
    const block = listener.slice(check, check + 400);
    expect(block).toContain("!isCallPushRoutePath(path)");
    expect(block).not.toContain("skipNotificationDedupe");
    expect(check).toBeLessThan(listener.indexOf("const last = lastRouteRef.current;"));
  });
  const nav = readFileSync("components/layout/BottomNav.tsx", "utf8");
  it("D4: 하단 탭 링크 미리 받기 3곳 모두 대기 중 끔", () => {
    expect(nav.match(/prefetch=\{!launchPushPending && shouldPrefetchMainBottomNavHref\(/g)?.length).toBe(3);
    expect(nav.match(/const launchPushPending = useLaunchPushDestinationPending\(\);/g)?.length).toBe(3);
  });
  const host = readFileSync("components/layout/BottomNavBootIdlePrewarmHost.tsx", "utf8");
  it("D4: 부팅 예열은 대기가 끝난 뒤 · 복귀 재예열은 대기 중 건너뜀", () => {
    expect(host).toContain("whenLaunchPushDestinationSettled(");
    expect(host).toMatch(/if \(isLaunchPushDestinationPending\(\)\) return;\s*latestRef\.current\.router\.prefetch\(href, PREFETCH_FULL\);/);
  });
});
