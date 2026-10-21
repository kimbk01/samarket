/**
 * P2-12 — AD-04 (store-settlements GET 권한 키) · AD-05 (명시 빈 권한) · AD-10 (프로필 보정 시 권한 미러 금지).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultPermissionsForUiRole,
  resolveEffectiveStaffPermissionsFromStored,
} from "@/lib/admin/admin-user-server";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("AD-04 store-settlements GET", () => {
  it("business 권한 키로 가드한다 (isRouteAdmin 전원 허용 아님)", () => {
    const route = src("app/api/admin/store-settlements/route.ts");
    expect(route).toContain('requireAdminPermission("business")');
    expect(route).not.toContain("isRouteAdmin");
  });
});

describe("AD-05 explicit empty permission set", () => {
  it("행 없음 → 티어 기본값 · 저장된 [] → 권한 없음", () => {
    expect(resolveEffectiveStaffPermissionsFromStored(undefined, "operator")).toEqual(
      defaultPermissionsForUiRole("operator")
    );
    expect(resolveEffectiveStaffPermissionsFromStored(null, "manager")).toEqual(
      defaultPermissionsForUiRole("manager")
    );
    expect(resolveEffectiveStaffPermissionsFromStored([], "manager")).toEqual([]);
    expect(resolveEffectiveStaffPermissionsFromStored(["users"], "manager")).toEqual(["users"]);
  });

  it("staff 목록·멤버십 목록은 같은 해석 함수를 쓰고 `.length ?` 기본값 대체를 하지 않는다", () => {
    for (const rel of ["app/api/admin/staff/route.ts", "app/api/admin/staff/memberships/route.ts"]) {
      const s = src(rel);
      expect(s, rel).toContain("resolveEffectiveStaffPermissionsFromStored(");
      expect(s, rel).not.toMatch(/\?\.length\s*\n?\s*\?/);
    }
    const staff = src("app/api/admin/staff/route.ts");
    expect(staff).not.toContain("body.permissions.length > 0");
  });
});

describe("AD-10 users/[id] profile ensure", () => {
  it("test_users.role 로 권한 미러(role·is_admin·manual_account_type=admin)를 쓰지 않는다", () => {
    const route = src("app/api/admin/users/[id]/route.ts");
    const start = route.indexOf("async function _ensureProfileRow(");
    const end = route.indexOf("function phoneStatusToPatch(");
    const body = route.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(body).toContain('const role = "user";');
    expect(body).toContain("is_admin: false,");
    expect(body).not.toContain("isPrivilegedAdminRole");
    expect(body).not.toContain('role = "super_admin"');
    expect(body).not.toContain("admin_tier");
  });
});
