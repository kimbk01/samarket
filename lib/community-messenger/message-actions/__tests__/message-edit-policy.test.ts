import { describe, expect, it } from "vitest";
import { canEditMessageText, MESSAGE_EDIT_MAX_AGE_SEC } from "@/lib/community-messenger/message-actions/message-edit-policy";
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

describe("canEditMessageText", () => {
  it("allows own recent text", () => {
    expect(canEditMessageText(baseMsg(), "direct")).toBe(true);
  });
  it("blocks peer message", () => {
    expect(canEditMessageText(baseMsg({ isMine: false }), "direct")).toBe(false);
  });
  it("blocks after edit window", () => {
    const old = new Date(Date.now() - (MESSAGE_EDIT_MAX_AGE_SEC + 60) * 1000).toISOString();
    expect(canEditMessageText(baseMsg({ createdAt: old }), "direct")).toBe(false);
  });
  it("blocks non-text", () => {
    expect(canEditMessageText(baseMsg({ messageType: "image" }), "direct")).toBe(false);
  });
});
