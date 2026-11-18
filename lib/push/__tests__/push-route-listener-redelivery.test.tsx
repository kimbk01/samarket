/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * FAIL-3 — PushRouteListener 를 실제로 그려 `dibay:push-route` 이벤트로 시험한다.
 * 판정 입력: 첫 이동 시각(실제 이동 기록)·재주입 시각·현재 주소.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => window.location.pathname,
}));
vi.mock("@/lib/platform/capacitor-native", async (orig) => ({
  ...(await orig<typeof import("@/lib/platform/capacitor-native")>()),
  isCapacitorNativePlatform: () => true,
}));
vi.mock("@/lib/auth/dibay-session-manager", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/dibay-session-manager")>()),
  getSessionPhase: () => "authenticated",
  subscribeSessionPhase: () => () => {},
}));
const ackNative = vi.fn(async (_o: { path: string; notificationId?: string | null }) => {});
vi.mock("@/lib/push/native/push-route-native-bridge", async (orig) => ({
  ...(await orig<typeof import("@/lib/push/native/push-route-native-bridge")>()),
  ackNativePushRouteConsumed: (o: { path: string; notificationId?: string | null }) => ackNative(o),
  clearNativePersistedPendingPushRoute: vi.fn(async () => {}),
  notifyNativePushRouteConsumerReady: vi.fn(async () => {}),
  readNativePersistedPendingPushRoute: vi.fn(async () => null),
}));
const removeDelivered = vi.fn(async (_i: unknown) => {});
vi.mock("@/lib/push/native/remove-delivered-notifications", async (orig) => ({
  ...(await orig<typeof import("@/lib/push/native/remove-delivered-notifications")>()),
  removeDeliveredNotificationOnPushTap: (i: unknown) => removeDelivered(i),
}));
const openedRead = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/notifications/client/notification-event-read-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/notifications/client/notification-event-read-client")>()),
  postNotificationEventOpenedRead: (...a: unknown[]) => openedRead(...a),
}));

const ROOM = "/community-messenger/rooms/room-a";
const CALL = "/community-messenger/calls/call-a";
const LIST = "/community-messenger";
const T0 = Date.UTC(2026, 10, 18, 3, 0, 0);

let root: Root | null = null;

function setPath(p: string) {
  window.history.replaceState(null, "", p);
}

async function tap(path: string, notificationId: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("dibay:push-route", { detail: { path, notificationId } }));
  });
}

async function mount() {
  const { PushRouteListener } = await import("@/components/push/PushRouteListener");
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<PushRouteListener />);
  });
}

// 리스너 모듈 그래프가 커서 첫 변환이 오래 걸린다 — 시험 시간 초과와 분리해 미리 한 번 불러 둔다.
beforeAll(async () => {
  await import("@/components/push/PushRouteListener");
}, 60_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(T0);
  window.sessionStorage.clear();
  window.localStorage.clear();
  setPath(LIST);
  push.mockClear();
  replace.mockClear();
  ackNative.mockClear();
  removeDelivered.mockClear();
  openedRead.mockClear();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  vi.useRealTimers();
  vi.resetModules();
});

/** 첫 알림으로 방에 이동. arrive=true 면 주소가 방이 되고 첫 ACK 까지 끝난다. */
async function firstNavigation(arrive: boolean) {
  await mount();
  await tap(ROOM, "first-id");
  expect(push).toHaveBeenCalledTimes(1);
  if (arrive) setPath(ROOM);
  await act(async () => {
    vi.advanceTimersByTime(arrive ? 500 : 0);
  });
  push.mockClear();
  ackNative.mockClear();
  removeDelivered.mockClear();
  openedRead.mockClear();
}

describe("FAIL-3 — 리스너 동작: 2~5초 같은 방 재주입", () => {
  it("2.5초 뒤 다른 id · 주소가 아직 방 아님(◁ 로 목록 / 첫 이동 미도착) → 이동 없음 · ACK 없음", async () => {
    await firstNavigation(false);
    setPath(LIST);
    vi.setSystemTime(T0 + 2_500);
    await tap(ROOM, "e171e6ad");
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(ackNative).not.toHaveBeenCalled();
  });

  it("2.5초 뒤 다른 id · 주소가 그 방 → same_route_ack 와 같은 처리(소비·member A·ACK·트레이 제거) · 이동 없음", async () => {
    await firstNavigation(true);
    vi.setSystemTime(T0 + 2_500);
    await tap(ROOM, "e171e6ad");
    expect(push).not.toHaveBeenCalled();
    expect(ackNative).toHaveBeenCalledTimes(1);
    expect(ackNative).toHaveBeenCalledWith({ path: ROOM, notificationId: "e171e6ad" });
    expect(openedRead).toHaveBeenCalledWith("e171e6ad", { requireMemberA: true });
    expect(removeDelivered).toHaveBeenCalledTimes(1);
    expect(removeDelivered.mock.calls[0]?.[0]).toMatchObject({ notificationId: "e171e6ad" });
    // 소비 표시: 같은 id 를 다시 보내면 알림 id 거르기에 걸린다
    vi.setSystemTime(T0 + 6_000);
    ackNative.mockClear();
    await tap(ROOM, "e171e6ad");
    expect(ackNative).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("승인된 절충: 첫 이동 5초 안에 같은 방 새 알림은 (주소가 방이 아니면) 무시된다 · 5초 뒤는 이동", async () => {
    await firstNavigation(false);
    vi.setSystemTime(T0 + 4_900);
    await tap(ROOM, "new-id-1");
    expect(push).not.toHaveBeenCalled();
    vi.setSystemTime(T0 + 5_000);
    await tap(ROOM, "new-id-2");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("2초 안 중복은 원래대로 무시만(주소가 방이어도 ACK·이동 없음)", async () => {
    await firstNavigation(true);
    vi.setSystemTime(T0 + 1_000);
    await tap(ROOM, "dup-id");
    expect(push).not.toHaveBeenCalled();
    expect(ackNative).not.toHaveBeenCalled();
  });
});

describe("FAIL-3 — 통화 경로 불변", () => {
  it("통화 경로는 같은 경로 이동 기록 거르기 대상이 아니다(2.5초 뒤 다른 id → 다시 통화 경로 처리)", async () => {
    await mount();
    await tap(CALL, "call-1");
    const firstCalls = push.mock.calls.length + replace.mock.calls.length;
    expect(firstCalls).toBeGreaterThan(0);
    expect(ackNative).not.toHaveBeenCalled();
    vi.setSystemTime(T0 + 2_500);
    await tap(CALL, "call-2");
    expect(push.mock.calls.length + replace.mock.calls.length).toBe(firstCalls * 2);
  });
});
