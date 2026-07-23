/**
 * StoreOrderInvariantTest — Phase 4 조건부 승인 필수 10항.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STORE_ORDER_FORBIDDEN_TRADE_PORT_TOKENS,
  STORE_ORDER_INVARIANT_IDS,
  STORE_ORDER_NAV_MESSENGER_CONTRIBUTION,
  assertStoreOrderPreviewDoesNotUseMetadata,
  buildStoreOrderBadgeContribution,
  buildStoreOrderCustomerHeaderModel,
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderListSnapshot,
  resolveStoreOrderCustomerPresentation,
  resolveStoreOrderPreview,
  STORE_ORDER_DOMAIN,
  STORE_ORDER_SUMMARY_REDACTED_PREVIEW,
  type StoreOrderRoomInput,
} from "@/lib/messenger/store-order";
import { composeMessengerTabBadge } from "@/lib/messenger/shell";

const STORE_ORDER_ROOT = path.resolve(process.cwd(), "lib/messenger/store-order");

function walkTs(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(abs, out);
    else if (ent.name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

function orderRoom(partial: Partial<StoreOrderRoomInput> & { roomId: string; orderId: string }): StoreOrderRoomInput {
  return {
    roomId: partial.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: `store_order:${partial.orderId}`,
    orderId: partial.orderId,
    storeId: partial.storeId ?? "store-1",
    storeName: partial.storeName ?? "맛있는집",
    storeImageUrl: partial.storeImageUrl ?? "https://cdn/store.png",
    customerUserId: partial.customerUserId ?? "cust-1",
    customerName: partial.customerName ?? "고객A",
    customerAvatarUrl: partial.customerAvatarUrl ?? "https://cdn/user.png",
    latestChatMessageText: partial.latestChatMessageText ?? "혹시 빨리 될까요?",
    latestChatMessageType: partial.latestChatMessageType ?? "text",
    latestChatMessageAt: partial.latestChatMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    orderStatusLabel: partial.orderStatusLabel ?? "준비중",
  };
}

describe("StoreOrderInvariantTest (10)", () => {
  it("lists the locked invariant ids", () => {
    expect(STORE_ORDER_INVARIANT_IDS).toHaveLength(10);
  });

  it("1 customer_ui_member_name_is_fail", () => {
    expect(() =>
      resolveStoreOrderCustomerPresentation({
        roomId: "r1",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
        storeName: "맛있는집",
        storeImageUrl: "https://cdn/store.png",
        memberDisplayName: "메인관리자",
      })
    ).toThrow(/member_name_forbidden/);
  });

  it("2 customer_ui_member_avatar_is_fail", () => {
    expect(() =>
      resolveStoreOrderCustomerPresentation({
        roomId: "r1",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
        storeName: "맛있는집",
        storeImageUrl: "https://cdn/store.png",
        memberAvatarUrl: "https://cdn/user.png",
      })
    ).toThrow(/member_avatar_forbidden/);
  });

  it("3 customer_header_general_is_fail", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [orderRoom({ roomId: "r1", orderId: "o1" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const header = buildStoreOrderCustomerHeaderModel(listed.snapshot.rows[0]!);
    expect(header.kind).not.toBe("general_peer" as never);
    expect(header.kind).toBe("buyer_store");
    expect(header.forbidsGeneralDirectHeader).toBe(true);
  });

  it("4 preview_order_summary_is_fail", () => {
    // Design-lock: order-summary template must not appear as list preview text.
    // Product path redacts (row fallback) instead of throwing — list compose must not die.
    const preview = resolveStoreOrderPreview({
      chatDomain: STORE_ORDER_DOMAIN,
      latestChatMessage: { text: "📋 주문 요약\n주문번호: SO1", messageType: "text" },
    });
    expect(preview.text).toBe(STORE_ORDER_SUMMARY_REDACTED_PREVIEW);
    expect(preview.text).not.toMatch(/주문 요약|주문번호/);
    // Hard assert path still fails closed if content markers are asserted directly.
    expect(() =>
      assertStoreOrderPreviewDoesNotUseMetadata({ content: "📋 주문 요약" })
    ).toThrow(/summary_forbidden/);
  });

  it("5 preview_order_number_is_fail", () => {
    expect(() =>
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: null,
        orderNumber: "A-1024",
      })
    ).toThrow(/metadata_forbidden/);
  });

  it("6 preview_status_text_is_fail", () => {
    expect(() =>
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "배달중", messageType: "text" },
      })
    ).toThrow(/status_text_forbidden/);
    expect(() =>
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: null,
        orderStatus: "준비중",
      })
    ).toThrow(/metadata_forbidden/);
  });

  it("7 missing_store_image_peer_avatar_is_fail", () => {
    expect(() =>
      resolveStoreOrderCustomerPresentation({
        roomId: "r1",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
        storeName: "맛있는집",
        storeImageUrl: null,
        peerAvatarUrl: "https://cdn/user.png",
      })
    ).toThrow(/peer_avatar_without_store_image_forbidden|member_avatar/);
  });

  it("8 badge_into_messenger_nav_is_fail", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [orderRoom({ roomId: "r1", orderId: "o1", unreadCount: 2 })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const badge = buildStoreOrderBadgeContribution(listed.snapshot.rows);
    expect(badge.navMessengerContribution).toBe(0);
    expect(badge.navMessengerContribution).toBe(STORE_ORDER_NAV_MESSENGER_CONTRIBUTION);
    expect(badge.contributesTo).not.toContain("nav_messenger");
    expect(() =>
      composeMessengerTabBadge(
        { domain: "store_order" as never, count: badge.unreadRoomCount },
        { domain: "group", count: 0 }
      )
    ).toThrow(/tab_domains/);
    const row = buildStoreOrderCustomerListViewModel(listed.snapshot.rows[0]!);
    expect(row.previewText).toBe("혹시 빨리 될까요?");
    expect(row.previewText).not.toBe(row.statusBadge);
  });

  it("9 trade_port_import_is_fail", () => {
    const importTrade = /from\s+["']@\/lib\/messenger\/trade(?:\/[^"']*)?["']/;
    for (const abs of walkTs(STORE_ORDER_ROOT)) {
      const src = fs.readFileSync(abs, "utf8");
      expect(importTrade.test(src)).toBe(false);
      if (path.basename(abs) === "design-lock.ts") continue;
      for (const token of STORE_ORDER_FORBIDDEN_TRADE_PORT_TOKENS) {
        expect(src.includes(token)).toBe(false);
      }
    }
  });

  it("10 general_port_import_is_fail", () => {
    const importGd = /from\s+["']@\/lib\/messenger\/general-direct(?:\/[^"']*)?["']/;
    for (const abs of walkTs(STORE_ORDER_ROOT)) {
      const src = fs.readFileSync(abs, "utf8");
      expect(importGd.test(src)).toBe(false);
    }
  });
});
