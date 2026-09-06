/**
 * Owner BottomNav eligibility SSOT — CREATE / save EDIT hide nav so CTAs stay reachable.
 * Geometry tokens remain in `owner-shell-geometry.ts` + `owner-compact-shell.css`.
 */

import { isOwnerStoreFormBottomNavHiddenPath } from "@/lib/business/owner-basic-info-guard";

function normalizeOwnerPath(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") || "";
}

/** Ads CREATE composers — BottomNav must not cover Register/Save. */
export function isOwnerAdsCreatePath(pathname: string): boolean {
  const p = normalizeOwnerPath(pathname);
  return (
    p === "/stores/owner/ads/new/banner" ||
    p === "/stores/owner/ads/new/store-sponsored" ||
    p === "/stores/owner/ads/new/platform-popup" ||
    p === "/my/business/ads/new/banner" ||
    p === "/my/business/ads/new/store-sponsored" ||
    p === "/my/business/ads/new/platform-popup"
  );
}

export function isOwnerApplyPath(pathname: string): boolean {
  const p = normalizeOwnerPath(pathname);
  return p === "/stores/owner/apply" || p === "/my/business/apply";
}

/**
 * Single eligibility gate for `OwnerMobileBottomNav` mount.
 * Hide on: basic-info, profile, product CREATE/EDIT, ads CREATE, apply.
 * Keep on: ROOT hub, primary LIST / WORK_QUEUE (orders, care, products list).
 */
export function isOwnerBottomNavHiddenPath(pathname: string): boolean {
  return (
    isOwnerStoreFormBottomNavHiddenPath(pathname) ||
    isOwnerAdsCreatePath(pathname) ||
    isOwnerApplyPath(pathname)
  );
}
