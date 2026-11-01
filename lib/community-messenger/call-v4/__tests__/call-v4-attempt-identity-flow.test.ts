import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

/** android-caller-stuck-after-remote-missed-design §15-4 — 웹 발신이 시도 ID 를 서버에 싣고, 결과를 모를 때 시도를 취소한다. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const session = {
  id: "call-1",
  roomId: "room-1",
  sessionMode: "direct",
  initiatorUserId: "user-a",
  recipientUserId: "user-b",
  peerUserId: "user-b",
  peerLabel: "Peer",
  callKind: "voice",
  status: "ringing",
  startedAt: new Date().toISOString(),
  answeredAt: null,
  endedAt: null,
  isMineInitiator: true,
  participants: [],
} as CommunityMessengerCallSession;

const apiMocks = vi.hoisted(() => ({
  resolveRoom: vi.fn(async () => ({ ok: true as const, roomId: "room-1" })),
  createSession: vi.fn(),
  cancelAttempt: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isAndroidNativeOutgoingShell: vi.fn(() => false),
  isIOSNativeOutgoingShell: vi.fn(async () => false),
  isIOSNativeVideoOutgoingShell: vi.fn(async () => false),
  startNativeOutgoingPreparing: vi.fn(async () => ({ ok: true })),
  finishNativeOutgoingPreparing: vi.fn(async () => undefined),
  bindNativeOutgoingEstablishment: vi.fn(async () => ({ ok: false, nativeOwned: false })),
  startNativeOutgoingEstablishment: vi.fn(async () => ({ ok: false, nativeOwned: false })),
  isNativeEstablishmentOwned: vi.fn(async () => false),
  NATIVE_OUTGOING_PREPARING_ABANDONED_EVENT: "nativeOutgoingPreparingAbandoned",
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  nativeCallServicePlugin: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return {
    ...actual,
    callV4ResolveOutgoingRoomId: apiMocks.resolveRoom,
    callV4CreateSession: apiMocks.createSession,
    callV4CancelAttempt: apiMocks.cancelAttempt,
  };
});

import { callV4CreateOutgoing } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const router = { push: vi.fn(), replace: vi.fn() };

describe("call-v4 발신 시도 ID 계약 (§15-4)", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    apiMocks.createSession.mockReset();
    apiMocks.cancelAttempt.mockClear();
  });

  it("생성 요청에 UUID v4 시도 ID 를 싣고, 성공하면 시도를 취소하지 않는다", async () => {
    apiMocks.createSession.mockResolvedValue({ ok: true, session, httpStatus: 200 });
    const result = await callV4CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    expect(result.ok).toBe(true);
    const sent = apiMocks.createSession.mock.calls[0]?.[0] as { clientAttemptId?: string };
    expect(sent.clientAttemptId).toMatch(UUID_RE);
    expect(apiMocks.cancelAttempt).not.toHaveBeenCalled();
  });

  it("서버 5xx(통화 생성 여부 모름) → 같은 시도 ID 로 시도 취소", async () => {
    apiMocks.createSession.mockResolvedValue({ ok: false, error: undefined, httpStatus: 502 });
    const result = await callV4CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    expect(result.ok).toBe(false);
    const sent = apiMocks.createSession.mock.calls[0]?.[0] as { clientAttemptId: string };
    expect(apiMocks.cancelAttempt).toHaveBeenCalledWith(sent.clientAttemptId, "create_server_error");
  });

  it("서버가 거절한 4xx(통화 안 만듦) → 시도 취소 안 함", async () => {
    apiMocks.createSession.mockResolvedValue({ ok: false, error: "call_denied_blocked", httpStatus: 403 });
    await callV4CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    expect(apiMocks.cancelAttempt).not.toHaveBeenCalled();
  });

  it("응답을 못 받음(네트워크 예외) → 시도 취소 후 예외 그대로", async () => {
    apiMocks.createSession.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(callV4CreateOutgoing({ roomId: "room-1", mediaType: "audio", router })).rejects.toThrow(
      "Failed to fetch"
    );
    const sent = apiMocks.createSession.mock.calls[0]?.[0] as { clientAttemptId: string };
    expect(apiMocks.cancelAttempt).toHaveBeenCalledWith(sent.clientAttemptId, "create_no_response");
  });
});
