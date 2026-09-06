"use client";

import type { ReactNode } from "react";
import { OwnerMobileAdminHeader } from "@/components/business/owner/OwnerMobileAdminHeader";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";
import type { OwnerStoreOpsMeta } from "@/lib/stores/owner-store-ops-snapshot";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

/**
 * ONE Owner chrome mount API for BusinessAdminShell.
 * Page classes map to modes; geometry tokens stay on shared header classes (h-14 / safe-top).
 */
export type OwnerChromeHeaderMode = "hub" | "page" | "composer" | "empty_hub";

export type OwnerChromeHeaderProps = {
  mode: OwnerChromeHeaderMode;
  storeName: string;
  storeId?: string;
  storeSlug?: string | null;
  storeOps?: OwnerStoreOpsMeta;
  urgentAlertCount?: number;
  stores?: StoreRow[] | null;
  pageTitle?: string | null;
  backHref?: string;
  backIntercept?: () => boolean;
  backPreferHistory?: boolean;
  backAriaLabel?: string;
  exitHref?: string;
  opsMenuOpen?: boolean;
  rightSlot?: ReactNode;
  hubSubtitle?: string;
  hideTitle?: boolean;
};

export function OwnerChromeHeader(props: OwnerChromeHeaderProps) {
  if (props.mode === "composer" || props.mode === "empty_hub") {
    return (
      <StoresOwnerStackHeader
        variant={props.mode === "empty_hub" ? "hub" : "admin"}
        backHref={props.backHref}
        backPreferHistory={props.backPreferHistory ?? true}
        backIntercept={props.backIntercept}
        backAriaLabel={props.backAriaLabel}
        shopName={props.storeName}
        hubSubtitle={props.hubSubtitle}
        pageTitle={props.pageTitle}
        rightSlot={props.rightSlot ?? null}
        hideTitle={props.hideTitle}
      />
    );
  }

  if (!props.storeId || !props.storeOps) {
    return null;
  }

  return (
    <OwnerMobileAdminHeader
      variant={props.mode === "hub" ? "hub" : "page"}
      storeName={props.storeName}
      storeId={props.storeId}
      storeSlug={props.storeSlug}
      storeOps={props.storeOps}
      urgentAlertCount={props.urgentAlertCount ?? 0}
      stores={props.stores}
      pageTitle={props.pageTitle}
      backHref={props.backHref}
      backIntercept={props.backIntercept}
      exitHref={props.exitHref}
      opsMenuOpen={props.opsMenuOpen}
    />
  );
}
