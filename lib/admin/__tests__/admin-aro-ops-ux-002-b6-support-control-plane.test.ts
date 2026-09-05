import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldPlayAdminOpsSound } from "@/lib/admin/admin-ops-sound-decision";
import { ADMIN_OPS_SOUND_FALLBACK_SOURCES } from "@/lib/admin/admin-ops-sound-event-key";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B6 support / notification control plane", () => {
  it("read-model + API + UI exist without new support/notification SSOT", () => {
    expect(existsSync(resolve(process.cwd(), "lib/admin/support-control-plane/load-support-control-plane.ts"))).toBe(
      true
    );
    expect(existsSync(resolve(process.cwd(), "app/api/admin/support-control-plane/route.ts"))).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), "components/admin/support/AdminSupportControlPlane.tsx"))
    ).toBe(true);

    const loader = read("lib/admin/support-control-plane/load-support-control-plane.ts");
    expect(loader).toContain("support_cases");
    expect(loader).toContain("OPEN");
    expect(loader).toContain("WAITING_ADMIN");
    expect(loader).toContain("ageLabelKo");
    expect(loader).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(loader).not.toMatch(/CREATE TABLE|support_v2|unified_ticket/i);

    const ui = read("components/admin/support/AdminSupportControlPlane.tsx");
    expect(ui).toContain('data-aro-ops-ux-002-b6="1"');
    expect(ui).toContain("action-required");
    expect(ui).toContain("Member");
    expect(ui).toContain("Owner");
    expect(ui).not.toMatch(/쪽지/);
  });

  it("mounts on canonical /admin/support (no support-v2)", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    expect(page).toContain("AdminSupportControlPlane");
    expect(page.indexOf("<AdminSupportControlPlane")).toBeLessThan(page.indexOf("<AdminPageHeader"));
    expect(page).toContain("ACTIONABLE");
    expect(page).toContain("waitingAgeLabel");
    expect(existsSync(resolve(process.cwd(), "app/admin/support-v2"))).toBe(false);
  });

  it("preserves Support ≠ Messenger and reply≠resolve contracts", () => {
    const svc = read("lib/support/support-case-service.ts");
    expect(svc).toContain('patch.status = "WAITING_USER"');
    expect(svc).toContain("adminReplySupportCase");
    expect(svc).toContain("adminUpdateSupportCaseStatus");
    expect(svc).toContain("closeAfter");
    expect(svc).toContain('case "ACTIONABLE"');
    const plane = read("components/admin/support/AdminSupportControlPlane.tsx");
    expect(plane).toContain("Support ≠ Messenger");
  });

  it("notification RT + deeplinks use existing sound authority", () => {
    expect(ADMIN_OPS_SOUND_FALLBACK_SOURCES).toContain("support_cases");
    expect(
      shouldPlayAdminOpsSound({
        eventType: "INSERT",
        sourceTable: "support_cases",
        newRow: { status: "OPEN" },
      })
    ).toBe(true);
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "support_cases",
        oldRow: { status: "WAITING_USER" },
        newRow: { status: "WAITING_ADMIN" },
      })
    ).toBe(true);
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "support_cases",
        oldRow: { status: "WAITING_ADMIN" },
        newRow: { status: "WAITING_USER" },
      })
    ).toBe(false);

    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain('table: "support_cases"');
    expect(provider).toContain("/admin/support/");
    expect(provider).toContain("markSupportCaseAlert");

    const ac = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ac).toContain("filter=ACTIONABLE#action-required");
  });
});
