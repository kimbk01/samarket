import { describe, expect, it } from "vitest";
import { shouldRunIncomingCallBackupHttpPoll } from "@/lib/layout/incoming-call-backup-poll-policy";

describe("shouldRunIncomingCallBackupHttpPoll", () => {
  it("always allows when direct callee is ringing", () => {
    expect(shouldRunIncomingCallBackupHttpPoll("/philife", true)).toBe(true);
    expect(shouldRunIncomingCallBackupHttpPoll("/home", true)).toBe(true);
  });

  it("blocks login surface", () => {
    expect(shouldRunIncomingCallBackupHttpPoll("/login", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/login/help", false)).toBe(false);
  });

  it("allows only messenger and chat-capable surfaces", () => {
    expect(shouldRunIncomingCallBackupHttpPoll("/community-messenger", false)).toBe(true);
    expect(shouldRunIncomingCallBackupHttpPoll("/community-messenger/rooms/abc", false)).toBe(true);
    expect(shouldRunIncomingCallBackupHttpPoll("/chats/room-1", false)).toBe(true);
    expect(shouldRunIncomingCallBackupHttpPoll("/mypage/trade/chat/room-2", false)).toBe(true);
    expect(shouldRunIncomingCallBackupHttpPoll("/group-chat/room-3", false)).toBe(true);
  });

  it("suppresses backup poll on general feed surfaces", () => {
    expect(shouldRunIncomingCallBackupHttpPoll("/home", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/philife", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/stores", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/mypage", false)).toBe(false);
  });
});
