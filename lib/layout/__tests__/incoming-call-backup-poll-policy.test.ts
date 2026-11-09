import { describe, expect, it } from "vitest";
import {
  shouldRunIncomingCallBackupHttpPoll,
  shouldRunIncomingCallRealtimeSignalFetch,
} from "@/lib/layout/incoming-call-backup-poll-policy";

describe("shouldRunIncomingCallBackupHttpPoll", () => {
  it("always allows when direct callee is ringing", () => {
    expect(shouldRunIncomingCallBackupHttpPoll("/philife", true)).toBe(true);
    expect(shouldRunIncomingCallBackupHttpPoll("/market", true)).toBe(true);
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
    expect(shouldRunIncomingCallBackupHttpPoll("/market", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/philife", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/stores", false)).toBe(false);
    expect(shouldRunIncomingCallBackupHttpPoll("/mypage", false)).toBe(false);
  });
});

describe("F2 shouldRunIncomingCallRealtimeSignalFetch (울림 신호 1회 조회 관문)", () => {
  it("일반 사용자 화면(홈·커뮤니티·거래·배달/매장·마이페이지)과 메신저는 허용", () => {
    for (const p of ["/", "/home", "/philife", "/community", "/market", "/stores", "/mypage", "/community-messenger", "/chats/r1"]) {
      expect(shouldRunIncomingCallRealtimeSignalFetch(p)).toBe(true);
    }
    expect(shouldRunIncomingCallRealtimeSignalFetch("/market/")).toBe(true);
    expect(shouldRunIncomingCallRealtimeSignalFetch("/philife?tab=1")).toBe(true);
  });

  it("/admin 과 하위 경로는 제외", () => {
    for (const p of ["/admin", "/admin/", "/admin/x", "/admin/app/legal", "/admin?x=1"]) {
      expect(shouldRunIncomingCallRealtimeSignalFetch(p)).toBe(false);
    }
  });

  it("/login 은 제외(기존 관문과 동일)", () => {
    expect(shouldRunIncomingCallRealtimeSignalFetch("/login")).toBe(false);
    expect(shouldRunIncomingCallRealtimeSignalFetch("/login/help")).toBe(false);
  });

  it("정기 조회 관문은 바뀌지 않는다(허용 경로 밖 억제 유지)", () => {
    for (const p of ["/", "/philife", "/community", "/market", "/stores", "/mypage", "/admin", "/admin/x"]) {
      expect(shouldRunIncomingCallBackupHttpPoll(p, false)).toBe(false);
    }
  });
});
