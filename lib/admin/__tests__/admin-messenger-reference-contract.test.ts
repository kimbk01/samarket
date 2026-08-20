import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 5 — Messenger Trade/Order = REFERENCE entry only (no ownership move).
 */
describe("Admin Messenger reference presentation contract", () => {
  it("Messenger Trade/Order leaves keep ?from=messenger paths with reference title keys", () => {
    expect(findAdminMenuByKey(adminMenu, "chat-trade-messenger")?.path).toBe(
      "/admin/chats/trade?from=messenger"
    );
    expect(findAdminMenuByKey(adminMenu, "delivery-order-chats-messenger")?.path).toBe(
      "/admin/order-chats?from=messenger"
    );
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain(
      '"chat-trade-messenger": "admin_menu_chat_trade_messenger_ref"'
    );
    expect(menu).toContain(
      '"delivery-order-chats-messenger": "admin_menu_order_chats_messenger_ref"'
    );
  });

  it("Trade list shows REFERENCE banner when from=messenger", () => {
    const page = read("components/admin/chats/AdminChatListPage.tsx");
    expect(page).toContain("admin-messenger-trade-reference-banner");
    expect(page).toContain("admin_messenger_trade_reference_banner");
  });

  it("Order chats hub shows REFERENCE banner and Delivery authority foot copy", () => {
    const hub = read("app/admin/order-chats/page.tsx");
    expect(hub).toContain("admin-messenger-order-reference-banner");
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
