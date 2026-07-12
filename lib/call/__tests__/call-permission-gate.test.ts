import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCallPermissionStoreState,
  resetCallPermissionStoreForTests,
  writeCallPermissionStoreState,
} from "@/lib/call/permissions/call-permission-store";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import {
  readCallStartGuardCreateCallCountForTests,
  resetCallStartGuardForTests,
  runCallStartGuard,
} from "@/lib/call/actions/call-start-guard";
import { resetDibayCallFlowLogForTests } from "@/lib/call/logging/call-flow-log";
import type { CallOsPermissionSnapshot } from "@/lib/call/permissions/call-permission-types";

const checkNativeCallOsPermissions = vi.hoisted(() => vi.fn<() => Promise<CallOsPermissionSnapshot>>());
const requestNativeCallMediaPermissions = vi.hoisted(() => vi.fn<() => Promise<CallOsPermissionSnapshot>>());
const openNativeCallPermissionSettings = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/call/native/native-call-permissions", () => ({
  checkNativeCallOsPermissions,
  requestNativeCallMediaPermissions,
  openNativeCallPermissionSettings,
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  bootstrapCommunityMessengerOutgoingCallSession: vi.fn(async () => ({
    ok: true,
    session: { id: "session-1" },
    roomId: "room-1",
  })),
}));

describe("call-permission-gate", () => {
  beforeEach(() => {
    resetDibayCallFlowLogForTests();
    resetCallPermissionStoreForTests();
    writeCallPermissionStoreState("unknown");
    checkNativeCallOsPermissions.mockReset();
    requestNativeCallMediaPermissions.mockReset();
    openNativeCallPermissionSettings.mockReset();
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "permanently_denied",
      camera: "permanently_denied",
    });
    requestNativeCallMediaPermissions.mockResolvedValue({
      microphone: "permanently_denied",
      camera: "permanently_denied",
    });
  });

  it("maps store granted + OS denied to system_revoked", async () => {
    writeCallPermissionStoreState("granted_audio_video");
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "permanently_denied",
      camera: "permanently_denied",
    });
    const check = await callPermissionGate.check("voice");
    expect(check.effectiveState).toBe("system_revoked");
    expect(check.canVoice).toBe(false);
  });

  it("treats OS permanently_denied as permanent without store", async () => {
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "permanently_denied",
      camera: "granted",
    });
    const check = await callPermissionGate.check("voice");
    expect(check.isPermanentlyDenied).toBe(true);
    expect(check.canVoice).toBe(false);
  });

  it("blocks outgoing when microphone missing", async () => {
    const result = await callPermissionGate.requireForOutgoing("voice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permanently_denied");
  });

  it("blocks incoming video when camera is missing", async () => {
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "granted",
      camera: "permanently_denied",
    });
    const result = await callPermissionGate.requireForIncoming("video");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permanently_denied");
  });

  it("allows incoming video only when mic and camera are granted", async () => {
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "granted",
      camera: "granted",
    });
    const result = await callPermissionGate.requireForIncoming("video");
    expect(result.ok).toBe(true);
  });

  it("requests OS prompt when prompt_available", async () => {
    checkNativeCallOsPermissions
      .mockResolvedValueOnce({
        microphone: "prompt_available",
        camera: "granted",
      })
      .mockResolvedValue({
        microphone: "granted",
        camera: "granted",
      });
    requestNativeCallMediaPermissions.mockResolvedValue({
      microphone: "granted",
      camera: "granted",
    });
    const result = await callPermissionGate.prompt("voice", "outgoing");
    expect(requestNativeCallMediaPermissions).toHaveBeenCalledWith("voice", undefined);
    expect(result.canVoice).toBe(true);
  });

  it("requests OS prompt when permission state is unknown", async () => {
    checkNativeCallOsPermissions
      .mockResolvedValueOnce({
        microphone: "unknown",
        camera: "unknown",
      })
      .mockResolvedValue({
        microphone: "granted",
        camera: "granted",
      });
    requestNativeCallMediaPermissions.mockResolvedValue({
      microphone: "granted",
      camera: "granted",
    });
    const result = await callPermissionGate.prompt("video", "incoming", "call-unknown");
    expect(requestNativeCallMediaPermissions).toHaveBeenCalledWith("video", "call-unknown");
    expect(result.canVideo).toBe(true);
  });

  it("skips OS request when permanently_denied without auto-opening settings", async () => {
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "permanently_denied",
      camera: "granted",
    });
    const result = await callPermissionGate.prompt("voice", "outgoing");
    expect(requestNativeCallMediaPermissions).not.toHaveBeenCalled();
    expect(openNativeCallPermissionSettings).not.toHaveBeenCalled();
    expect(result.canVoice).toBe(false);
  });
});

describe("call-start-guard", () => {
  beforeEach(() => {
    resetCallStartGuardForTests();
    resetDibayCallFlowLogForTests();
    writeCallPermissionStoreState("unknown");
    checkNativeCallOsPermissions.mockReset();
    requestNativeCallMediaPermissions.mockReset();
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "permanently_denied",
      camera: "permanently_denied",
    });
  });

  it("does not call createCall API when permission denied", async () => {
    const result = await runCallStartGuard({ kind: "voice", roomId: "r1", peerUserId: null });
    expect(result.ok).toBe(false);
    expect(readCallStartGuardCreateCallCountForTests()).toBe(0);
  });

  it("calls createCall API when OS permissions are granted", async () => {
    checkNativeCallOsPermissions.mockResolvedValue({
      microphone: "granted",
      camera: "granted",
    });
    const result = await runCallStartGuard({ kind: "voice", roomId: "r1", peerUserId: null });
    expect(result.ok).toBe(true);
    expect(readCallStartGuardCreateCallCountForTests()).toBe(1);
  });
});

describe("call-permission-store", () => {
  beforeEach(() => {
    resetCallPermissionStoreForTests();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("dibay_call_permission_store_v1");
    }
  });

  it("persists onboarding shown flag", () => {
    expect(readCallPermissionStoreState()).toBe("unknown");
    writeCallPermissionStoreState("denied_permanently");
    expect(readCallPermissionStoreState()).toBe("denied_permanently");
  });
});
