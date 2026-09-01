import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memberModerationActionsForStatus } from "@/lib/admin-users/member-moderation-cta";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("admin member Control Center Slice 6–10", () => {
  it("community tab uses existing tables and does not invent a shadow engine", () => {
    const loader = src("lib/admin-users/member-community-tab.ts");
    const route = src("app/api/admin/users/[id]/community/route.ts");
    expect(loader).toMatch(/from\("community_posts"\)/);
    expect(loader).toMatch(/from\("community_comments"\)/);
    expect(loader).toMatch(/from\("community_reports"\)/);
    expect(loader).toMatch(/eq\("user_id", uid\)/);
    expect(loader).toMatch(/from\("feed_ad_requests"\)/);
    expect(loader).toMatch(/\.eq\("user_id", uid\)/);
    expect(loader).not.toMatch(/\.eq\("reporter_id"/);
    expect(loader).not.toMatch(/Math\.random/);
    expect(route).toMatch(/requireAdminPermission\("users"\)/);
    expect(route).not.toMatch(/export async function POST/);
  });

  it("trade tab uses posts + product_chats metadata and does not load chat body", () => {
    const loader = src("lib/admin-users/member-trade-tab.ts");
    expect(loader).toMatch(/from\("posts"\)/);
    expect(loader).toMatch(/seller_listing_state/);
    expect(loader).toMatch(/from\("product_chats"\)/);
    expect(loader).toMatch(/buyer_id/);
    expect(loader).not.toMatch(/chat_messages/);
    expect(loader).not.toMatch(/community_messenger_messages/);
  });

  it("orders tab uses store_orders buyer_user_id and payment_amount SSOT", () => {
    const loader = src("lib/admin-users/member-orders-tab.ts");
    const route = src("app/api/admin/users/[id]/orders/route.ts");
    expect(loader).toMatch(/buyer_user_id/);
    expect(loader).toMatch(/payment_amount/);
    expect(loader).toMatch(/STORE_ORDER_STATUS_LIST/);
    expect(loader).not.toMatch(/applyStoreOrderStatusTransition/);
    expect(route).not.toMatch(/export async function PATCH/);
    expect(route).not.toMatch(/export async function POST/);
  });

  it("store tab uses owner_user_id payload and does not invent staff", () => {
    const panel = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(panel).toMatch(/approval_status/);
    expect(panel).not.toMatch(/store_staff/);
    expect(panel).not.toMatch(/staff membership/);
  });

  it("chat tab is metadata-only and keeps 4-domain + legacy group separate", () => {
    const loader = src("lib/admin-users/member-chat-tab.ts");
    const route = src("app/api/admin/users/[id]/chats/route.ts");
    expect(loader).toMatch(/community_messenger_participants/);
    expect(loader).toMatch(/community_messenger_rooms/);
    expect(loader).toMatch(/group_room_members/);
    expect(loader).toMatch(/legacy_group_rooms/);
    expect(loader).not.toMatch(/from\("chat_messages"\)/);
    expect(loader).not.toMatch(/from\("community_messenger_messages"\)/);
    expect(loader).not.toMatch(/last_message_preview/);
    expect(route).not.toMatch(/from\("chat_messages"\)/);
    expect(route).not.toMatch(/from\("community_messenger_messages"\)/);
  });

  it("ops history uses existing audit sources with cursor pagination", () => {
    const loader = src("lib/admin-users/member-ops-history.ts");
    expect(loader).toMatch(/user_moderation_events/);
    expect(loader).toMatch(/audit_logs/);
    expect(loader).toMatch(/trust_events/);
    expect(loader).toMatch(/nextCursor/);
    expect(loader).not.toMatch(/from\("point_ledger"\)/);
  });

  it("moderation CTAs match backend warn/suspend/ban/restore", () => {
    expect(memberModerationActionsForStatus("normal")).toEqual(["warn", "suspend", "ban"]);
    expect(memberModerationActionsForStatus("warned")).toEqual(["warn", "suspend", "ban"]);
    expect(memberModerationActionsForStatus("suspended")).toEqual(["restore", "ban"]);
    expect(memberModerationActionsForStatus("banned")).toEqual(["restore"]);
    const panel = src("components/admin/users/AdminMemberOpsPanel.tsx");
    expect(panel).toMatch(/\/api\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/moderation/);
    expect(panel).toMatch(/\/api\/admin\/member-notes/);
    expect(panel).toMatch(/알림 보내기 — 지원되지 않음/);
    expect(panel).not.toMatch(/profiles\.role/);
  });

  it("community/trade/delivery/chat/ops routes are users-gated GET", () => {
    for (const rel of [
      "app/api/admin/users/[id]/community/route.ts",
      "app/api/admin/users/[id]/trade/route.ts",
      "app/api/admin/users/[id]/orders/route.ts",
      "app/api/admin/users/[id]/chats/route.ts",
      "app/api/admin/users/[id]/ops-history/route.ts",
    ]) {
      const route = src(rel);
      expect(route).toMatch(/requireAdminPermission\("users"\)/);
      expect(route).toMatch(/export async function GET/);
    }
  });
});
