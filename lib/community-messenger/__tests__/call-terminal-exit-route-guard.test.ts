import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
  sealDibayCallTerminalSurface: vi.fn(),
}));
vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallService: vi.fn(async () => true),
  reportNativeCallRemoteEnded: vi.fn(async () => true),
}));
vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  stopCommunityMessengerCallTone: vi.fn(),
}));
vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  stopCallHeartbeatWatchdog: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));
vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));
vi.mock("@/lib/community-messenger/incoming-call/ring-owner", () => ({
  syncIncomingCallRing: vi.fn(),
  stopIncomingCallRing: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-outgoing-ringback-controller", () => ({
  startOutgoingRingback: vi.fn(),
  stopOutgoingRingback: vi.fn(),
  stopAllOutgoingRingback: vi.fn(),
}));

import {
  finalizeCommunityMessengerCallTerminalExit,
  isCommunityMessengerCallScreenPathname,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { readCallEngineReturnPath } from "@/lib/community-messenger/call-engine/call-engine-store";

function stubBrowserLocation(pathname: string, search = "") {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  const location = { pathname, search };
  vi.stubGlobal("window", {
    location,
    sessionStorage,
    localStorage: sessionStorage,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("sessionStorage", sessionStorage);
  return location;
}

describe("isCommunityMessengerCallScreenPathname (D-5)", () => {
  it.each([
    ["/community-messenger/calls/9c0a-session", true],
    ["/community-messenger/calls/tmp_abc", true],
    ["/community-messenger/calls/outgoing", true],
    ["/community-messenger/calls-v3/call-1", true],
    ["/community-messenger/calls-v4/call-1", true],
    ["/community-messenger/calls/logs", false],
    ["/community-messenger/rooms/room-1", false],
    ["/community-messenger", false],
    ["/", false],
    ["", false],
  ])("%s → %s", (path, expected) => {
    expect(isCommunityMessengerCallScreenPathname(path)).toBe(expected);
  });
});

describe("finalizeCommunityMessengerCallTerminalExit route guard (D-5)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT move the user when the call ends while they are in another chat room (docked call)", () => {
    const location = stubBrowserLocation("/community-messenger/rooms/room-a");
    rememberCallNavigationReturnPath(); // 통화 시작 시점에 저장된 복귀 경로
    location.pathname = "/community-messenger/rooms/room-b"; // 사용자가 dock 상태로 다른 방으로 이동
    const router = { replace: vi.fn() };

    finalizeCommunityMessengerCallTerminalExit(router, "sess-1", "remote_terminal_bus", "room-call");

    expect(router.replace).not.toHaveBeenCalled();
    // 다음 통화가 오래된 복귀 경로를 쓰지 않도록 소비된다
    expect(readCallEngineReturnPath()).toBeNull();
  });

  it("returns to the origin screen when the call ends on the call screen route", () => {
    const location = stubBrowserLocation("/community-messenger/rooms/room-a", "?tab=chat");
    rememberCallNavigationReturnPath();
    location.pathname = "/community-messenger/calls/sess-2";
    location.search = "";
    const router = { replace: vi.fn() };

    finalizeCommunityMessengerCallTerminalExit(router, "sess-2", "remote_terminal_bus", "room-call");

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-a?tab=chat");
  });

  it("falls back to the call's room when no return path exists and the user is on the call screen", () => {
    stubBrowserLocation("/community-messenger/calls/sess-3");
    const router = { replace: vi.fn() };

    finalizeCommunityMessengerCallTerminalExit(router, "sess-3", "caller_end", "room-call");

    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-call");
  });

  it("does not move the user off the call logs list", () => {
    stubBrowserLocation("/community-messenger/calls/logs");
    const router = { replace: vi.fn() };

    finalizeCommunityMessengerCallTerminalExit(router, "sess-4", "ringing_dismiss", "room-call");

    expect(router.replace).not.toHaveBeenCalled();
  });
});
