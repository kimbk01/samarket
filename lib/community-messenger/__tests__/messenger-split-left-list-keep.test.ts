/**
 * 분할 화면(768px+) 왼쪽 목록 유지 — 감사·계획 docs/audit/messenger-split-left-list-audit-plan-2026-11-16.md
 * P1: 왼쪽 홈 안에서 방을 열면 누른 탭·하위 화면(section)이 방 주소에 실린다(분할에서만, 누른 목록이 직접 넘김).
 * P2: 거래 방 주소는 cm_list=trade (주문 방·도메인 라우터와 같은 규칙).
 * P3: 앱 안 메시지 배너는 방이 속한 목록으로 연다.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  communityMessengerRoomHref,
  resolveMessengerSplitListSection,
} from "@/lib/community-messenger/messenger-entry-origin";
import { tradeHubChatRoomHref, tradeMessengerRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import { messengerRoomListSourceForRoom } from "@/lib/community-messenger/messenger-room-list-source-for-room";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const q = (href: string) => new URL(href, "https://x.local").searchParams;

describe("P1 — 방 주소에 왼쪽 탭 싣기", () => {
  it("friends·call_logs·archive·search 는 section 으로 실린다", () => {
    for (const s of ["friends", "call_logs", "archive", "search"] as const) {
      expect(q(communityMessengerRoomHref("r1", null, "inbox", null, s)).get("section")).toBe(s);
    }
  });
  it("없으면 section 을 싣지 않는다(지금과 같음)", () => {
    expect(q(communityMessengerRoomHref("r1", null, "inbox", null, null)).has("section")).toBe(false);
    expect(communityMessengerRoomHref("r1", "trade", "trade")).toBe("/community-messenger/rooms/r1?from=trade&cm_list=trade");
  });
  it("홈 상태 → 왼쪽 탭 값: 분할이 아니면 null, 검색 화면이 우선, 대화 탭은 null", () => {
    expect(resolveMessengerSplitListSection({ splitList: false, mainSection: "friends", subScreenKind: null })).toBeNull();
    expect(resolveMessengerSplitListSection({ splitList: true, mainSection: "friends", subScreenKind: null })).toBe("friends");
    expect(resolveMessengerSplitListSection({ splitList: true, mainSection: "call_logs", subScreenKind: null })).toBe(
      "call_logs"
    );
    expect(resolveMessengerSplitListSection({ splitList: true, mainSection: "archive", subScreenKind: null })).toBe("archive");
    expect(resolveMessengerSplitListSection({ splitList: true, mainSection: "chats", subScreenKind: "search" })).toBe("search");
    expect(resolveMessengerSplitListSection({ splitList: true, mainSection: "chats", subScreenKind: null })).toBeNull();
    expect(resolveMessengerSplitListSection({ splitList: true, mainSection: "friends", subScreenKind: "pick" })).toBe("friends");
  });
  it("이동 함수는 주소(location)에서 왼쪽 상태를 이어 붙이지 않고, 분할일 때만 넘겨받은 값을 싣는다", () => {
    const src = read("lib/community-messenger/community-messenger-room-forward-navigation.ts");
    expect(src).not.toMatch(/carryMessengerSplitListState/);
    expect(src).toMatch(/splitListSection/);
    expect(src).toMatch(/matchesMessengerSplitViewport\(\)\s*\?\s*args\.splitListSection/);
  });
  it("홈: 분할 화면이면 방 주소의 section=search 도 읽는다", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toMatch(/isMessengerSplitViewport && parseCommunityMessengerRoomIdFromPathname/);
  });
  it("분할 머리글: 방 주소에서도 하위 화면 머리글, 뒤로 = section 만 뺀 방 주소", () => {
    const fx = read("lib/community-messenger/home/use-community-messenger-home-shell-effects.tsx");
    expect(fx).toMatch(/isMessengerHubRoute \|\| isMessengerStickyRoomSectionRoute/);
    expect(fx).toMatch(/messengerRoomHrefWithoutSubScreen\(/);
  });
});

describe("P2 — 거래 방 주소 cm_list=trade", () => {
  it("tradeMessengerRoomHref·tradeHubChatRoomHref·tradeChatNotificationHref", () => {
    expect(tradeMessengerRoomHref("r1", "product_chat")).toBe("/community-messenger/rooms/r1?source=product_chat&cm_list=trade");
    expect(q(tradeHubChatRoomHref("r1", null)).get("cm_list")).toBe("trade");
    expect(q(tradeChatNotificationHref("r1", "chat_room")).get("cm_list")).toBe("trade");
  });
});

describe("P3 — 배너는 방이 속한 목록으로", () => {
  const base = { id: "r1", roomType: "direct" } as unknown as CommunityMessengerRoomSummary;
  it("1:1 = inbox", () => {
    expect(messengerRoomListSourceForRoom(base)).toBe("inbox");
    expect(messengerRoomListSourceForRoom(null)).toBe("inbox");
  });
  it("거래·주문 방", () => {
    const trade = { ...base, chatDomain: "trade" } as unknown as CommunityMessengerRoomSummary;
    const order = { ...base, chatDomain: "store_order" } as unknown as CommunityMessengerRoomSummary;
    expect(messengerRoomListSourceForRoom(trade)).toBe("trade");
    expect(messengerRoomListSourceForRoom(order)).toBe("delivery");
  });
  it("배너 누름은 대상의 listSource 로 방 주소를 만든다", () => {
    const host = read("components/notifications/InAppNotificationBannerHost.tsx");
    expect(host).toMatch(/communityMessengerRoomHref\(target\.roomId, null, target\.listSource/);
  });
});
