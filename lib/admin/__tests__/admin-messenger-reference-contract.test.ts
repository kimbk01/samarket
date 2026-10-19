import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 5 → J-AMD-4 — Chat workspace Trade/Order entries are 전체채팅 type filters
 * (no ownership move, no `?from=messenger` duplicate leaves, no developer REFERENCE banners).
 */
describe("Admin Messenger reference presentation contract (J-AMD-4)", () => {
  it("Chat Trade/Order leaves point at 전체채팅 type filters; legacy ?from= URLs only match", () => {
    const trade = findAdminMenuByKey(adminMenu, "chat-trade-messenger");
    const order = findAdminMenuByKey(adminMenu, "delivery-order-chats-messenger");
    expect(trade?.path).toBe("/admin/chats?type=trade");
    expect(order?.path).toBe("/admin/chats?type=store_order");
    expect(trade?.matchPaths).toContain("/admin/chats/trade?from=messenger");
    expect(order?.matchPaths).toContain("/admin/order-chats?from=messenger");
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain('"chat-trade-messenger": "admin_menu_chat_rooms_trade"');
    expect(menu).toContain('"delivery-order-chats-messenger": "admin_menu_chat_rooms_store_order"');
  });

  it("Trade list has no developer identity / REFERENCE / HOLLOW banners", () => {
    const page = read("components/admin/chats/AdminChatListPage.tsx");
    expect(page).not.toContain("admin-messenger-trade-reference-banner");
    expect(page).not.toContain("admin-trade-chat-identity-banner");
    expect(page).not.toContain("admin-chat-hollow-banner");
    expect(page).not.toContain("Trade OPS identity");
  });

  it("Order chats hub drops the REFERENCE banner but keeps Delivery authority foot copy", () => {
    const hub = read("app/admin/order-chats/page.tsx");
    expect(hub).not.toContain("admin-messenger-order-reference-banner");
    expect(hub).toContain("admin_order_chats_foot_authority");
    expect(hub).not.toMatch(/community_messenger_\*로 통합/);
  });

  it("Order chat CTA label is not Messenger-ownership wording", () => {
    const list = read("components/admin/delivery-orders/AdminOrderChatList.tsx");
    expect(list).toContain("주문 채팅 열기");
    expect(list).not.toContain("메신저 방 열기");
  });

  it("does not invent Trade/Order room create APIs in Slice 5 surfaces", () => {
    const list = read("components/admin/delivery-orders/AdminOrderChatList.tsx");
    expect(list).not.toMatch(/ensureStoreOrderMessengerRoom|createRoom|POST.*order-chats/);
  });
});
