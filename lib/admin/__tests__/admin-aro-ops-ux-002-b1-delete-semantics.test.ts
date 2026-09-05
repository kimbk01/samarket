/**
 * ARO-OPS-UX-002-B1 — Delete semantics & hard-delete visibility contract.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canHardDelete,
  COMMUNITY_COMMENT_ENTITY_ACTION_POLICY,
  COMMUNITY_POST_ENTITY_ACTION_POLICY,
  isBulkActionAllowed,
  listVisibleBulkActions,
  MEMBER_ENTITY_ACTION_POLICY,
  ORDER_ENTITY_ACTION_POLICY,
  SETTLEMENT_ENTITY_ACTION_POLICY,
  STORE_ENTITY_ACTION_POLICY,
  terminologyDisplay,
  TRADE_POST_ENTITY_ACTION_POLICY,
} from "@/lib/admin/management";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("ARO-OPS-UX-002-B1 delete semantics", () => {
  it("B1-1/B1-2 canonical terminology: Hide / Restore / Soft / Hard distinct", () => {
    expect(terminologyDisplay("HIDE", "ko")).toBe("숨김");
    expect(terminologyDisplay("RESTORE", "ko")).toBe("복구");
    expect(terminologyDisplay("SOFT_DELETE", "ko")).toBe("삭제(상태)");
    expect(terminologyDisplay("HARD_DELETE", "ko")).toBe("DB 영구 삭제");
    expect(terminologyDisplay("SOFT_DELETE", "en")).toBe("Delete (status)");
    expect(terminologyDisplay("HARD_DELETE", "en")).toBe("Permanent DB delete");
    expect(terminologyDisplay("SOFT_DELETE", "ko")).not.toBe(terminologyDisplay("HARD_DELETE", "ko"));
    expect(terminologyDisplay("SOFT_DELETE", "ko")).not.toBe(terminologyDisplay("HIDE", "ko"));
  });

  it("B1-3/B1-4/B1-5 Trade: soft label, no hard CTA, soft modal keeps DB-row hint", () => {
    expect(TRADE_POST_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(false);
    expect(TRADE_POST_ENTITY_ACTION_POLICY.canSoftDelete).toBe(true);
    expect(canHardDelete(TRADE_POST_ENTITY_ACTION_POLICY)).toBe(false);
    expect(listVisibleBulkActions(TRADE_POST_ENTITY_ACTION_POLICY)).toEqual([
      "restore",
      "hide",
      "soft_delete",
    ]);
    expect(isBulkActionAllowed(TRADE_POST_ENTITY_ACTION_POLICY, "hard_delete")).toBe(false);

    const table = read("components/admin/posts-management/AdminPostsManagementTable.tsx");
    expect(table).toContain('terminologyDisplay("SOFT_DELETE"');
    expect(table).not.toMatch(/\(soft\)/);
    expect(table).toMatch(/DB 영구 삭제가 아닙니다/);
    expect(table).toMatch(/hard_delete omitted/);
    expect(table).not.toMatch(/id:\s*"hard_delete"/);
    expect(TRADE_POST_ENTITY_ACTION_POLICY.hardMutationOwner).toBeNull();
    expect(TRADE_POST_ENTITY_ACTION_POLICY.softMutationOwner).toMatch(/updatePostStatusAdmin/);
  });

  it("B1-6/B1-7/B1-8/B1-9 Community: row soft; bulk hard visible; real owner; stronger confirm", () => {
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.canSoftDelete).toBe(true);
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(true);
    expect(canHardDelete(COMMUNITY_POST_ENTITY_ACTION_POLICY)).toBe(true);
    expect(listVisibleBulkActions(COMMUNITY_POST_ENTITY_ACTION_POLICY)).toEqual([
      "hide",
      "restore",
      "soft_delete",
      "hard_delete",
    ]);
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.hardMutationOwner).toContain(
      "/api/admin/community/engine/posts/bulk-delete"
    );
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.softConfirmMode).toBe("danger_confirm");
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.hardConfirmMode).toBe("strong_danger_confirm");

    const posts = read("app/admin/community/posts/AdminPostsPageContent.tsx");
    expect(posts).toContain('terminologyDisplay("SOFT_DELETE"');
    expect(posts).toContain('terminologyDisplay("HARD_DELETE"');
    expect(posts).toContain("data-admin-mgmt-row-soft-delete");
    expect(posts).toContain("/api/admin/community/engine/posts/bulk-delete");
    expect(posts).toContain("dibayPrompt");
    expect(posts).toMatch(/Type DELETE|DELETE 를 입력/);
    expect(posts).toMatch(/No soft-delete fallback/);
    expect(posts).not.toContain("admin_community_danger_zone");
  });

  it("B1-10 Comments soft-only — hard CTA absent", () => {
    expect(COMMUNITY_COMMENT_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(false);
    expect(canHardDelete(COMMUNITY_COMMENT_ENTITY_ACTION_POLICY)).toBe(false);
    expect(listVisibleBulkActions(COMMUNITY_COMMENT_ENTITY_ACTION_POLICY)).not.toContain(
      "hard_delete"
    );
    const comments = read("components/admin/community/AdminCommunityCommentsPage.tsx");
    expect(comments).toContain('terminologyDisplay("SOFT_DELETE"');
    expect(comments).not.toMatch(/id:\s*"hard_delete"/);
    expect(comments).not.toContain("bulk-delete");
  });

  it("B1-11/B1-12 protected entities: Member/Store/Order/Settlement hard blocked", () => {
    for (const p of [
      MEMBER_ENTITY_ACTION_POLICY,
      STORE_ENTITY_ACTION_POLICY,
      ORDER_ENTITY_ACTION_POLICY,
      SETTLEMENT_ENTITY_ACTION_POLICY,
    ]) {
      expect(p.hardDeleteAvailable).toBe(false);
      expect(canHardDelete(p)).toBe(false);
      expect(isBulkActionAllowed(p, "hard_delete")).toBe(false);
      expect(p.hardConfirmMode).toBe("blocked");
    }
  });

  it("B1-13/B1-14 shared policy owner only — no parallel delete system invented in UI", () => {
    const bulk = read("components/admin/management/AdminManagementBulkBar.tsx");
    expect(bulk).toContain("isBulkActionAllowed");
    expect(bulk).toContain("data-admin-mgmt-hard-delete");
    expect(bulk).not.toMatch(/createDeletePolicy|newDeleteSsot/i);
  });
});
