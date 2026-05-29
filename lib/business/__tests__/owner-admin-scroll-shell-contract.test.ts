import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOwnerBasicInfoPath, isOwnerInquiriesPath, isOwnerStoreFormBottomNavHiddenPath, isOwnerStoreProfilePath } from "@/lib/business/owner-basic-info-guard";
import {
  isOwnerStoreProductComposerPath,
  resolveOwnerStackScrollHostPath,
} from "@/lib/business/owner-stack-scroll-host-path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("owner admin scroll shell contract", () => {
  it("basic-info is a stack scroll host (same as hub/profile — not excluded)", () => {
    const path = "/stores/owner/basic-info";
    expect(isOwnerBasicInfoPath(path)).toBe(true);
    expect(resolveOwnerStackScrollHostPath(path)).toBe(true);
  });

  it("hub and profile remain scroll hosts", () => {
    expect(resolveOwnerStackScrollHostPath("/stores/owner")).toBe(true);
    expect(resolveOwnerStackScrollHostPath("/stores/owner/profile")).toBe(true);
  });

  it("product composer stays excluded from scroll host lock", () => {
    expect(
      resolveOwnerStackScrollHostPath("/stores/owner/products/new")
    ).toBe(false);
    expect(isOwnerStoreProductComposerPath("/stores/owner/products/new")).toBe(
      true
    );
  });

  it("StoreBusinessGuard ok shell uses flex min-h-0 (not min-h-screen)", () => {
    const guard = readRepo("components/business/StoreBusinessGuard.tsx");
    expect(guard).toContain("OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS");
    expect(guard).toMatch(
      /return\s*<div className=\{OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS\}>\{children\}<\/div>/
    );
    expect(guard).not.toMatch(
      /return\s*<div className="min-h-screen">\{children\}<\/div>/
    );
  });

  it("BusinessAdminShell does not exclude basic-info from scroll host path", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("resolveOwnerStackScrollHostPath");
    expect(shell).not.toMatch(
      /ownerStackScrollHostPath[\s\S]{0,120}!isOwnerBasicInfoRoute/
    );
  });

  it("basic-info and profile hide owner mobile bottom nav separately", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toMatch(/!isOwnerFormBottomNavHiddenRoute\s*\?/);
    expect(isOwnerBasicInfoPath("/stores/owner/basic-info")).toBe(true);
    expect(isOwnerStoreProfilePath("/stores/owner/profile")).toBe(true);
  });

  it("inquiries hides owner mobile bottom nav", () => {
    expect(isOwnerInquiriesPath("/stores/owner/inquiries")).toBe(true);
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/inquiries")).toBe(true);
  });

  it("basic-info and profile keep save/cancel footer always visible", () => {
    for (const rel of [
      "components/business/OwnerStoreBasicInfoForm.tsx",
      "components/business/OwnerStoreProfileForm.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("owner-admin-footer-actions");
      expect(src).toContain("OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS");
      expect(src).not.toMatch(/\{isDirty\s*\?\s*\n?\s*<BodyPortal>/);
      expect(src).toMatch(/disabled=\{!isDirty \|\|/);
    }
  });

  it("owner admin footer actions use shared apply-style divide-x bar", () => {
    const shared = readRepo("lib/business/owner-admin-footer-actions.ts");
    expect(shared).toContain("OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS");
    expect(shared).toContain("OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS");
    expect(shared).toContain("divide-x divide-sam-border");
    expect(shared).toContain("bg-signature text-white");

    for (const rel of [
      "components/business/OwnerStoreProfileForm.tsx",
      "components/business/OwnerStoreBasicInfoForm.tsx",
      "components/business/BusinessApplyForm.tsx",
      "components/business/owner/OwnerMenuCategoriesClient.tsx",
      "components/business/owner/OwnerProductForm.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("owner-admin-footer-actions");
      expect(src).toContain("OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS");
      expect(src).not.toMatch(/Biz\.btnPrimary/);
    }
  });
});
