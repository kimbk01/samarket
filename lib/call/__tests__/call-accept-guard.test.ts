import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCallAcceptGuardPatchCountForTests,
  resetCallAcceptGuardForTests,
  runCallAcceptGuard,
} from "@/lib/call/actions/call-accept-guard";
import { resetCallRouteLatchForTests } from "@/lib/call/routing/call-route-latch";
import { resetDibayCallFlowLogForTests } from "@/lib/call/logging/call-flow-log";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const patchMock = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; session?: unknown }>>();
const prepareAcceptMock = vi.fn(async () => true);

vi.mock("@/lib/community-messenger/call-engine", () => ({
  callEngineActions: {
    acceptIncoming: (...args: unknown[]) => patchMock(...args),
    patch: vi.fn(),
  },
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  prepareNativeCallAccept: () => prepareAcceptMock(),
}));

vi.mock("@/lib/call/permissions/call-permission-gate", () => ({
  callPermissionGate: {
    requireForIncoming: vi.fn(async () => ({
      ok: false,
      reason: "microphone_required",
      check: { canVoice: false },
    })),
    prompt: vi.fn(),
    check: vi.fn(),
  },
}));

vi.mock("@/lib/community-messenger/incoming-call-action-guard", () => ({
  tryClaimIncomingCallAccept: vi.fn(() => true),
  releaseIncomingCallAccept: vi.fn(),
}));

const baseSession = {
  id: "call-abc",
  status: "ringing",
  callKind: "voice",
  isMineInitiator: false,
  endedReason: null,
} as CommunityMessengerCallSession;

describe("call-accept-guard", () => {
  beforeEach(() => {
    resetCallAcceptGuardForTests();
    resetCallRouteLatchForTests();
    resetDibayCallFlowLogForTests();
    patchMock.mockReset();
    prepareAcceptMock.mockClear();
  });

  it("does not PATCH accept when permission denied", async () => {
    const router = { replace: vi.fn() };
    const result = await runCallAcceptGuard({
      session: baseSession,
      router,
      source: "test",
    });
    expect(result.ok).toBe(false);
    expect(patchMock).toHaveBeenCalledTimes(0);
    expect(prepareAcceptMock).toHaveBeenCalledTimes(0);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("call-accept-guard granted flow", () => {
  beforeEach(() => {
    vi.resetModules();
    resetCallAcceptGuardForTests();
    resetCallRouteLatchForTests();
    patchMock.mockReset();
    prepareAcceptMock.mockClear();
  });

  it("runs native prep then PATCH then route when granted", async () => {
    vi.doUnmock("@/lib/call/permissions/call-permission-gate");
    vi.doUnmock("@/lib/call/actions/call-accept-guard");

    const gate = await import("@/lib/call/permissions/call-permission-gate");
    vi.spyOn(gate.callPermissionGate, "requireForIncoming").mockResolvedValue({
      ok: true,
      check: {
        storeState: "granted_audio",
        os: { microphone: "granted", camera: "granted" },
        effectiveState: "granted_audio",
        microphoneGranted: true,
        cameraGranted: true,
        canVoice: true,
        canVideo: true,
        canFallbackToVoice: false,
        isPermanentlyDenied: false,
      },
    });

    const { runCallAcceptGuard: runGuard } = await import("@/lib/call/actions/call-accept-guard");
    patchMock.mockResolvedValue({ ok: true });

    const order: string[] = [];
    prepareAcceptMock.mockImplementation(async () => {
      order.push("native");
      return true;
    });
    patchMock.mockImplementation(async () => {
      order.push("patch");
      return { ok: true };
    });

    const router = {
      replace: vi.fn(() => {
        order.push("route");
      }),
    };

    const result = await runGuard({
      session: baseSession,
      router,
      source: "test_granted",
      promptOnDenied: false,
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(["native", "patch", "route"]);
  });
});
