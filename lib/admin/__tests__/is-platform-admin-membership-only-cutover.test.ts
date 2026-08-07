import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CUTOVER = "supabase/migrations/20261021120000_is_platform_admin_membership_only.sql";
const DUAL = "supabase/migrations/20261020120000_admin_memberships.sql";

describe("is_platform_admin membership-only cutover migration", () => {
  it("replaces dual-read with membership-only EXISTS (no profiles.role OR branch)", () => {
    const sql = readFileSync(join(process.cwd(), CUTOVER), "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_platform_admin\(check_uid uuid\)/);
    expect(sql).toMatch(/FROM public\.admin_memberships m/);
    expect(sql).toMatch(/m\.status = 'active'/);
    expect(sql).toMatch(/m\.role IN \('admin', 'super_admin'\)/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_platform_admin\(uuid\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_platform_admin\(uuid\) TO service_role/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_platform_admin\(uuid\) FROM anon/);
    // executable body only (strip line comments + COMMENT ON)
    const body = sql.replace(/--[^\n]*/g, "").replace(/COMMENT ON FUNCTION[\s\S]*?;/, "");
    expect(body).not.toMatch(/FROM public\.profiles p/);
    expect(body).not.toMatch(/p\.role IN/);
    expect(body).not.toMatch(/test_users/);
    expect(body).not.toMatch(/\baaaa\b/);
  });

  it("prior dual-read migration remains historical (not rewritten)", () => {
    const dual = readFileSync(join(process.cwd(), DUAL), "utf8");
    expect(dual).toMatch(/p\.role IN \('admin', 'super_admin'\)/);
    expect(dual).toMatch(/FROM public\.admin_memberships m/);
  });

  it("documents membership-only contract", () => {
    const sql = readFileSync(join(process.cwd(), CUTOVER), "utf8");
    expect(sql).toMatch(/Membership-only/);
    expect(sql).toMatch(/No profiles\.role/);
  });
});
