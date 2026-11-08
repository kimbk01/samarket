import { describe, expect, it } from "vitest";
import { messengerRoomLastMessagePlaceholderKey } from "@/lib/community-messenger/room/messenger-room-last-message-placeholder";

/** 재감사 2026-11-08 — 서버가 한국어로 채운 빈 방 안내가 영어 화면에 그대로 나오던 결함 */
describe("빈 방 안내 → 보는 사람 언어 키", () => {
  it("1:1·그룹 안내(한국어·영어 저장 모두)를 키로 바꾼다", () => {
    expect(messengerRoomLastMessagePlaceholderKey("메시지를 보내 보세요.")).toBe("cm_svc_last_msg_direct");
    expect(messengerRoomLastMessagePlaceholderKey("Send a message to start chatting.")).toBe("cm_svc_last_msg_direct");
    expect(messengerRoomLastMessagePlaceholderKey("그룹 대화를 시작해 보세요.")).toBe("cm_svc_last_msg_group");
    expect(messengerRoomLastMessagePlaceholderKey("Start a group conversation.")).toBe("cm_svc_last_msg_group");
  });
  it("실제 메시지는 그대로(null)", () => {
    expect(messengerRoomLastMessagePlaceholderKey("안녕하세요")).toBeNull();
    expect(messengerRoomLastMessagePlaceholderKey("")).toBeNull();
  });
});
