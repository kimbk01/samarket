/** @vitest-environment jsdom */
/**
 * D2-3 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §10-8) — 맥 시트 수락은 네이티브만.
 * 웹 PATCH·웹 Agora 금지(웹뷰 통화 수립 금지 계약). 맥이 아니면 기존 경로 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const lifecycleMocks = vi.hoisted(() => ({
  onAccept: vi.fn(),
  onReject: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-lifecycle", () => ({
  syncCallV4NativeOnWebAccept: (...args: unknown[]) => lifecycleMocks.onAccept(...args),
  syncCallV4NativeOnWebReject: (...args: unknown[]) => lifecycleMocks.onReject(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4PatchAccept: vi.fn(async () => ({ ok: true, session: { status: "active" } })),
  callV4PatchReject: vi.fn(async () => ({ ok: true })),
  callV4FetchSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-agora", () => ({
  joinCallV4Agora: vi.fn(async () => true),
  leaveCallV4Agora: vi.fn(async () => {}),
}));

const ensureCallMediaForUserGestureMock = vi.hoisted(() =>
  vi.fn<() => Promise<CallMediaPermissionPreflightResult>>(async () => ({
    ok: true,
    state: { microphone: "granted", camera: "granted", requestedAt: null, grantedAt: null, source: null },
  })),
);

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallMediaForUserGesture: ensureCallMediaForUserGestureMock,
}));

import { callV4PatchAccept } from "@/lib/community-messenger/call-v4/call-v4-api";
import { joinCallV4Agora } from "@/lib/community-messenger/call-v4/call-v4-agora";

vi.mock("@/lib/community-messenger/call-v4/call-v4-cleanup", () => ({
  cleanupCallV4: (...args: unknown[]) => lifecycleMocks.cleanup(...args),
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  pinCommunityMessengerCallTerminalSurfaceDismiss: vi.fn(),
}));

vi.mock("@/lib/call/active-call-session", () => ({
  hardClearActiveCallSession: vi.fn(async () => {}),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-route", () => ({
  rememberCallV4ReturnPath: vi.fn(),
  buildCallV4ScreenHref: vi.fn(() => "/community-messenger/calls-v4/call-hook"),
  exitCallV4ScreenAfterCleanup: vi.fn(),
  /** D5: 종료 시작 시점 「통화 화면이었는가」 — 이 파일은 이탈 함수 자체를 mock 하므로 값은 판정에 영향 없음 */
  isOnCallV4ScreenRoute: vi.fn(() => true),
  readCallV4ExitRouter: vi.fn(() => null),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-patch-guard", () => ({
  claimCallV4AcceptPatchOnce: vi.fn(() => true),
  claimCallV4RejectPatchOnce: vi.fn(() => true),
  claimCallV4EndPatchOnce: vi.fn(() => true),
  claimCallV4CancelPatchOnce: vi.fn(() => true),
  releaseCallV4CancelPatchClaim: vi.fn(),
  hasCallV4AcceptPatchDone: vi.fn(() => false),
  markCallV4AcceptPatchDone: vi.fn(),
  releaseCallV4AcceptPatchClaim: vi.fn(),
  tryClaimCallV4AcceptFlight: vi.fn(() => true),
  releaseCallV4AcceptFlightClaim: vi.fn(),
}));

import type { CallMediaPermissionPreflightResult } from "@/lib/community-messenger/call-media-permission-preflight";

const mac = vi.hoisted(() => ({ isMac: true, invoke: vi.fn() }));
vi.mock("@/lib/call/native/call-platform-capability-client", () => ({
  isIosAppOnMacCached: () => mac.isMac,
}));
vi.mock("@/lib/call/native/native-call-service", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  invokeNativeCallServicePlugin: mac.invoke,
}));

import { callV4Accept } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { isCallV4NativeAcceptingSurface } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";

function seedIncoming(mediaType: "audio" | "video") {
  useCallV4Store.getState().resetToIdle();
  useCallV4Store.getState().setIdentity({
    callId: "call-mac",
    roomId: "room-1",
    callerUserId: "u-caller",
    calleeUserId: "u-mac",
    direction: "incoming",
    mediaType,
    createdAt: new Date().toISOString(),
    peerLabel: "q테스트1",
  });
  useCallV4Store.getState().setPhase("incoming_ringing");
}

describe("callV4Accept on Mac (D2-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mac.isMac = true;
    mac.invoke.mockResolvedValue({ ok: true, reason: "accepted" });
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("음성: 네이티브 acceptIncomingWithoutCallKit 만 — 웹 PATCH·웹 Agora 없음", async () => {
    seedIncoming("audio");
    const router = { push: vi.fn(), replace: vi.fn() };
    await callV4Accept("call-mac", router, { source: "sheet" });
    expect(mac.invoke).toHaveBeenCalledWith("acceptIncomingWithoutCallKit", {
      callId: "call-mac",
      callKind: "voice",
      roomId: "room-1",
      callerId: "u-caller",
      callerName: "q테스트1",
    });
    expect(callV4PatchAccept).not.toHaveBeenCalled();
    expect(joinCallV4Agora).not.toHaveBeenCalled();
    expect(lifecycleMocks.onAccept).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(isCallV4NativeAcceptingSurface("call-mac")).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("idle");
  });

  it("영상: callKind video", async () => {
    seedIncoming("video");
    await callV4Accept("call-mac", { push: vi.fn() }, { source: "sheet" });
    expect(mac.invoke).toHaveBeenCalledWith(
      "acceptIncomingWithoutCallKit",
      expect.objectContaining({ callKind: "video" }),
    );
    expect(joinCallV4Agora).not.toHaveBeenCalled();
  });

  it("맥 아님(데스크톱 웹·iPhone): 기존 웹 수락 경로 그대로", async () => {
    mac.isMac = false;
    seedIncoming("audio");
    await callV4Accept("call-mac", { push: vi.fn(), replace: vi.fn() }, { skipRoute: true, source: "sheet" });
    expect(mac.invoke).not.toHaveBeenCalledWith("acceptIncomingWithoutCallKit", expect.anything());
    expect(callV4PatchAccept).toHaveBeenCalled();
  });
});
