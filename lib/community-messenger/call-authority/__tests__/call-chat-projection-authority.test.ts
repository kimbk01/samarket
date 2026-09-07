import { describe, expect, it } from "vitest";
import {
  buildCallStubProjectionMetadata,
  mapCanonicalReasonToResolvedEvent,
  resolveCallStubIdempotencyKey,
  resolveProjectionFromSession,
  shouldPersistCallStubProjection,
} from "@/lib/community-messenger/call-authority/call-chat-projection-authority";
import { formatCallEventSharedListLabel } from "@/lib/community-messenger/call-event-presentation";
import {
  getCallStubTimelineStatusLine,
  resolveCallStubEventFromMessageMetadata,
} from "@/lib/community-messenger/call-event-message";
import { appendCommunityMessengerCallStubMessage } from "@/lib/community-messenger/service";

type DevState = {
  rooms: Array<{ id: string; lastMessage?: string; lastMessageAt?: string; lastMessageType?: string }>;
  messages: Array<{
    id: string;
    roomId: string;
    senderId: string;
    messageType: string;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  participants: Array<{ roomId: string; userId: string; unreadCount: number }>;
  calls: unknown[];
  callSessions: unknown[];
};

function resetDevState(): DevState {
  const state: DevState = {
    rooms: [{ id: "room-1", lastMessage: "hi", lastMessageAt: "2026-06-01T00:00:00.000Z", lastMessageType: "text" }],
    messages: [],
    participants: [
      { roomId: "room-1", userId: "caller", unreadCount: 0 },
      { roomId: "room-1", userId: "callee", unreadCount: 0 },
    ],
    calls: [],
    callSessions: [],
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

function devState(): DevState {
  return (globalThis as unknown as { __samarketCommunityMessengerState: DevState }).__samarketCommunityMessengerState;
}

describe("call-chat-projection-authority CUT4", () => {
  it("C1–C7 maps canonical → resolved + shared labels", () => {
    const cases = [
      ["caller_cancelled", "cancelled_by_caller", "cancelled", "음성 통화 · 취소됨"],
      ["callee_rejected", "rejected_by_callee", "rejected", "음성 통화 · 거절됨"],
      ["missed_timeout", "missed", "missed", "부재중 음성 통화"],
      ["ended_by_caller", "ended", "ended", "음성 통화 · 1m 00s"],
      ["ended_by_callee", "ended", "ended", "음성 통화 · 1m 00s"],
      ["disconnected", "disconnected", "ended", "음성 통화 · 연결 끊김"],
      ["failed_setup", "failed", "ended", "음성 통화 · 연결 실패"],
    ] as const;

    for (const [canonical, resolved, status, label] of cases) {
      expect(mapCanonicalReasonToResolvedEvent(canonical)).toBe(resolved);
      expect(
        formatCallEventSharedListLabel(
          "voice",
          status,
          canonical.startsWith("ended_by") ? 60 : 0,
          resolved,
        ),
      ).toBe(label);
    }
  });

  it("C8–C10 duplicate terminal / late actions keep one stub", async () => {
    resetDevState();
    const base = {
      userId: "caller",
      roomId: "room-1",
      sessionId: "sess-1",
      callKind: "voice" as const,
      createdAt: "2026-06-09T10:00:00.000Z",
      listActivityAt: "2026-06-09T10:00:30.000Z",
      bumpRoomLastMessageAt: true,
      initiatorUserId: "caller",
      recipientUserId: "callee",
    };
    await appendCommunityMessengerCallStubMessage({
      ...base,
      status: "cancelled",
      endedReason: "canceled",
    });
    await appendCommunityMessengerCallStubMessage({
      ...base,
      userId: "callee",
      status: "missed",
      endedReason: "missed",
    });
    await appendCommunityMessengerCallStubMessage({
      ...base,
      status: "rejected",
      endedReason: "declined",
    });
    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.metadata.sessionId).toBe("sess-1");
  });

  it("C11–C12 voice/video share engine", () => {
    expect(formatCallEventSharedListLabel("voice", "missed", 0, "missed")).toBe("부재중 음성 통화");
    expect(formatCallEventSharedListLabel("video", "missed", 0, "missed")).toBe("부재중 영상 통화");
  });

  it("C13–C14 viewer-relative presentation uses initiator metadata not sender", () => {
    const meta = buildCallStubProjectionMetadata({
      callKind: "voice",
      callStatus: "rejected",
      sessionId: "s1",
      endedReason: "declined",
      canonicalReason: "callee_rejected",
      resolvedEvent: "rejected_by_callee",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });
    // stub actor/sender is callee on reject
    expect(
      getCallStubTimelineStatusLine({
        callKind: "voice",
        resolvedEvent: "rejected_by_callee",
        callStatusFallback: "rejected",
        viewerUserId: "caller",
        senderUserId: "callee",
        initiatorUserId: meta.initiatorUserId,
        recipientUserId: meta.recipientUserId,
      }),
    ).toBe("거절됨");
    expect(
      getCallStubTimelineStatusLine({
        callKind: "voice",
        resolvedEvent: "rejected_by_callee",
        callStatusFallback: "rejected",
        viewerUserId: "callee",
        senderUserId: "callee",
        initiatorUserId: meta.initiatorUserId,
        recipientUserId: meta.recipientUserId,
      }),
    ).toBe("거절함");
  });

  it("C15 room binding stays on session room — idempotency key is session scoped", () => {
    expect(resolveCallStubIdempotencyKey({ sessionId: "abc", roomId: "room-x", createdAt: "t" })).toBe(
      "cm_call_stub:session:abc",
    );
    expect(resolveCallStubIdempotencyKey({ sessionId: "abc", roomId: "room-y" })).toBe(
      "cm_call_stub:session:abc",
    );
  });

  it("answered_elsewhere / busy do not persist session stubs", () => {
    expect(
      shouldPersistCallStubProjection({
        sessionId: "s",
        roomId: "r",
        status: "active",
        canonical: "answered_elsewhere",
      }),
    ).toBe(false);
    expect(
      shouldPersistCallStubProjection({
        sessionId: "s",
        roomId: "r",
        status: "ended",
        canonical: "busy",
      }),
    ).toBe(false);
  });

  it("projection from heartbeat_timeout → disconnected", () => {
    const p = resolveProjectionFromSession({
      status: "ended",
      endedReason: "heartbeat_timeout",
      answeredAt: "t",
      initiatorUserId: "a",
      recipientUserId: "b",
      terminalActorUserId: "a",
    });
    expect(p.canonical).toBe("disconnected");
    expect(p.resolvedEvent).toBe("disconnected");
    expect(p.callStatus).toBe("ended");
  });

  it("metadata round-trip preserves initiator for timeline", () => {
    const meta = buildCallStubProjectionMetadata({
      callKind: "video",
      callStatus: "ended",
      sessionId: "s9",
      durationSeconds: 12,
      endedReason: "ended_by_callee",
      canonicalReason: "ended_by_callee",
      resolvedEvent: "ended",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });
    const parsed = resolveCallStubEventFromMessageMetadata(meta as unknown as Record<string, unknown>);
    expect(parsed.resolvedEvent).toBe("ended");
    expect(parsed.initiatorUserId).toBe("caller");
    expect(parsed.recipientUserId).toBe("callee");
  });
});
