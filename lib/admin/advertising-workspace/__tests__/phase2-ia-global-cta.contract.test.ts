/**
 * PHASE 2 — Ads Control UX: sidebar-only global IA + mode header CTA policy.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { advertisingWorkspaceHeaderCtas } from "@/components/admin/ads/AdminAdvertisingWorkspace";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("PHASE 2 Admin Ads IA / global CTA normalization", () => {
  it("does not render duplicate 7-leaf AuthorityNav in Ads content surfaces", () => {
    expect(() =>
      read("components/admin/ads/AdminAdvertisingAuthorityNav.tsx")
    ).toThrow();
    const workspace = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    const placements = read("components/admin/ads/AdminAdsPlacementManagementView.tsx");
    const products = read("app/admin/advertising/products/page.tsx");
    const appsLegacy = read("components/admin/ads/AdminAdApplicationsPage.tsx");
    for (const src of [workspace, placements, products, appsLegacy]) {
      expect(src).not.toMatch(/AdminAdvertisingAuthorityNav/);
      expect(src).not.toMatch(/data-admin-advertising-authority-nav/);
    }
  });

  it("keeps local status/family filter hooks in Workspace (not global IA)", () => {
    const workspace = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(workspace).toContain('data-shell-status-tabs="1"');
    expect(workspace).toContain('data-shell-family-tabs="1"');
    expect(workspace).toContain("관리 ▼");
  });

  it("header CTA policy: register only on all; placements on all+operations", () => {
    expect(advertisingWorkspaceHeaderCtas("all")).toEqual({
      showRegister: true,
      showPlacementsLink: true,
    });
    expect(advertisingWorkspaceHeaderCtas("operations")).toEqual({
      showRegister: false,
      showPlacementsLink: true,
    });
    for (const mode of ["boosts", "applications", "history"] as const) {
      expect(advertisingWorkspaceHeaderCtas(mode)).toEqual({
        showRegister: false,
        showPlacementsLink: false,
      });
    }
  });

  it("sidebar still owns the exact 7 PUBLIC ads leaves", () => {
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain('path: "/admin/advertising"');
    expect(menu).toContain('path: "/admin/advertising/boosts"');
    expect(menu).toContain('path: "/admin/advertising/applications"');
    expect(menu).toContain('path: "/admin/advertising/operations"');
    expect(menu).toContain('path: "/admin/advertising/placements"');
    expect(menu).toContain('path: "/admin/advertising/products"');
    expect(menu).toContain('path: "/admin/advertising/history"');
  });
});
