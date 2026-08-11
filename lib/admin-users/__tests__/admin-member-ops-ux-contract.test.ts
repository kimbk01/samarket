import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminMemberListDisplayName,
  adminMemberPublicIdAt,
  authEvidenceBadges,
} from "@/lib/admin-users/admin-member-identity";
import { displayNameForDetailUser, publicIdFromParts } from "@/components/admin/users/admin-user-lite-display";
import { memberBusinessCreditHref, memberStoresAdminHref } from "@/lib/admin-users/member-deep-links";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("admin member ops UX identity contract", () => {
  it("member ID is @{dibay_id} only and never username", () => {
    expect(adminMemberPublicIdAt("dibay_abc")).toBe("@dibay_abc");
    expect(adminMemberPublicIdAt(null)).toBe("");
    expect(publicIdFromParts(null, "login_alias")).toBe("");
    expect(publicIdFromParts("dibay_abc", "login_alias")).toBe("@dibay_abc");
  });

  it("display name prefers display_name over nickname", () => {
    expect(
      adminMemberListDisplayName({
        display_name: "최민영",
        nickname: "min",
        username: "login_alias",
      }),
    ).toBe("최민영");
    expect(
      displayNameForDetailUser({
        display_name: "최민영",
        nickname: "min",
        username: "login_alias",
        role: "user",
      }),
    ).toBe("최민영");
  });

  it("auth evidence does not invent oauth badges", () => {
    expect(
      authEvidenceBadges({
        email: "ops@manual.local",
        phoneVerified: true,
        authProvider: "unknown",
      }),
    ).toEqual(["phone"]);
  });

  it("list mapper keeps dibay_id and last_login_at clocks separate", () => {
    const listSrc = src("app/api/admin/users/route.ts");
    expect(listSrc).toMatch(/resolveDisplayName/);
    expect(listSrc).toMatch(/lastSignInAt:\s*r\.last_login_at/);
    expect(listSrc).toMatch(/slug:/);
    expect(listSrc).not.toMatch(/labelFromDisplayAndUsername/);
    expect(listSrc).not.toMatch(/const publicId = dibayId \|\| username/);
  });

  it("detail API does not alias username to dibay_id", () => {
    const detail = src("app/api/admin/users/[id]/route.ts");
    expect(detail).toMatch(/username: prof\.username \?\? null/);
    expect(detail).toMatch(/region_name: prof\.region_name/);
    expect(detail).not.toMatch(/username: prof\.username \?\? prof\.dibay_id/);
  });

  it("store admin CTA uses existing query surface and Business Credit is store-points", () => {
    expect(memberBusinessCreditHref()).toBe("/admin/store-points");
    expect(memberBusinessCreditHref("Cafe Manila")).toBe("/admin/store-points?q=Cafe%20Manila");
    expect(memberStoresAdminHref("my-slug")).toBe("/admin/stores?q=my-slug");
    const panel = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(panel).toMatch(/memberStorePublicHref/);
    expect(panel).not.toMatch(/\/admin\/stores\/\$\{/);
    expect(panel).not.toMatch(/store_staff/);
  });

  it("admin tab is person list plus permission editor, not Staff table as the page", () => {
    const listPage = src("components/admin/users/AdminUserListPage.tsx");
    expect(listPage).toMatch(/variant=\{tab === "store" \? "store" : tab === "admin" \? "admin" : "all"\}/);
    expect(listPage).toMatch(/onEditPermissions/);
    expect(listPage).not.toMatch(/<AdminStaffTable/);
    const table = src("components/admin/users/AdminUserTable.tsx");
    expect(table).toMatch(/publicIdForAdminUser/);
    expect(table).toMatch(/onClick=\{handleViewDetail\}/);
    expect(table).not.toMatch(/roleRowClass/);
    expect(table).not.toMatch(/loginIdentifier/);
  });

  it("detail shell is master record + 3-col overview, not metric card wall", () => {
    const cc = src("components/admin/users/AdminMemberControlCenter.tsx");
    expect(cc).toMatch(/AdminMemberMasterHeader/);
    expect(cc).toMatch(/AdminMemberAlertStrip/);
    expect(cc).toMatch(/AdminMemberOverviewPanel/);
    const overview = src("components/admin/users/AdminMemberOverviewPanel.tsx");
    expect(overview).toMatch(/lg:grid-cols-3/);
    expect(overview).toMatch(/admin_users_overview_master/);
    expect(overview).not.toMatch(/lg:grid-cols-2/);
    const metric = src("components/admin/users/AdminMemberMetricGrid.tsx");
    expect(metric).not.toMatch(/lg:grid-cols-4/);
  });
});
