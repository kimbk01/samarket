/**
 * ARO-OPS-UX-002-B1R — Delete operation UX close (no prompt loop; eligibility hard delete).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMUNITY_POST_ENTITY_ACTION_POLICY,
  isBulkActionAllowed,
  listVisibleBulkActions,
  TRADE_POST_ENTITY_ACTION_POLICY,
  terminologyDisplay,
} from "@/lib/admin/management";
import {
  evaluateTradePostHardDeleteEligibility,
  partitionTradePostsForHardDelete,
} from "@/lib/admin-posts/trade-post-hard-delete-eligibility";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("ARO-OPS-UX-002-B1R delete operation UX", () => {
  it("R1–R3 Trade soft bulk uses one-confirm helper (no per-id prompt loop)", () => {
    const table = read("components/admin/posts-management/AdminPostsManagementTable.tsx");
    expect(table).toContain("confirmAndApplyBulkAdminPostStatus");
    expect(table).not.toMatch(/for \(const id of selection\.selected\)[\s\S]*runAction\(action/);
    const bulk = read("lib/admin-posts/confirm-admin-post-bulk-moderation.ts");
    expect(bulk).toMatch(/cancelled: true/);
    expect(bulk).toMatch(/for \(const p of products\)/);
    expect(bulk).toMatch(/updatePostStatusAdmin/);
  });

  it("R5–R6 Trade hard eligibility: sold blocked, active eligible", () => {
    expect(evaluateTradePostHardDeleteEligibility({ id: "a", status: "sold" }).eligible).toBe(
      false
    );
    expect(
      evaluateTradePostHardDeleteEligibility({
        id: "b",
        status: "active",
        soldBuyerId: "buyer",
      }).eligible
    ).toBe(false);
    expect(
      evaluateTradePostHardDeleteEligibility({ id: "c", status: "active" }).eligible
    ).toBe(true);
    const part = partitionTradePostsForHardDelete([
      { id: "1", status: "sold" },
      { id: "2", status: "hidden" },
    ]);
    expect(part.eligibleIds).toEqual(["2"]);
    expect(part.blocked).toHaveLength(1);
  });

  it("R6 Trade policy exposes hard_delete + maps to bulk-delete API", () => {
    expect(TRADE_POST_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(true);
    expect(isBulkActionAllowed(TRADE_POST_ENTITY_ACTION_POLICY, "hard_delete")).toBe(true);
    expect(listVisibleBulkActions(TRADE_POST_ENTITY_ACTION_POLICY)).toContain("hard_delete");
    const api = read("app/api/admin/posts/bulk-delete/route.ts");
    expect(api).toContain("evaluateTradePostHardDeleteEligibility");
    expect(api).not.toMatch(/permanent_delete_not_ready/);
    const table = read("components/admin/posts-management/AdminPostsManagementTable.tsx");
    expect(table).toContain("runBulkHardDelete");
    expect(table).toContain("/api/admin/posts/bulk-delete");
    expect(table).toMatch(/Type DELETE|DELETE 를 입력/);
  });

  it("R8–R10 Community hard CTA stronger than soft in BulkBar", () => {
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(true);
    const bar = read("components/admin/management/AdminManagementBulkBar.tsx");
    expect(bar).toContain("CRITICAL_DANGER");
    expect(bar).toContain("ring-2 ring-red-800");
    expect(terminologyDisplay("HARD_DELETE", "ko")).toBe("DB 영구 삭제");
    expect(terminologyDisplay("SOFT_DELETE", "ko")).toBe("삭제(상태)");
  });

  it("R11–R12 Chat terminology aligned to hide-list vs permanent DB delete", () => {
    const catalog = read("lib/i18n/catalog/admin.ts");
    expect(catalog).toMatch(/admin_chat_remove_list_only:\s*"관리 목록에서만? 숨김/);
    expect(catalog).toMatch(/admin_chat_delete_from_db:\s*"DB 영구 삭제"/);
    const chats = read("components/admin/chats/AdminChatListPage.tsx");
    expect(chats).toContain('data-admin-mgmt-hard-delete="1"');
    expect(chats).toContain('typed.trim() !== "DELETE"');
  });

  it("R14 Domain reset entry prefills scopes", () => {
    expect(buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.trade)).toBe(
      "/admin/prelaunch-reset?scopes=trade_content"
    );
    expect(buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.community)).toContain(
      "community_posts"
    );
    expect(buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.chat)).toContain("chat");
    const resetPage = read("components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx");
    expect(resetPage).toContain('searchParams.get("scopes")');
    const trade = read("components/admin/posts-management/AdminPostsManagementTable.tsx");
    expect(trade).toContain('data-admin-domain-reset-entry="trade"');
  });
});
