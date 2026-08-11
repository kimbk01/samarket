import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin member list Slice 1 authority", () => {
  const listSrc = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
  const detailUi = readFileSync(
    join(process.cwd(), "components/admin/users/AdminTestUserDetail.tsx"),
    "utf8",
  );
  const pointsUi = readFileSync(
    join(process.cwd(), "components/admin/users/AdminUserPointsSection.tsx"),
    "utf8",
  );

  it("maps additive badges instead of exclusive admin>store>member overwrite", () => {
    expect(listSrc).toMatch(/resolveAdminMemberRoleBadges/);
    expect(listSrc).toMatch(/adminMemberRelationFilterPlan/);
    expect(listSrc).not.toMatch(/if \(opts\?\.hasAdminMembership === true\)/);
    expect(listSrc).not.toMatch(/resolveAdminAccountCategory/);
  });

  it("does not treat profiles.points as list balance SSOT", () => {
    expect(listSrc).not.toMatch(/pointBalance:\s*Number\(r\.points/);
  });

  it("does not alias last_login_at as lastActiveAt", () => {
    expect(listSrc).toMatch(/lastSignInAt:\s*r\.last_login_at/);
    expect(listSrc).not.toMatch(/lastActiveAt:\s*r\.last_login_at/);
  });

  it("detail does not present phone_verified_at as last activity", () => {
    expect(detailUi).not.toMatch(/phone_verified_at\s*\?\?\s*user\.created_at/);
    expect(detailUi).not.toMatch(/resolveAccountCategoryFromRole/);
  });

  it("points UI does not render fetch failure as 0P", () => {
    expect(pointsUi).toMatch(/balanceUnavailable|points_balance_unavailable/);
    expect(pointsUi).not.toMatch(/\(balance \?\? 0\)\.toLocaleString\(\)\}P/);
  });
});
