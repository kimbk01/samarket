import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_ADMIN_FULL_SSOT_CATALOG,
  MEMBER_ADMIN_FULL_SSOT_IDS,
} from "@/lib/admin-users/member-admin-full-ssot-catalog";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("member-admin-full-ssot-contract", () => {
  it("catalog IDs are unique and stable", () => {
    expect(MEMBER_ADMIN_FULL_SSOT_IDS.length).toBe(MEMBER_ADMIN_FULL_SSOT_CATALOG.length);
    expect(new Set(MEMBER_ADMIN_FULL_SSOT_IDS).size).toBe(MEMBER_ADMIN_FULL_SSOT_IDS.length);
    expect(MEMBER_ADMIN_FULL_SSOT_IDS).toContain("MM-LIST-SELECT");
    expect(MEMBER_ADMIN_FULL_SSOT_IDS).toContain("MM-DETAIL-MODERATION");
    expect(MEMBER_ADMIN_FULL_SSOT_IDS).toContain("MM-HARD-LOCK");
  });

  it("DangerZone execution is wired in ControlCenter", () => {
    const cc = read("components/admin/users/AdminMemberControlCenter.tsx");
    expect(cc).toContain("onAction=");
    expect(cc).toContain("executeMemberManagementAction");
    expect(cc).not.toMatch(/AdminMemberDangerZone actions=\{dangerActions\} \/>/);
  });

  it("list selection + bulk + provider icon present", () => {
    const table = read("components/admin/users/AdminUserTable.tsx");
    expect(table).toContain("useAdminManagementSelection");
    expect(table).toContain("AdminMemberListBulkBar");
    expect(table).toContain("AdminUserProviderIcon");
  });

  it("phone verification supports 4-state set_status", () => {
    const route = read("app/api/admin/users/[id]/phone-verification/route.ts");
    const dialog = read("components/admin/users/AdminMemberVerificationDialog.tsx");
    expect(route).toContain("set_status");
    expect(dialog).toContain("pending");
    expect(dialog).toContain("rejected");
  });

  it("detail soft refresh avoids blank remount contract", () => {
    const detail = read("components/admin/users/AdminUserDetailPage.tsx");
    expect(detail).toContain("softRefreshing");
    expect(detail).toContain("data-member-detail-soft-refresh");
  });

  it("list supports joined period + sort + selection clears via queryScopeKey", () => {
    const presentation = read("lib/admin-users/member-list-presentation.ts");
    const filter = read("components/admin/users/AdminUserFilterBar.tsx");
    const route = read("app/api/admin/users/route.ts");
    const table = read("components/admin/users/AdminUserTable.tsx");
    expect(presentation).toContain("joinedFrom");
    expect(presentation).toContain("MemberListSortId");
    expect(filter).toContain('data-member-list-filter="sort"');
    expect(route).toContain("sortColumn");
    expect(table).toContain("queryScopeKey");
  });

  it("purge preview route is read-only GET", () => {
    const preview = read("app/api/admin/users/[id]/purge-preview/route.ts");
    expect(preview).toContain("export async function GET");
    expect(preview).not.toMatch(/export async function (POST|PATCH|DELETE)/);
    expect(preview).toContain("fetchAuthUserPurgeBlockers");
  });
});
