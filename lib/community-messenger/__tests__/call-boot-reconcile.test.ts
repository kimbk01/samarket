import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUserIdForDb: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
}));

vi.mock("@/lib/call/call-action-lock", () => ({
  isCallActionLockHeld: vi.fn(() => false),
  readCallActionLockSnapshot: vi.fn(() => null),
  releaseCallActionLock: vi.fn(),
}));

vi.mock("@/lib/call/active-call-session", () => ({
  releaseLocalCallSession: vi.fn(async () => {}),
}));

vi.mock("@/lib/call/actions/call-end-guard", () => ({
  runCallEndGuard: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallServiceLocalOnly: vi.fn(async () => true),
  readNativeActiveCallId: vi.fn(async () => null),
  readNativeActiveCallSnapshot: vi.fn(async () => ({
    callId: null,
    phase: null,
    mediaType: null,
    connected: false,
  })),
}));

vi.mock("@/lib/community-messenger/dibay-fcm-call-bridge", () => ({
  clearDibayCallPendingRoute: vi.fn(),
}));

vi.mock("@/lib/community-messenger/incoming-call-state", () => ({
  markCallConsumed: vi.fn(),
}));

vi.mock("@/lib/community-messenger/messenger-call-sound-config-client", () => ({
  fetchMessengerCallSoundConfig: vi.fn(async () => ({ incoming_ring_timeout_seconds: 30 })),
}));

const notifyCallTerminal = vi.fn(async () => {});
vi.mock("@/lib/push/native/push-route-native-bridge", () => ({
  clearNativePersistedCallPendingRoute: vi.fn(async () => {}),
  getNativeIncomingCallPlugin: vi.fn(async () => ({
    getForegroundIncomingCallId: vi.fn(async () => ({ callId: null })),
    getNativeIncomingStoreCallId: vi.fn(async () => ({ callId: "native-store-ringing" })),
    notifyCallTerminal,
    markCallConsumed: vi.fn(async () => {}),
  })),
}));

import { runCallEndGuard } from "@/lib/call/actions/call-end-guard";
import {
  ensureCallBootReconcile,
  resetCallBootReconcileForTests,
} from "@/lib/community-messenger/call-boot-reconcile";

describe("call-boot-reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallBootReconcileForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/incoming")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              sessions: [
                {
                  id: "outgoing-ringing",
                  status: "ringing",
                  isMineInitiator: true,
                  sessionMode: "direct",
                  startedAt: new Date().toISOString(),
                },
              ],
            }),
          };
        }
        if (url.includes("native-store-ringing")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              session: {
                id: "native-store-ringing",
                status: "ringing",
                isMineInitiator: true,
                sessionMode: "direct",
                startedAt: new Date().toISOString(),
              },
            }),
          };
        }
        if (url.includes("outgoing-ringing")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              session: {
                id: "outgoing-ringing",
                status: "ringing",
                isMineInitiator: true,
                sessionMode: "direct",
                startedAt: new Date().toISOString(),
              },
            }),
          };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      })
    );
  });

  it("cancels stale outgoing ringing on boot and clears native terminal", async () => {
    await ensureCallBootReconcile();
    expect(runCallEndGuard).toHaveBeenCalled();
    expect(notifyCallTerminal).toHaveBeenCalled();
  });

  it("runs reconcile only once (single-flight)", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    await ensureCallBootReconcile();
    await ensureCallBootReconcile();
    const incomingCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/incoming"));
    expect(incomingCalls.length).toBe(1);
  });
});
