import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminMenu } from "@/components/admin/admin-menu";
import { requireAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("A2-2 admin support IA / badge SSOT", () => {
  it("menu exposes Support Center + archive; store-inquiries not primary (ARO-OPS-UX-002-B7)", () => {
    // CUT J: Support is top-level workspace (not nested cp-support under Customer Platform).
    // B7: legacy /admin/store-inquiries route KEEP, primary nav HIDE.
    const support = requireAdminMenuByKey(adminMenu, "support");
    const paths = (support.children ?? []).flatMap(function walk(n): string[] {
      const own = n.path ? [n.path] : [];
      return [...own, ...(n.children ?? []).flatMap(walk)];
    });
    expect(paths).toContain("/admin/support");
    expect(paths).toContain("/admin/support/archive");
    expect(paths).not.toContain("/admin/store-inquiries");
    expect(paths).not.toContain("/admin/member-notes?kind=inquiry");
    expect(paths).not.toContain("/admin/member-notes?kind=inbox");
    expect(paths).not.toContain("/admin/platform-inquiries");
  });

  it("summary API and actionable badge authority exist", () => {
    expect(read("app/api/admin/support/summary/route.ts")).toContain("getAdminSupportSummary");
    const svc = read("lib/support/support-case-service.ts");
    expect(svc).toContain("getAdminSupportSummary");
    expect(svc).toContain('in("status", ["OPEN", "WAITING_ADMIN"])');
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).toContain("sumAdminQueueCountsForMenuKey(item.key, queueCategories)");
    const registry = read("lib/admin/admin-action-queue-registry.ts");
    expect(registry).toMatch(/key: "support_actionable"[\s\S]*?sidebarMenuKeys: \["cp-support-center"\]/);
    expect(registry).not.toContain('"cp-member-inquiry"');
  });

  it("AdminSupportPage wires assign and priority UI", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    expect(page).toContain('action: "assign"');
    expect(page).toContain('action: "priority"');
    expect(page).toContain("data-admin-support-assign-self");
    expect(page).toContain("data-admin-support-priority");
    expect(page).toContain("상담 종료");
    expect(page).toContain("INTERNAL_NOTE");
    expect(page).toContain('data-admin-support-console="3col"');
    expect(page).toContain("data-admin-support-queue");
    expect(page).toContain("data-admin-support-center");
    expect(page).toContain("data-admin-support-context");
    expect(page).toContain("data-admin-support-composer");
    // Console redesign (Owner-approved 2026-10-05): queue | conversation, info panel on toggle.
    expect(page).toContain("lg:grid-cols-[320px_minmax(0,1fr)]");
    expect(page).toContain("lg:grid-cols-[320px_minmax(0,1fr)_300px]");
  });

  it("legacy admin writers return 410", () => {
    expect(read("app/api/admin/member-notes/route.ts")).toContain("legacy_writer_disabled");
    expect(read("app/api/admin/member-notes/[threadId]/route.ts")).toContain(
      "legacy_writer_disabled"
    );
    expect(read("app/api/admin/platform-inquiries/[id]/route.ts")).toContain(
      "legacy_writer_disabled"
    );
  });

  it("action queue counts support_actionable not legacy Care/platform", () => {
    // R8: 고객지원 화면과 같은 탭 필터(applySupportCaseTabFilter "ACTIONABLE" = OPEN·WAITING_ADMIN)
    const q = read("lib/admin/admin-action-queue.ts");
    const types = read("lib/support/support-case-types.ts");
    expect(q).toContain("support_actionable");
    expect(q).toMatch(/applySupportCaseTabFilter\([^;]*"ACTIONABLE"\)/);
    expect(types).toContain('ACTIONABLE: ["OPEN", "WAITING_ADMIN"]');
    expect(q).toMatch(/member_inquiry_open: LEGACY_ZERO/);
    expect(q).toMatch(/platform_inquiry_open: LEGACY_ZERO/);
  });
});
