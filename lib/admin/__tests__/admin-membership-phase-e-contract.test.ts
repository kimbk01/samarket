import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";

describe("PHASE E admin membership contract", () => {
  it("normalizes master → super_admin and privileges admin|super_admin only", () => {
    expect(normalizeAdminRole("master")).toBe("super_admin");
    expect(isPrivilegedAdminRole("admin")).toBe(true);
    expect(isPrivilegedAdminRole("super_admin")).toBe(true);
    expect(isPrivilegedAdminRole("operator")).toBe(false);
  });

  it("E.1 migration defines admin_memberships + historical dual-read is_platform_admin", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261020120000_admin_memberships.sql"),
      "utf8"
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.admin_memberships");
    expect(sql).toContain("admin_memberships_one_active_per_user_idx");
    expect(sql).toContain("FROM public.admin_memberships m");
    expect(sql).toContain("p.role IN ('admin', 'super_admin')");
  });

  it("cutover migration removes profiles.role OR from is_platform_admin", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261021120000_is_platform_admin_membership_only.sql"),
      "utf8"
    );
    expect(sql).toContain("FROM public.admin_memberships m");
    expect(sql).not.toContain("FROM public.profiles p");
  });

  it("staff writers call upsertActiveAdminMembership", () => {
    const staff = readFileSync(join(process.cwd(), "app/api/admin/staff/route.ts"), "utf8");
    expect(staff).toContain("upsertActiveAdminMembership");
    expect(staff).toContain("admin_memberships");
    const staffId = readFileSync(join(process.cwd(), "app/api/admin/staff/[id]/route.ts"), "utf8");
    expect(staffId).toContain("revokeActiveAdminMembership");
    expect(staffId).toContain("resolveEffectiveAdminRole");
  });

  it("person directory joins stores for store_manager category", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
    expect(src).toContain('.from("stores")');
    expect(src).toContain("owner_user_id");
    expect(src).toContain("storeCount");
    expect(src).not.toMatch(/role === \"store_owner\"/);
  });
});
