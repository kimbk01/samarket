import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { adminMenu } from "@/components/admin/admin-menu";
import { memberOrderRoomAdminHref } from "@/lib/admin-users/member-deep-links";
import { storeOrderRoomIdentity } from "@/lib/chat-domain/room-identity";
import { ADMIN_CM_DOMAIN_LIST_DOMAINS } from "@/lib/admin-community-messenger/service";

const ROOT = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("P1-1 Messenger HOLLOW + Delivery order-chat LIVE", () => {
  it("general page wires AdminMessengerDomainRoomList general → general_direct", () => {
    const src = read("app/admin/chats/general/page.tsx");
    expect(src).toContain('mode="general"');
    expect(src).toContain("AdminMessengerDomainRoomList");
    const list = read("components/admin/chats/AdminMessengerDomainRoomList.tsx");
    expect(list).toMatch(/general:\s*"general_direct"/);
    expect(list).toMatch(/group:\s*"group"/);
    expect(list).toMatch(/store_order:\s*"store_order"/);
    expect(list).toContain("/api/admin/community-messenger/rooms?domain=");
    expect(list).not.toContain("data-admin-surface=\"hollow\"");
  });

  it("group page is LIVE CM group (not AdminChatListPage hollow)", () => {
    const src = read("app/admin/chats/group/page.tsx");
    expect(src).toContain('mode="group"');
    expect(src).toContain("AdminMessengerDomainRoomList");
    expect(src).not.toContain("AdminChatListPage");
  });

  it("community → general and business → order-chats are redirect aliases", () => {
    const community = read("app/admin/chats/community/page.tsx");
    expect(community).toContain('redirect("/admin/chats/general")');
    expect(community).not.toContain("AdminChatListPage");
    const business = read("app/admin/chats/business/page.tsx");
    expect(business).toContain('redirect("/admin/order-chats")');
    expect(business).not.toContain("AdminChatListPage");
  });

  it("order-chats list is LIVE lookup-only (no ensure)", () => {
    const list = read("components/admin/delivery-orders/AdminOrderChatList.tsx");
    expect(list).toContain("/api/admin/order-chats");
    expect(list).toContain('data-admin-surface="live"');
    expect(list).not.toContain('data-admin-surface="stub"');
    expect(list).not.toContain("ensureStoreOrderMessengerRoom");
    const page = read("app/admin/stores/orders/[orderId]/chat/page.tsx");
    expect(page).toContain("lookupAdminStoreOrderMessengerRoomId");
    expect(page).not.toContain("ensureStoreOrderMessengerRoom");
    expect(page).not.toContain("AdminDeliveryOrderChatDbClient");
  });

  it("store_order identity key is store_order:{orderId}", () => {
    expect(storeOrderRoomIdentity("abc-123").identityKey).toBe("store_order:abc-123");
    const service = read("lib/admin-delivery-orders/list-admin-store-order-chats.ts");
    expect(service).toContain("storeOrderRoomIdentity");
    expect(service).toContain("community_messenger_room_id");
    expect(service).not.toContain("ensureStoreOrderMessengerRoom");
  });

  it("CM domain list API allows only general_direct|group|store_order", () => {
    expect([...ADMIN_CM_DOMAIN_LIST_DOMAINS]).toEqual([
      "general_direct",
      "group",
      "store_order",
    ]);
    const route = read("app/api/admin/community-messenger/rooms/route.ts");
    expect(route).toContain("isAdminCmDomainListDomain");
    expect(route).toContain("listAdminCommunityMessengerRoomsByDomain");
    const service = read("lib/admin-community-messenger/service.ts");
    expect(service).toContain("chat_domain, domain_identity_key");
    expect(service).toContain('.eq("chat_domain", domain)');
    const fnStart = service.indexOf("export async function listAdminCommunityMessengerRoomsByDomain");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = service.slice(fnStart, fnStart + 2500);
    expect(fnBody).not.toMatch(/from\(["']community_messenger_messages["']\)/);
  });

  it("menu IA: general + group done; business alias on delivery-order-chats", () => {
    const general = findAdminMenuByKey(adminMenu, "chat-general");
    expect(general?.path).toBe("/admin/chats/general");
    expect(general?.matchPaths).toEqual(["/admin/chats/community"]);
    expect(general?.status).toBe("done");
    const group = findAdminMenuByKey(adminMenu, "chat-group");
    expect(group?.path).toBe("/admin/chats/group");
    expect(group?.status).toBe("done");
    expect(findAdminMenuByKey(adminMenu, "chat-community")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "chat-business")).toBeUndefined();
    const orderChats = findAdminMenuByKey(adminMenu, "delivery-order-chats");
    expect(orderChats?.path).toBe("/admin/order-chats");
    expect(orderChats?.matchPaths).toEqual(["/admin/chats/business"]);
    expect(orderChats?.status).toBe("done");
    expect(memberOrderRoomAdminHref()).toBe("/admin/order-chats");
  });

  it("Trade prefer product_chats unchanged; status selectNoVis preserved", () => {
    const tradeList = read("components/admin/chats/AdminChatListPage.tsx");
    expect(tradeList).toContain('s === "product_chats" ? 2 : 1');
    const status = read("app/api/admin/posts/[postId]/status/route.ts");
    expect(status).toContain("selectNoVis");
  });

  it("general and group pages exist", () => {
    expect(existsSync(path.join(ROOT, "app/admin/chats/general/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/admin/chats/group/page.tsx"))).toBe(true);
  });
});
