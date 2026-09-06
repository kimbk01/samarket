import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOwnerAdsCreatePath,
  isOwnerBottomNavHiddenPath,
} from "@/lib/business/owner-bottom-nav-eligibility";
import { resolveOwnerStackBackHref } from "@/lib/business/owner-stack-back-href";
import { OWNER_STORE_PREVIEW_HREF } from "@/lib/business/owner-store-preview-bridge";
import { acquireOwnerOverlayBodyLock, getOwnerOverlayBodyLockDepth } from "@/lib/business/owner-overlay-body-lock";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("owner selective shell restore contracts", () => {
  it("hides BottomNav on ads CREATE and product composer; keeps on orders list", () => {
    expect(isOwnerAdsCreatePath("/stores/owner/ads/new/banner")).toBe(true);
    expect(isOwnerBottomNavHiddenPath("/stores/owner/ads/new/banner")).toBe(true);
    expect(isOwnerBottomNavHiddenPath("/stores/owner/products/new")).toBe(true);
    expect(isOwnerBottomNavHiddenPath("/stores/owner/orders")).toBe(false);
    expect(isOwnerBottomNavHiddenPath("/stores/owner")).toBe(false);
  });

  it("back parent prefers list over hub for product/ads", () => {
    expect(resolveOwnerStackBackHref("/stores/owner/products/new", "s1")).toContain("/products");
    expect(resolveOwnerStackBackHref("/stores/owner/ads/new/banner", "s1")).toContain("/ads");
    expect(resolveOwnerStackBackHref("/stores/owner/settlements", "s1")).toContain("/finance");
  });

  it("public_store registry uses owner-action preview href", () => {
    const reg = readRepo("lib/business/owner-nav-registry.ts");
    expect(reg).toContain("OWNER_STORE_PREVIEW_HREF");
    expect(OWNER_STORE_PREVIEW_HREF).toBe("owner-action:store-preview");
    expect(reg).not.toMatch(/id:\s*"public_store"[\s\S]{0,200}\/stores\/\$\{/);
  });

  it("OwnerStorePreviewModal exists and shell registers bridge", () => {
    const modal = readRepo("components/business/owner/OwnerStorePreviewModal.tsx");
    expect(modal).toContain("data-owner-store-preview");
    expect(modal).toContain("acquireOwnerOverlayBodyLock");
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("registerOwnerStorePreviewOpen");
    expect(shell).toContain("OwnerStorePreviewModal");
  });

  it("overlay body lock is refcounted", () => {
    expect(getOwnerOverlayBodyLockDepth()).toBe(0);
    const release = acquireOwnerOverlayBodyLock("generic");
    expect(getOwnerOverlayBodyLockDepth()).toBe(1);
    release();
    expect(getOwnerOverlayBodyLockDepth()).toBe(0);
  });

  it("notifications pages do not mount OwnerSubpageDetailHeader (no dual chrome)", () => {
    const n = readRepo("app/(main)/stores/owner/notifications/page.tsx");
    const s = readRepo("app/(main)/stores/owner/notification-settings/page.tsx");
    expect(n).not.toContain("OwnerSubpageDetailHeader");
    expect(s).not.toContain("OwnerSubpageDetailHeader");
  });
});
