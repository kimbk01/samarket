/**
 * CUT 3 — Chat domain authority restoration.
 * Keyword/title regex must not classify four-domain rooms; use chatDomain + Confirmed* legacy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  communityMessengerRoomInboxGroupKind,
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
  messengerDirectThreadListCollapseKey,
} from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { CHAT_DOMAINS } from "@/lib/chat-domain/four-domain-freeze";
import { isChatDomain } from "@/lib/chat-domain/chat-domain";
import { buildCanonicalNotificationRoomHref } from "@/lib/chat-domain/push/canonical-notification-room-route";
import { buildDomainRoomRoute } from "@/lib/chat-domain/push/domain-room-route";
import { resolveMessengerHomeBucket } from "@/lib/community-messenger/home/inbox-pipeline/classification";

function room(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "r1",
    roomType: partial.roomType ?? "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: partial.title ?? "",
    subtitle: partial.subtitle ?? "",
    summary: partial.summary ?? "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    peerUserId: partial.peerUserId ?? "peer-b",
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
    chatDomain: partial.chatDomain ?? null,
    domainIdentity: partial.domainIdentity ?? null,
  };
}

describe("CUT 3 chat domain authority restoration", () => {
  it("four-domain freeze is unchanged", () => {
    expect([...CHAT_DOMAINS]).toEqual(["general_direct", "group", "trade", "store_order"]);
  });

  it("CASE 1 — general_direct keeps domain despite trade/order keywords in title", () => {
    const r = room({
      chatDomain: "general_direct",
      domainIdentity: "gd:a:b",
      title: "거래 문의 배달 주문",
      summary: "배달 주문 했어요",
      subtitle: "거래",
    });
    expect(communityMessengerRoomIsTrade(r)).toBe(false);
    expect(communityMessengerRoomIsDelivery(r)).toBe(false);
    expect(communityMessengerRoomInboxGroupKind(r)).toBe("general");
    expect(messengerDirectThreadListCollapseKey(r)).toMatch(/^direct:/);
  });

  it("CASE 2 — group keeps domain despite trade/delivery keywords", () => {
    const r = room({
      id: "g1",
      roomType: "private_group",
      chatDomain: "group",
      domainIdentity: "group:g1",
      title: "거래 모임 배달 파티",
      summary: "배달 주문",
      peerUserId: null,
      memberCount: 5,
    });
    expect(communityMessengerRoomIsTrade(r)).toBe(false);
    expect(communityMessengerRoomIsDelivery(r)).toBe(false);
    expect(communityMessengerRoomIsConfirmedTrade(r)).toBe(false);
    expect(communityMessengerRoomIsConfirmedDelivery(r)).toBe(false);
  });

  it("CASE 3 — trade explicit domain stays trade", () => {
    const r = room({
      chatDomain: "trade",
      domainIdentity: "trade:i:s:b",
      messengerDirectKey: "trade_pc:pc-1",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
    });
    expect(communityMessengerRoomIsTrade(r)).toBe(true);
    expect(communityMessengerRoomIsDelivery(r)).toBe(false);
    expect(communityMessengerRoomInboxGroupKind(r)).toBe("trade");
    expect(buildCanonicalNotificationRoomHref({ roomId: r.id, chatDomain: "trade" })).toBe(
      buildDomainRoomRoute({ chatDomain: "trade", roomId: r.id })
    );
  });

  it("CASE 4 — store_order explicit domain stays store_order", () => {
    const r = room({
      chatDomain: "store_order",
      domainIdentity: "so:order:o1",
      messengerDirectKey: "store_order:o1",
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "o1" },
    });
    expect(communityMessengerRoomIsDelivery(r)).toBe(true);
    expect(communityMessengerRoomIsTrade(r)).toBe(false);
    expect(communityMessengerRoomInboxGroupKind(r)).toBe("delivery");
    expect(buildCanonicalNotificationRoomHref({ roomId: r.id, chatDomain: "store_order" })).toBe(
      buildDomainRoomRoute({ chatDomain: "store_order", roomId: r.id })
    );
  });

  it("CASE 5 — unknown/legacy without chatDomain uses directKey/contextMeta only (no title keyword)", () => {
    const keywordOnly = room({
      title: "거래 배달",
      summary: "주문 배달",
      messengerDirectKey: null,
      contextMeta: null,
      chatDomain: null,
    });
    expect(communityMessengerRoomIsTrade(keywordOnly)).toBe(false);
    expect(communityMessengerRoomIsDelivery(keywordOnly)).toBe(false);

    const legacyTradeKey = room({
      chatDomain: null,
      messengerDirectKey: "trade_pc:pc-9",
      contextMeta: null,
      title: "",
    });
    expect(communityMessengerRoomIsTrade(legacyTradeKey)).toBe(true);
    expect(communityMessengerRoomIsConfirmedTrade(legacyTradeKey)).toBe(true);

    const legacySoKey = room({
      chatDomain: null,
      messengerDirectKey: "store_order:ord-9",
      contextMeta: null,
    });
    expect(communityMessengerRoomIsDelivery(legacySoKey)).toBe(true);
    expect(communityMessengerRoomIsConfirmedDelivery(legacySoKey)).toBe(true);
  });

  it("IsTrade/IsDelivery alias Confirmed* (chatDomain fail-closed)", () => {
    const polluted = room({
      chatDomain: "general_direct",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc" },
      messengerDirectKey: "trade_pc:pc",
      title: "거래",
    });
    expect(communityMessengerRoomIsTrade(polluted)).toBe(false);
    expect(communityMessengerRoomIsConfirmedTrade(polluted)).toBe(false);
  });

  it("push/deeplink domain classification matches four domains", () => {
    for (const domain of CHAT_DOMAINS) {
      expect(isChatDomain(domain)).toBe(true);
      const href = buildCanonicalNotificationRoomHref({ roomId: "room-x", chatDomain: domain });
      expect(href).toBe(buildDomainRoomRoute({ chatDomain: domain, roomId: "room-x" }));
    }
  });

  it("home bucket still ignores title keyword (pipeline contract)", () => {
    expect(
      resolveMessengerHomeBucket(
        {
          roomId: "r1",
          roomType: "direct",
          directKey: null,
          contextMeta: null,
          chatDomain: null,
          domainIdentity: null,
          title: "거래 문의",
          avatarUrl: null,
          latestMessage: "배달 주문",
          lastMessageAt: "2026-07-13T00:00:00.000Z",
          unreadCount: 0,
          isArchived: false,
          isBlockedHidden: false,
          roomStatus: "active",
          memberCount: 2,
        },
        "u1"
      )
    ).toBe("direct");
  });

  it("source: keyword regex authority removed from IsTrade/IsDelivery", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/messenger-room-domain.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\(\?<!\[가-힣\]\)거래/);
    expect(src).not.toMatch(/\(\?<!\[가-힣\]\)배달/);
    expect(src).toMatch(
      /export function communityMessengerRoomIsTrade[\s\S]*?return communityMessengerRoomIsConfirmedTrade/
    );
    expect(src).toMatch(
      /export function communityMessengerRoomIsDelivery[\s\S]*?return communityMessengerRoomIsConfirmedDelivery/
    );
  });
});
