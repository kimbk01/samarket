import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("support identity / case SSOT contract", () => {
  it("migration defines member vs owner store isolation CHECK", () => {
    const sql = readRepo("supabase/migrations/20261202170000_support_cases_ssot.sql");
    expect(sql).toContain("support_cases_member_no_store");
    expect(sql).toContain("audience = 'MEMBER' AND owner_store_id IS NULL");
    expect(sql).toContain("audience = 'OWNER' AND owner_store_id IS NOT NULL");
  });

  it("case open API uses server auth user id — not client user_id", () => {
    const route = readRepo("app/api/support/cases/open/route.ts");
    expect(route).toContain("requireAuthenticatedUserId");
    expect(route).toContain("openSupportCaseFromContext");
    expect(route).not.toMatch(/body\.userId|member_user_id.*body/);
  });

  it("support case service validates owner store ownership", () => {
    const svc = readRepo("lib/support/support-case-service.ts");
    expect(svc).toContain("getCachedStoreIfOwner");
    expect(svc).toContain("store_forbidden");
  });

  it("sessionStorage is UX handoff only in enter client", () => {
    const enter = readRepo("components/support/SupportCenterEnterClient.tsx");
    expect(enter).toContain("readPendingSupportContext");
    expect(enter).toContain("/api/support/cases/open");
    expect(enter).toMatch(/NOT authorization|server validates/i);
  });

  it("admin canonical inbox route exists", () => {
    expect(readRepo("app/admin/support/page.tsx")).toContain("AdminSupportPage");
    const menu = readRepo("components/admin/admin-menu.ts");
    expect(menu).toContain('path: "/admin/support"');
  });

  it("support messages sender_type set server-side", () => {
    const svc = readRepo("lib/support/support-case-service.ts");
    expect(svc).toContain('sender_type: senderType');
    expect(svc).not.toMatch(/sender_type.*req\.body/);
  });
});
