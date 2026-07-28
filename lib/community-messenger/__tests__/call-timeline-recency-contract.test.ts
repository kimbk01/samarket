import { describe, expect, it } from "vitest";
import {
  buildCallEventPresentation,
  formatCallEventForViewer,
  formatCallEventSharedListLabel,
  forwardOnlyActivityAt,
  resolveCallEventCanonical,
} from "@/lib/community-messenger/call-event-presentation";
import {
  callStubSessionDedupeKey,
  callStubSessionDedupeKeys,
  getCallMessageText,
  getCallStubTimelineStatusLine,
} from "@/lib/community-messenger/call-event-message";
import {
  compareChatListRooms,
  resolveChatListLastActivityAtMs,
  sortChatListRooms,
} from "@/lib/community-messenger/chat-list/chat-list-sorter";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

describe("call-event-presentation viewer phrases", () => {
  it("caller cancel → 취소됨; callee sees 부재중", () => {
    const caller = formatCallEventForViewer({
      callKind: "voice",
      resolvedEvent: "cancelled_by_caller",
      viewerRole: "caller",
    });
    const callee = formatCallEventForViewer({
      callKind: "voice",
      resolvedEvent: "cancelled_by_caller",
      viewerRole: "callee",
    });
    expect(caller.resultLabel).toBe("취소됨");
    expect(caller.listPreview).toBe("음성 통화 · 취소됨");
    expect(callee.resultLabel).toBe("부재중");
    expect(callee.listPreview).toBe("부재중 음성 통화");
    expect(callee.isMissed).toBe(true);
  });

  it("remote reject → caller 거절됨; callee 거절함", () => {
    expect(
      formatCallEventForViewer({
        callKind: "video",
        resolvedEvent: "rejected_by_callee",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("거절됨");
    expect(
      formatCallEventForViewer({
        callKind: "video",
        resolvedEvent: "rejected_by_callee",
        viewerRole: "callee",
      }).resultLabel
    ).toBe("거절함");
  });

  it("missed → callee 부재중; caller 응답 없음", () => {
    expect(
      formatCallEventForViewer({
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "callee",
      }).listPreview
    ).toBe("부재중 음성 통화");
    expect(
      formatCallEventForViewer({
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("응답 없음");
  });

  it("connected_ended shows duration", () => {
    const p = buildCallEventPresentation({
      callKind: "video",
      canonical: "connected_ended",
      durationSeconds: 222,
    });
    expect(p.fullLabel).toMatch(/영상 통화 · /);
    expect(p.resultLabel).toMatch(/\d/);
  });

  it("busy / unanswered / failed are distinct", () => {
    expect(resolveCallEventCanonical({ resolvedEvent: "peer_busy", viewerRole: "caller" })).toBe(
      "remote_busy"
    );
    expect(
      formatCallEventForViewer({
        callKind: "voice",
        resolvedEvent: "peer_busy",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("통화 중");
    expect(
      formatCallEventForViewer({
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("응답 없음");
    expect(
      buildCallEventPresentation({ callKind: "voice", canonical: "failed" }).resultLabel
    ).toBe("연결 실패");
  });

  it("shared list label does not invent viewer phrases", () => {
    expect(formatCallEventSharedListLabel("voice", "missed")).toBe("부재중 음성 통화");
    expect(formatCallEventSharedListLabel("video", "cancelled")).toBe("영상 통화 · 취소됨");
    expect(formatCallEventSharedListLabel("voice", "ended", 65)).toMatch(/음성 통화 · /);
  });

  it("getCallMessageText is viewer-aware", () => {
    expect(
      getCallMessageText({
        callKind: "voice",
        eventType: "cancelled_by_caller",
        viewerUserId: "caller",
        initiatorUserId: "caller",
      })
    ).toContain("취소됨");
    expect(
      getCallMessageText({
        callKind: "voice",
        eventType: "cancelled_by_caller",
        viewerUserId: "callee",
        initiatorUserId: "caller",
      })
    ).toContain("부재중");
  });

  it("timeline status line for ended uses duration", () => {
    expect(
      getCallStubTimelineStatusLine({
        callKind: "voice",
        resolvedEvent: "ended",
        callStatusFallback: "ended",
        viewerUserId: "a",
        senderUserId: "a",
        durationSeconds: 10,
      })
    ).toMatch(/\d/);
  });
});

describe("callId timeline dedupe keys", () => {
  function stub(
    partial: Partial<CommunityMessengerMessage> & Pick<CommunityMessengerMessage, "id">
  ): CommunityMessengerMessage {
    return {
      roomId: "r1",
      senderId: "u1",
      senderLabel: "A",
      messageType: "call_stub",
      content: "x",
      createdAt: "2026-07-28T00:00:00.000Z",
      isMine: true,
      callKind: "voice",
      callStatus: "dialing",
      callSessionId: "sess-1",
      ...partial,
    };
  }

  it("dialing and ended share the same session dedupe key", () => {
    const dialing = stub({ id: "1", callStatus: "dialing" });
    const ended = stub({ id: "2", callStatus: "ended", content: "ended" });
    expect(callStubSessionDedupeKey(dialing)).toBe(callStubSessionDedupeKey(ended));
    expect(callStubSessionDedupeKeys(dialing)).toEqual(["call_stub:sess-1"]);
  });
});

describe("lastActivityAt sorting", () => {
  it("pinned → lastActivityAt DESC → roomId", () => {
    const sorted = sortChatListRooms([
      { id: "old", isPinned: false, lastMessageAt: "2026-07-28T15:20:00.000Z", title: "old" },
      {
        id: "call",
        isPinned: false,
        lastMessageAt: "2026-07-28T15:23:00.000Z",
        title: "call",
      },
      {
        id: "msg",
        isPinned: false,
        lastMessageAt: "2026-07-28T15:30:00.000Z",
        title: "msg",
      },
      {
        id: "pin",
        isPinned: true,
        lastMessageAt: "2026-07-28T10:00:00.000Z",
        title: "pin",
      },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["pin", "msg", "call", "old"]);
  });

  it("message after call ranks above call room", () => {
    const callRoom = {
      id: "a",
      isPinned: false,
      lastMessageAt: "2026-07-28T15:23:00.000Z",
      title: "call",
    };
    const msgRoom = {
      id: "b",
      isPinned: false,
      lastMessageAt: "2026-07-28T15:30:00.000Z",
      title: "msg",
    };
    expect(compareChatListRooms(msgRoom, callRoom)).toBeLessThan(0);
  });

  it("lastActivityAt alias wins over lastMessageAt when provided", () => {
    const ms = resolveChatListLastActivityAtMs({
      lastMessageAt: "2026-07-28T15:00:00.000Z",
      lastActivityAt: "2026-07-28T16:00:00.000Z",
    });
    expect(ms).toBe(new Date("2026-07-28T16:00:00.000Z").getTime());
  });

  it("forwardOnlyActivityAt never rolls back", () => {
    expect(
      forwardOnlyActivityAt("2026-07-28T16:00:00.000Z", "2026-07-28T15:00:00.000Z")
    ).toBe("2026-07-28T16:00:00.000Z");
    expect(
      forwardOnlyActivityAt("2026-07-28T15:00:00.000Z", "2026-07-28T16:00:00.000Z")
    ).toBe("2026-07-28T16:00:00.000Z");
  });
});
