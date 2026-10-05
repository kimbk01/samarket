/**
 * ARO-OPS-UX-001-W2 — Members domain migration contract tests.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getOperationalFrequencyEntry,
  isBulkActionAllowed,
  listVisibleBulkActions,
  MEMBER_ENTITY_ACTION_POLICY,
  selectionHeaderState,
  shouldClearSelectionOnQueryChange,
  terminologyDisplay,
} from "@/lib/admin/management";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("ARO-OPS-UX-001-W2 members management migration", () => {
  it("M1–M2 page uses W1 shell + table viewport", () => {
    const page = read("components/admin/users/AdminUserListPage.tsx");
    const table = read("components/admin/users/AdminUserTable.tsx");
    expect(page).toContain("AdminManagementSurfaceRoot");
    expect(page).toContain('wave="w2"');
    expect(table).toContain("AdminManagementTableViewport");
    expect(read("components/admin/management/AdminManagementTableViewport.tsx")).toContain(
      "data-admin-mgmt-table-viewport"
    );
  });

  it("M3–M7 Owner FULL SSOT: page-scoped checkbox selection + member bulk bar", () => {
    const table = read("components/admin/users/AdminUserTable.tsx");
    expect(table).toContain("queryScopeKey");
    expect(table).toContain("onViewDetail");
    expect(table).toContain("useAdminManagementSelection");
    expect(table).toContain("AdminManagementSelectionCheckbox");
    expect(table).toContain("AdminMemberListBulkBar");
    expect(selectionHeaderState(new Set(["a"]), ["a", "b"])).toBe("some");
    expect(shouldClearSelectionOnQueryChange("p1", "p2")).toBe(true);
  });

  it("M8–M9 member bulk uses dedicated APIs with strong purge confirm policy", () => {
    expect(MEMBER_ENTITY_ACTION_POLICY.deleteMode).toBe("HARD_DELETE");
    expect(MEMBER_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(true);
    expect(MEMBER_ENTITY_ACTION_POLICY.hardConfirmMode).toBe("strong_danger_confirm");
    expect(isBulkActionAllowed(MEMBER_ENTITY_ACTION_POLICY, "hard_delete")).toBe(true);
    expect(listVisibleBulkActions(MEMBER_ENTITY_ACTION_POLICY)).toEqual([
      "change_status",
      "restore",
      "soft_delete",
      "hard_delete",
    ]);
    const table = read("components/admin/users/AdminUserTable.tsx");
    // Must not invent a separate wipe endpoint; reuse per-member delete/moderation.
    expect(table).not.toContain("/api/admin/users/bulk");
    expect(table).toContain("AdminMemberListBulkBar");
    const bulk = read("components/admin/users/AdminMemberListBulkBar.tsx");
    expect(bulk).toContain("executeMemberManagementActionsBulk");
    const client = read("lib/admin-users/member-management-actions-client.ts");
    expect(client).toContain("/api/admin/users/");
    expect(client).toContain("/moderation");
    expect(client).toContain("/delete");
  });

  it("M10 deletion request queue remains separate from list bulk", () => {
    const page = read("components/admin/users/AdminUserListPage.tsx");
    expect(page).toContain("/admin/users/deletion-requests");
    expect(page).toContain("data-member-list-deletion-entry");
    expect(page).not.toContain("<AdminDeletionRequestsQueue");
    const deletionPage = read("app/admin/users/deletion-requests/page.tsx");
    expect(deletionPage).toContain("AdminDeletionRequestsQueue");
    expect(deletionPage).toContain('data-admin-member-deletion-request-queue="1"');
    const queue = read("components/admin/users/AdminDeletionRequestsQueue.tsx");
    expect(queue).toContain("/api/admin/account-deletion-requests");
    expect(queue).not.toContain("AdminManagementBulkBar");
  });

  it("M11–M13 CTA terminology + semantic columns; no arbitrary 1100 min-width", () => {
    const table = read("components/admin/users/AdminUserTable.tsx");
    expect(table).toContain("MEMBER_LIST_DETAIL_ACTION_KO");
    expect(table).toContain("managementColumnStyle");
    expect(table).toContain("computeTableMinWidthPx");
    expect(table).not.toContain("min-w-[1100px]");
    expect(terminologyDisplay("MEMBER", "ko")).toBe("회원");
    expect(terminologyDisplay("OWNER", "ko")).toBe("Owner");
  });

  it("M14 mutation owners unchanged (cleanup + deletion request APIs only)", () => {
    const page = read("components/admin/users/AdminUserListPage.tsx");
    expect(page).toContain("/api/admin/users/cleanup");
    expect(page).not.toContain("/api/admin/users/bulk-v2");
    expect(page).not.toContain("bulk-v2");
    const table = read("components/admin/users/AdminUserTable.tsx");
    expect(table).not.toContain("/api/admin/users/bulk");
  });

  it("M15 loading/empty/error remain distinct", () => {
    const page = read("components/admin/users/AdminUserListPage.tsx");
    expect(page).toContain('data-member-list-state="loading"');
    expect(page).toContain('data-member-list-state="error"');
    expect(page).toContain('data-member-list-state={appliedSearch ? "search_empty" : "empty"}');
    expect(page).toContain("MEMBER_LIST_ERROR_KO");
  });

  it("M16 tablet geometry helper still valid; frequency entry for members", () => {
    expect(getOperationalFrequencyEntry("system-users")?.frequency).toBe("FREQUENT");
    expect(getOperationalFrequencyEntry("system-member-deletion-requests")?.frequency).toBe(
      "DAILY_CRITICAL"
    );
    expect(existsSync(join(root, "components/admin/management/AdminManagementTableViewport.tsx"))).toBe(
      true
    );
  });

  it("no parallel users-v2 tree", () => {
    expect(existsSync(join(root, "components/admin/users-v2"))).toBe(false);
    expect(existsSync(join(root, "components/admin/AdminUserTableV2.tsx"))).toBe(false);
  });
});
