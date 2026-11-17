/**
 * T3 (docs/audit/notification-f2-android-tap-read-fix-design-2026-10-28.md B).
 * 가격 제안 수락 알림 링크 = 메신저 방 경로. 예전에는 거래방(chat_rooms) id 를 넣어 방 화면이 404 였다
 * (운영 DB 2026-10-28: 수락 알림 14건 전부).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

const src = fs.readFileSync(path.join(process.cwd(), "lib/offers/price-offers.server.ts"), "utf8");

describe("offer accepted notification link", () => {
  it("links to the messenger room, falling back to the trade room only when none exists", () => {
    // 2026-11-18: ensure 가 메신저 방 id 를 못 주면 같은 해석기로 찾고, 그래도 없을 때만 거래방 id
    expect(src).toContain(
      "const linkRoomId = await resolveTradeNotificationMessengerRoomId(sb, args.messengerRoomId, args.chatRoomId);"
    );
    expect(src).toContain("link_url: tradeChatNotificationHref(linkRoomId, args.chatRoomSource),");
    expect(src).not.toContain("link_url: tradeChatNotificationHref(args.chatRoomId, args.chatRoomSource),");
  });

  it("accept passes the ensured messenger room id to the notification", () => {
    expect(src).toMatch(
      /notifyOfferAccepted\(sb, \{[^}]*messengerRoomId: ensuredRoom\.messengerRoomId,[^}]*\}\)/
    );
  });

  it("messenger room id builds the messenger room path", () => {
    expect(tradeChatNotificationHref("ce93dfe0", "chat_room")).toBe(
      /** 거래 방 = 거래 채팅 목록 소속 `cm_list=trade` (2026-11-16 분할 왼쪽 목록 감사 P2) */
      "/community-messenger/rooms/ce93dfe0?source=chat_room&cm_list=trade"
    );
  });
});
