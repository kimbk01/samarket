import { describe, expect, it } from "vitest";
import {
  hasMessengerRoomRealLastMessageHint,
  isMessengerRoomLastMessageDisplayPlaceholder,
} from "@/lib/community-messenger/room/messenger-room-last-message-placeholder";

describe("messenger-room-last-message-placeholder", () => {
  it("recognizes direct/group display placeholders (ko/en)", () => {
    expect(isMessengerRoomLastMessageDisplayPlaceholder("메시지를 보내 보세요.")).toBe(true);
    expect(isMessengerRoomLastMessageDisplayPlaceholder("Send a message to start chatting.")).toBe(true);
    expect(isMessengerRoomLastMessageDisplayPlaceholder("그룹 대화를 시작해 보세요.")).toBe(true);
    expect(isMessengerRoomLastMessageDisplayPlaceholder("Start a group conversation.")).toBe(true);
  });

  it("does not treat real previews as placeholders", () => {
    expect(isMessengerRoomLastMessageDisplayPlaceholder("안녕하세요")).toBe(false);
    expect(isMessengerRoomLastMessageDisplayPlaceholder("hint only")).toBe(false);
  });

  it("hasMessengerRoomRealLastMessageHint — placeholder is not a hint", () => {
    expect(hasMessengerRoomRealLastMessageHint("메시지를 보내 보세요.")).toBe(false);
    expect(hasMessengerRoomRealLastMessageHint("")).toBe(false);
    expect(hasMessengerRoomRealLastMessageHint("실제 메시지")).toBe(true);
  });
});
