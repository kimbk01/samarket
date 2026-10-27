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
    expect(src).toContain("const linkRoomId = args.messengerRoomId?.trim() || args.chatRoomId;");
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
      "/community-messenger/rooms/ce93dfe0?source=chat_room"
    );
  });
});
