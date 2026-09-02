"use client";

import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { OwnerSupportContextBridge } from "@/components/support/OwnerSupportContextBridge";
import type { OwnerSupportCategory } from "@/lib/support/support-context";

/**
 * Owner route wrapper — reads storeId from owner admin URL query (explicit param, not pathname).
 */
export function OwnerStoreSupportShell({
  category,
  sourceSurface,
  referenceType,
  referenceId,
  requireStoreId = true,
  children,
}: {
  category: OwnerSupportCategory;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  /** When true, FAB only shows after storeId query is present. */
  requireStoreId?: boolean;
  children: React.ReactNode;
}) {
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  const enabled = requireStoreId ? Boolean(storeId) : true;

  return (
    <OwnerSupportContextBridge
      enabled={enabled}
      category={category}
      sourceSurface={sourceSurface}
      storeId={storeId || undefined}
      referenceType={referenceType}
      referenceId={referenceId}
    >
      {children}
    </OwnerSupportContextBridge>
  );
}
