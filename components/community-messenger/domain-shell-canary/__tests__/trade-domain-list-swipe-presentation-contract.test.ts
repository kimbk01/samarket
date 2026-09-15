/**
 * Trade Domain canary — presentation must mount canonical MessengerChatListItem swipe
 * while preserving Domain list data authority.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  domainTradeListRowActionRoomId,
  domainTradeListRowToUnifiedItem,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-row-to-unified-item";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import { getSwipeActions } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

const ROOT = process.cwd();

function gateSrc(): string {
  return readFileSync(
    join(ROOT, "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx"),
    "utf8"
  );
}

function sampleRow(
  partial?: Partial<TradeListDto["rows"][number]>
): TradeListDto["rows"][number] {
  return {
    roomId: "cm-room-uuid-1",
    chatDomain: "trade",
    domainIdentityKey: "trade:item-1:seller:buyer",
    itemId: "item-1",
    sellerUserId: "seller",
    buyerUserId: "buyer",
    viewerRole: "buyer",
    productTitle: "Test product",
    productImageUrl: null,
    peerLabel: "Seller Nick",
    peerAvatarUrl: null,
    previewText: "hello",
    statusBadge: "판매중",
    unreadCount: 2,
    lastMessageAt: "2026-09-16T00:00:00.000Z",
    href: "/community-messenger/rooms/cm-room-uuid-1?cmList=trade",
    ...partial,
  };
}

describe("trade domain list swipe presentation contract", () => {
  it("DomainTradeListCanaryGate mounts CommunityMessengerChatRow (not TradeDomainShellRow)", () => {
    const src = gateSrc();
    expect(src).toContain("CommunityMessengerChatRow");
    expect(src).toContain('listVisual="trade"');
    expect(src).toContain("data-domain-trade-list-swipe");
    expect(src).not.toContain("TradeDomainShellRow");
    expect(src).toContain('authority: "domain_trade_list_canary"');
    expect(src).toContain("getSwipeLeaveConfirmI18nKey");
    expect(src).toContain("leaveMessengerRoomFromHomeClient");
    expect(src).toContain('action: "archive"');
    expect(src).toContain("buildCommunityMessengerMarkReadPatchBody");
  });

  it("maps Domain row → UnifiedRoomListItem with CM room id as action identity", () => {
    const row = sampleRow();
    const item = domainTradeListRowToUnifiedItem(row);
    expect(item.room.id).toBe("cm-room-uuid-1");
    expect(domainTradeListRowActionRoomId(row)).toBe("cm-room-uuid-1");
    expect(item.room.chatDomain).toBe("trade");
    expect(item.room.contextMeta?.kind).toBe("trade");
    expect(item.room.contextMeta?.postId).toBe("item-1");
    expect(item.room.unreadCount).toBe(2);
    expect(item.room.id).not.toBe(row.itemId);
  });

  it("policy getSwipeActions yields archive/read/leave for trade Domain row", () => {
    const item = domainTradeListRowToUnifiedItem(sampleRow());
    const policyType = toMessengerPolicyRoomType({
      roomType: item.room.roomType,
      contextMeta: item.room.contextMeta ?? null,
    });
    expect(policyType).toBe("trade");
    const actions = getSwipeActions({ policyType, listContext: "default" });
    expect(actions.map((a) => a.kind)).toEqual(["archive", "read", "leave"]);
  });
});
