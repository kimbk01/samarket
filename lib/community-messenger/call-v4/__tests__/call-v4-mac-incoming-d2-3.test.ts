/** @vitest-environment jsdom */
/**
 * D2-3 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §10-8) — 맥(iOS 앱) 수신 전용 묶음.
 * 플랫폼별 고정: 맥 = 플래그 무관 탐색 + Realtime + 웹 주체 + 네이티브 수락 / iPhone·iPad·Android·데스크톱 = 기존.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ flag: false, native: true, shell: "ios" as "ios" | "android" | "web" }));

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => h.flag) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchIncomingSessions: vi.fn(async () => []),
  callV4FetchIncomingSessionsOutcome: vi.fn(async () => ({ kind: "ok" as const, sessions: [] })),
  callV4FetchSession: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({ callV4IncomingDiscovered: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", () => ({
  tryPrimeCallV4WebIncomingOwner: vi.fn(async () => {}),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => h.native),
  resolveCapacitorShellPlatform: vi.fn(() => h.shell),
}));
vi.mock("@/lib/community-messenger/monitoring/client", () => ({ messengerMonitorRecord: vi.fn() }));
const feed = { acquired: 0 };
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed", () => ({
  acquireCallV4IncomingRealtimeFeed: vi.fn(() => {
    feed.acquired += 1;
    return () => undefined;
  }),
}));
const plugin = vi.hoisted(() => ({ capability: vi.fn(), claim: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/push/native/dibay-voip-call-plugin", () => ({
  dibayVoipCallPlugin: {
    getCallPlatformCapability: plugin.capability,
    claimForegroundWebIncomingOwner: plugin.claim,
  },
}));
vi.mock("@/lib/call/native/native-call-service", () => ({ invokeNativeCallServicePlugin: plugin.invoke }));

import { startCallV4IncomingDiscovery } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { tryClaimIosCapacitorWebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-ios-shell-owner-client";
import {
  clearAllCallV4NativeAcceptingSurfaces,
  getCallV4PersistedSurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import {
  loadCallPlatformCapability,
  isIosAppOnMacCached,
  resetCallPlatformCapabilityForTests,
} from "@/lib/call/native/call-platform-capability-client";

let stop: () => void = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  h.flag = false;
  h.native = true;
  h.shell = "ios";
  feed.acquired = 0;
  resetCallPlatformCapabilityForTests(null);
  clearAllCallV4NativeAcceptingSurfaces();
  plugin.claim.mockResolvedValue({ claimed: false });
  plugin.invoke.mockResolvedValue({ enabled: true });
});
afterEach(() => {
  stop();
  stop = () => {};
});

describe("call-platform-capability-client", () => {
  it("맥: 플러그인 값 그대로 캐시", async () => {
    plugin.capability.mockResolvedValue({ iosAppOnMac: true, voipPush: false, callKitCallUi: false });
    const cap = await loadCallPlatformCapability();
    expect(cap).toEqual({ iosAppOnMac: true, voipPush: false, callKitCallUi: false });
    expect(isIosAppOnMacCached()).toBe(true);
  });
  it("구 바이너리(메서드 없음): 기존 경로(맥 아님)", async () => {
    plugin.capability.mockRejectedValue(new Error("not implemented"));
    await loadCallPlatformCapability();
    expect(isIosAppOnMacCached()).toBe(false);
  });
  it("Android·웹: 플러그인 조회 없이 맥 아님", async () => {
    h.shell = "android";
    await loadCallPlatformCapability();
    expect(plugin.capability).not.toHaveBeenCalled();
    expect(isIosAppOnMacCached()).toBe(false);
  });
});

describe("startCallV4IncomingDiscovery (D2-3)", () => {
  it("맥: V4 플래그 꺼져 있어도 시작 + Realtime 병행", () => {
    stop = startCallV4IncomingDiscovery("user-1", { macIosApp: true });
    expect(feed.acquired).toBe(1);
  });
  it("iOS 셸(맥 아님): 플래그 꺼짐 → 시작 안 함(기존)", () => {
    stop = startCallV4IncomingDiscovery("user-1");
    expect(feed.acquired).toBe(0);
  });
  it("iOS 셸(맥 아님): 플래그 켜짐이어도 Realtime 없음(기존 K4)", () => {
    h.flag = true;
    stop = startCallV4IncomingDiscovery("user-1");
    expect(feed.acquired).toBe(0);
  });
});

describe("tryClaimIosCapacitorWebIncomingOwner (D2-3)", () => {
  it("맥: 네이티브 요청 없이 web_in_app 선언", async () => {
    resetCallPlatformCapabilityForTests({ iosAppOnMac: true, voipPush: false, callKitCallUi: false });
    const claimed = await tryClaimIosCapacitorWebIncomingOwner("call-mac-1", "poll_discovery");
    expect(claimed).toBe(true);
    expect(getCallV4PersistedSurfaceOwner("call-mac-1")).toBe("web_in_app");
    expect(plugin.claim).not.toHaveBeenCalled();
    expect(plugin.invoke).not.toHaveBeenCalled();
  });
  it("iPhone·iPad: 기존대로 네이티브 음성 레인이면 건너뜀", async () => {
    resetCallPlatformCapabilityForTests({ iosAppOnMac: false, voipPush: true, callKitCallUi: true });
    const claimed = await tryClaimIosCapacitorWebIncomingOwner("call-iphone-1", "poll_discovery");
    expect(claimed).toBe(false);
    expect(plugin.invoke).toHaveBeenCalledWith("isNativeVoiceIncomingLaneEnabled");
    expect(getCallV4PersistedSurfaceOwner("call-iphone-1")).toBe("none");
  });
});
