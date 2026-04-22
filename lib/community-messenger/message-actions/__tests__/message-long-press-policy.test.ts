import { describe, expect, it } from "vitest";
import {
  canDeleteMessageForEveryone,
  canDeleteMessageForMe,
  MESSAGE_DELETE_FOR_EVERYONE_MAX_AGE_SEC,
} from "@/lib/community-messenger/message-actions/message-delete-policy";
import {
  canReplyToMessage,
  formatReplyPreviewMessageTypeLabel,
  formatReplyQuoteKakaoHeader,
  resolveDeletedMessagePlaceholder,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import {
  canCopyMessageLink,
  canShareMessage,
  canShareMessageExternally,
  canShareMessageToRoom,
} from "@/lib/community-messenger/message-actions/message-share-policy";
import { canReactToMessage, MESSENGER_QUICK_REACTION_KEYS } from "@/lib/community-messenger/message-actions/message-reaction-policy";
import { getMessageLongPressActions } from "@/lib/community-messenger/message-actions/message-long-press-policy";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const baseMsg = (over: Partial<CommunityMessengerMessage> = {}): CommunityMessengerMessage => ({
  id: "m1",
  roomId: "r1",
  senderId: "u1",
  senderLabel: "나",
  messageType: "text",
  content: "hello",
  createdAt: new Date().toISOString(),
  isMine: true,
  callKind: null,
  callStatus: null,
  ...over,
});

describe("canDeleteMessageForMe / Everyone", () => {
  it("allows me to hide my non-system message", () => {
    expect(canDeleteMessageForMe(baseMsg(), "direct")).toBe(true);
  });
  it("blocks others message", () => {
    expect(canDeleteMessageForMe(baseMsg({ isMine: false }), "direct")).toBe(false);
  });
  it("blocks for everyone after window", () => {
    const old = new Date(Date.now() - (MESSAGE_DELETE_FOR_EVERYONE_MAX_AGE_SEC + 60) * 1000).toISOString();
    expect(canDeleteMessageForEveryone(baseMsg({ createdAt: old }), "direct")).toBe(false);
  });
});

describe("canReply / react / share", () => {
  it("blocks reply to system", () => {
    expect(canReplyToMessage(baseMsg({ messageType: "system" }), "direct")).toBe(false);
  });
  it("blocks reply when message was deleted for everyone", () => {
    expect(canReplyToMessage(baseMsg({ deletedForEveryoneAt: "2020-01-01T00:00:00.000Z" }), "direct")).toBe(false);
  });
  it("placeholder string", () => {
    expect(resolveDeletedMessagePlaceholder()).toContain("삭제");
  });
  it("trade blocks external share for non-text types", () => {
    expect(canShareMessageExternally(baseMsg({ messageType: "file" }), "trade")).toBe(false);
  });
  it("react blocked when deleted for everyone", () => {
    expect(canReactToMessage(baseMsg({ deletedForEveryoneAt: "2020-01-01T00:00:00.000Z" }), "direct")).toBe(false);
  });
  it("quick reaction keys length", () => {
    expect(MESSENGER_QUICK_REACTION_KEYS.length).toBe(6);
  });
  it("trade allows react for peer text but not for file", () => {
    expect(canReactToMessage(baseMsg({ messageType: "text", isMine: false }), "trade")).toBe(true);
    expect(canReactToMessage(baseMsg({ messageType: "file", isMine: false }), "trade")).toBe(false);
  });
  it("blocks react on own messages", () => {
    expect(canReactToMessage(baseMsg({ messageType: "text", isMine: true }), "direct")).toBe(false);
    expect(canReactToMessage(baseMsg({ messageType: "text", isMine: false }), "direct")).toBe(true);
  });
  it("trade share: to-room only, no external or link", () => {
    const text = baseMsg({ messageType: "text" });
    expect(canShareMessageToRoom(text, "trade")).toBe(true);
    expect(canShareMessageExternally(text, "trade")).toBe(false);
    expect(canCopyMessageLink(text, "trade")).toBe(false);
    expect(canShareMessage(text, "trade")).toBe(true);
  });
  it("reply preview type labels", () => {
    expect(formatReplyPreviewMessageTypeLabel("text")).toBe("텍스트");
    expect(formatReplyPreviewMessageTypeLabel("image")).toBe("이미지");
  });
  it("reply kakao-style header line", () => {
    expect(formatReplyQuoteKakaoHeader("BK Kim")).toBe("BK Kim에게 답장");
    expect(formatReplyQuoteKakaoHeader("  ")).toBe("메시지에게 답장");
  });
});

describe("getMessageLongPressActions", () => {
  it("disables copy when not text", () => {
    const actions = getMessageLongPressActions({
      message: baseMsg({ messageType: "image", content: "/x.png" }),
      room: { roomType: "direct", contextMeta: null, isReadonly: false, roomStatus: "active" },
      viewerUserId: "u1",
      roomUnavailable: false,
    });
    expect(actions.find((a) => a.action === "copy")?.enabled).toBe(false);
  });

  it("group room enables reply and react for normal text", () => {
    const actions = getMessageLongPressActions({
      message: baseMsg({ isMine: false }),
      room: { roomType: "private_group", contextMeta: null, isReadonly: false, roomStatus: "active" },
      viewerUserId: "u2",
      roomUnavailable: false,
    });
    expect(actions.find((a) => a.action === "reply")?.enabled).toBe(true);
    expect(actions.find((a) => a.action === "react")?.enabled).toBe(true);
    expect(actions.find((a) => a.action === "delete")?.enabled).toBe(false);
  });

  it("own message disables react in long-press menu", () => {
    const actions = getMessageLongPressActions({
      message: baseMsg({ isMine: true, messageType: "text" }),
      room: { roomType: "direct", contextMeta: null, isReadonly: false, roomStatus: "active" },
      viewerUserId: "u1",
      roomUnavailable: false,
    });
    expect(actions.find((a) => a.action === "react")?.enabled).toBe(false);
  });

  it("readonly room disables all interactive actions", () => {
    const actions = getMessageLongPressActions({
      message: baseMsg(),
      room: { roomType: "direct", contextMeta: null, isReadonly: true, roomStatus: "active" },
      viewerUserId: "u1",
      roomUnavailable: false,
    });
    expect(actions.every((a) => !a.enabled || a.action === "copy")).toBe(true);
    expect(actions.find((a) => a.action === "copy")?.enabled).toBe(false);
  });
});

describe("canDeleteMessageForEveryone call_stub", () => {
  it("blocks delete for everyone on call_stub", () => {
    expect(
      canDeleteMessageForEveryone(
        baseMsg({ messageType: "call_stub", content: "통화", createdAt: new Date().toISOString() }),
        "direct"
      )
    ).toBe(false);
  });
});
