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
  getCallStubTimelineTone,
} from "@/lib/community-messenger/call-event-message";
import {
  compareChatListRooms,
  resolveChatListLastActivityAtMs,
  sortChatListRooms,
} from "@/lib/community-messenger/chat-list/chat-list-sorter";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

describe("call-event-presentation outcome phrases (caller = callee)", () => {
  // Owner 2026-11-13: 발신자 취소 = 발신자 「취소」 · 수신자 「부재중」 (레거시 텔레그램 동일)
  it("caller cancel → 발신자 취소 · 수신자 부재중", () => {
    const caller = formatCallEventForViewer({ lang: "ko",
      callKind: "voice",
      resolvedEvent: "cancelled_by_caller",
      viewerRole: "caller",
    });
    const callee = formatCallEventForViewer({ lang: "ko",
      callKind: "voice",
      resolvedEvent: "cancelled_by_caller",
      viewerRole: "callee",
    });
    expect(caller.resultLabel).toBe("취소");
    expect(caller.listPreview).toBe("음성 통화 · 취소");
    expect(callee.resultLabel).toBe("부재중");
    expect(callee.listPreview).toBe("부재중 음성 통화");
    expect(caller.isMissed).toBe(false);
    expect(callee.isMissed).toBe(true);
  });

  it("remote reject → 거절 for both caller and callee", () => {
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "video",
        resolvedEvent: "rejected_by_callee",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("거절");
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "video",
        resolvedEvent: "rejected_by_callee",
        viewerRole: "callee",
      }).resultLabel
    ).toBe("거절");
  });

  it("missed → 부재중 for both callee and caller", () => {
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "callee",
      }).listPreview
    ).toBe("부재중 음성 통화");
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "caller",
      }).listPreview
    ).toBe("부재중 음성 통화");
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("부재중");
  });

  it("connected_ended shows duration", () => {
    const p = buildCallEventPresentation({ lang: "ko",
      callKind: "video",
      canonical: "connected_ended",
      durationSeconds: 222,
    });
    expect(p.fullLabel).toMatch(/영상 통화 · /);
    expect(p.resultLabel).toMatch(/\d/);
  });

  it("busy / missed / failed are distinct", () => {
    expect(resolveCallEventCanonical({ resolvedEvent: "peer_busy", viewerRole: "caller" })).toBe(
      "remote_busy"
    );
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "voice",
        resolvedEvent: "peer_busy",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("통화 중");
    expect(
      formatCallEventForViewer({ lang: "ko",
        callKind: "voice",
        resolvedEvent: "missed",
        viewerRole: "caller",
      }).resultLabel
    ).toBe("부재중");
    expect(
      buildCallEventPresentation({ lang: "ko", callKind: "voice", canonical: "failed" }).resultLabel
    ).toBe("연결 실패");
  });

  it("shared list label does not invent viewer phrases", () => {
    expect(formatCallEventSharedListLabel("voice", "missed")).toBe("부재중 음성 통화");
    expect(formatCallEventSharedListLabel("video", "cancelled")).toBe("영상 통화 · 취소");
    expect(formatCallEventSharedListLabel("video", "rejected")).toBe("영상 통화 · 거절");
    expect(formatCallEventSharedListLabel("voice", "ended", 65)).toMatch(/음성 통화 · /);
  });

  it("getCallMessageText — 발신자 취소는 발신자 취소 · 수신자 부재중", () => {
    expect(
      getCallMessageText({ lang: "ko",
        callKind: "voice",
        eventType: "cancelled_by_caller",
        viewerUserId: "caller",
        initiatorUserId: "caller",
      })
    ).toBe("음성 통화 · 취소");
    expect(
      getCallMessageText({ lang: "ko",
        callKind: "voice",
        eventType: "cancelled_by_caller",
        viewerUserId: "callee",
        initiatorUserId: "caller",
      })
    ).toBe("음성 통화 · 부재중");
  });

  it("timeline status line for ended uses duration", () => {
    expect(
      getCallStubTimelineStatusLine({ lang: "ko",
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

// D2 — 말풍선 색은 문구와 같은 판정(언어 무관). 발신자 취소 = 발신자 cancelled · 수신자 missed
describe("getCallStubTimelineTone", () => {
  const base = { senderUserId: "A", initiatorUserId: "A", recipientUserId: "B" };
  it("caller cancel → caller cancelled · callee missed", () => {
    expect(getCallStubTimelineTone({ ...base, resolvedEvent: "cancelled_by_caller", callStatusFallback: "cancelled", viewerUserId: "A" })).toBe("cancelled");
    expect(getCallStubTimelineTone({ ...base, resolvedEvent: "cancelled_by_caller", callStatusFallback: "cancelled", viewerUserId: "B" })).toBe("missed");
  });
  it("missed · rejected · ended unchanged for both", () => {
    for (const v of ["A", "B"]) {
      expect(getCallStubTimelineTone({ ...base, resolvedEvent: "missed", callStatusFallback: "missed", viewerUserId: v })).toBe("missed");
      expect(getCallStubTimelineTone({ ...base, resolvedEvent: "rejected_by_callee", callStatusFallback: "rejected", viewerUserId: v })).toBe("rejected");
      expect(getCallStubTimelineTone({ ...base, resolvedEvent: "ended", callStatusFallback: "ended", viewerUserId: v })).toBe("normal");
    }
  });
});
