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

vi.mock("@/lib/call/native/native-call-permissions", () => ({
  checkNativeCallOsPermissions: vi.fn(async () => ({
    microphone: "denied",
    camera: "denied",
  })),
  requestNativeCallMediaPermissions: vi.fn(async () => ({
    microphone: "denied",
    camera: "denied",
  })),
  openNativeCallPermissionSettings: vi.fn(async () => true),
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
  });

  it("maps store granted + OS denied to system_revoked", async () => {
    writeCallPermissionStoreState("granted_audio_video");
    const check = await callPermissionGate.check("voice");
    expect(check.effectiveState).toBe("system_revoked");
    expect(check.canVoice).toBe(false);
  });

  it("denied_once is preserved when OS still denied", async () => {
    writeCallPermissionStoreState("denied_once");
    const check = await callPermissionGate.check("voice");
    expect(check.effectiveState).toBe("denied_once");
  });

  it("blocks outgoing when microphone missing", async () => {
    const result = await callPermissionGate.requireForOutgoing("voice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("microphone_required");
  });
});

describe("call-start-guard", () => {
  beforeEach(() => {
    resetCallStartGuardForTests();
    resetDibayCallFlowLogForTests();
    writeCallPermissionStoreState("unknown");
  });

  it("does not call createCall API when permission denied", async () => {
    const result = await runCallStartGuard({ kind: "voice", roomId: "r1", peerUserId: null });
    expect(result.ok).toBe(false);
    expect(readCallStartGuardCreateCallCountForTests()).toBe(0);
  });

  it("re-prompts on denied_once for next call", async () => {
    writeCallPermissionStoreState("denied_once");
    const check = await callPermissionGate.check("voice");
    expect(check.storeState).toBe("denied_once");
    expect(check.canVoice).toBe(false);
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
