import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";
import { dbStoreToBusinessProfile, type StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import {
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
  type MeStoresListResult,
} from "@/lib/me/fetch-me-stores-deduped";
import { peekOwnerHubDashboardOrdersCache } from "@/lib/stores/owner-hub-dashboard-orders-cache";

export type OwnerHubPageLoadState =
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | {
      kind: "remote";
      row: StoreRow;
      profile: BusinessProfile;
      products: BusinessProduct[];
      dashboard: OwnerHubDashboardPack | null;
    };

function dashboardPackFromPeek(storeId: string): OwnerHubDashboardPack | null {
  const peek = peekOwnerHubDashboardOrdersCache(storeId);
  if (!peek) return null;
  return { orders: peek.orders, meta: peek.meta };
}

export function buildOwnerHubLoadStateFromStoreRows(
  stores: StoreRow[],
  preferredStoreId: string
): OwnerHubPageLoadState {
  if (stores.length === 0) return { kind: "empty" };
  const preferred = preferredStoreId.trim();
  const byPreferred = preferred ? stores.find((s) => s.id === preferred) : undefined;
  const row = byPreferred ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
  const profile = dbStoreToBusinessProfile(row);
  return {
    kind: "remote",
    row,
    profile: { ...profile, productCount: 0 },
    products: [],
    dashboard: dashboardPackFromPeek(row.id),
  };
}

export function buildOwnerHubLoadStateFromMeStoresPeek(
  preferredStoreId: string
): OwnerHubPageLoadState | null {
  const peek = peekMeStoresListClientCache();
  if (!peek || peek.status !== 200) return null;
  const stores = parseStoreRowsFromMeStoresJson(peek.json);
  if (!stores?.length) return null;
  return buildOwnerHubLoadStateFromStoreRows(stores, preferredStoreId);
}

export function buildOwnerHubLoadStateFromMeStoresResult(
  preferredStoreId: string,
  result: MeStoresListResult
): OwnerHubPageLoadState | null {
  if (result.status === 401) return { kind: "unauth" };
  if (result.status === 503) return { kind: "config" };
  const json = result.json as { ok?: boolean; error?: string };
  if (!json?.ok) {
    return {
      kind: "error",
      message: typeof json?.error === "string" ? json.error : "load_failed",
    };
  }
  const stores = parseStoreRowsFromMeStoresJson(result.json);
  if (!stores) return { kind: "error", message: "load_failed" };
  return buildOwnerHubLoadStateFromStoreRows(stores, preferredStoreId);
}
