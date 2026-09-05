/**
 * ARO-OPS-UX-002-B8 — shared Admin UI / geometry contract (static).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveActiveWorkspace, resolveAdminBreadcrumb } from "@/lib/admin/admin-workspace-routing";

const ROOT = path.resolve(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ARO-OPS-UX-002-B8 shared UI / geometry", () => {
  it("B8-05/06 breadcrumb has stable data selector and orders resolve under delivery", () => {
    const crumbSrc = read("components/admin/shell/AdminShellBreadcrumb.tsx");
    expect(crumbSrc).toContain('data-admin-breadcrumb="1"');
    const ws = resolveActiveWorkspace("/admin/stores/orders", "master");
    expect(ws.id).toBe("delivery");
    const crumbs = resolveAdminBreadcrumb("/admin/stores/orders", ws);
    expect(crumbs[0]?.key).toBe("delivery");
    expect(crumbs.some((c) => c.key === "delivery-orders-list" || c.path === "/admin/stores/orders")).toBe(
      true
    );
  });

  it("B8-01/02/15 shell owns header chrome and main does not own X-scroll", () => {
    const shell = read("components/admin/shell/AdminPlatformShell.tsx");
    expect(shell).toContain("admin-platform-shell__header");
    expect(shell).toContain("data-admin-page-chrome");
    expect(shell).toContain("data-admin-main-content");
    expect(shell).toContain("overflow-x-hidden");
    expect(shell).toContain("z-[45]");
  });

  it("B8-07 System hub labels clarify purpose without IA route change", () => {
    const catalog = read("lib/i18n/catalog/admin.ts");
    expect(catalog).toContain('admin_menu_customer_platform: "시스템 허브"');
    expect(catalog).toContain('admin_menu_cp_dashboard: "시스템 개요"');
    expect(catalog).toContain('admin_menu_customer_platform: "System hub"');
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain('path: "/admin/customer-platform"');
    expect(menu).toContain('key: "system"');
  });

  it("B8 shared CTA / tone / CP chrome primitives exist", () => {
    expect(read("components/admin/ui/AdminActionButton.tsx")).toContain("data-admin-action");
    expect(read("components/admin/ui/AdminToneBadge.tsx")).toContain("data-admin-tone");
    expect(read("components/admin/ui/AdminControlPlaneChrome.tsx")).toContain(
      "AdminControlPlaneSection"
    );
  });

  it("B8 Control Planes consume shared chrome (parity wire)", () => {
    for (const rel of [
      "components/admin/finance/AdminFinanceControlPlane.tsx",
      "components/admin/ads/AdminAdsExposureControlPlane.tsx",
      "components/admin/support/AdminSupportControlPlane.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("AdminControlPlaneSection");
      expect(src).toContain("AdminUnavailableChip");
      expect(src).toContain("AdminActionButton");
      expect(src).toContain("sam-text-page-title");
    }
  });
});
