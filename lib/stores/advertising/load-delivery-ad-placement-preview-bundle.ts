/**
 * PRODUCT CUT 2 — One-shot placement preview payload (store + HOME/BROWSE policy).
 * No full organic feed fetch. Fail closed on missing store for Store Sponsored.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResolvedCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-db";
import { resolveHomePaidPlacementPolicySummary } from "@/lib/stores/advertising/delivery-ad-home-placement-policy";
import { listHomeShelfProductDbRows } from "@/lib/stores/product/stores-home-shelf-product-db";
import { resolveStoresBrowseScopeCustomerMeta } from "@/lib/stores/product/stores-browse-scope-customer-meta";
import {
  loadDeliveryAdPlacementPreviewStore,
  type DeliveryAdPlacementPreviewStoreLoad,
} from "@/lib/stores/advertising/load-delivery-ad-placement-preview-store";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

export type DeliveryAdPlacementPreviewTaxonomy = {
  primarySlug: string | null;
  primaryLabel: string | null;
  subSlug: string | null;
  subLabel: string | null;
};

export type DeliveryAdPlacementPreviewSurfacePolicy = {
  enabled: boolean;
  intervalEveryN: number | null;
  maxInsertion: number | null;
};

export type DeliveryAdPlacementPreviewPayload = {
  store: StoreHomeFeedItem | null;
  storeLoadError: boolean;
  eligibilityWarning: boolean;
  storeName: string | null;
  taxonomy: DeliveryAdPlacementPreviewTaxonomy;
  home: DeliveryAdPlacementPreviewSurfacePolicy;
  browse: DeliveryAdPlacementPreviewSurfacePolicy | null;
};

async function loadHomeSurfacePolicy(
  sb: SupabaseClient
): Promise<DeliveryAdPlacementPreviewSurfacePolicy> {
  try {
    const [{ rows }, shelfRows] = await Promise.all([
      loadResolvedCompositionPolicy(sb, "home"),
      listHomeShelfProductDbRows(sb).catch(() => []),
    ]);
    const rest = shelfRows.find((r) => r.shelf_id === "rest_stores" || r.slot === "slot6RestStores");
    const summary = resolveHomePaidPlacementPolicySummary({
      compositionRows: rows,
      restShelfAdIntegration: rest?.ad_integration ?? null,
    });
    return {
      enabled: summary.enabled,
      intervalEveryN: summary.intervalEveryN,
      maxInsertion: summary.max,
    };
  } catch {
    return { enabled: false, intervalEveryN: null, maxInsertion: null };
  }
}

/**
 * Load preview bundle once per campaign/detail request.
 * Pass optional preloaded store result to avoid double store fetch.
 */
export async function loadDeliveryAdPlacementPreviewBundle(
  sb: SupabaseClient,
  input: {
    storeId: string;
    locale?: "ko" | "en";
    storeLoad?: DeliveryAdPlacementPreviewStoreLoad;
  }
): Promise<DeliveryAdPlacementPreviewPayload> {
  const locale = input.locale ?? "ko";
  const storeLoad =
    input.storeLoad ??
    (await loadDeliveryAdPlacementPreviewStore(sb, input.storeId, locale));

  const store = storeLoad.ok ? storeLoad.store : null;
  const taxonomy: DeliveryAdPlacementPreviewTaxonomy = storeLoad.ok
    ? { ...storeLoad.taxonomy }
    : { primarySlug: null, primaryLabel: null, subSlug: null, subLabel: null };

  const home = await loadHomeSurfacePolicy(sb);

  let browse: DeliveryAdPlacementPreviewSurfacePolicy | null = null;
  if (taxonomy.primarySlug) {
    try {
      const meta = await resolveStoresBrowseScopeCustomerMeta(
        sb,
        taxonomy.primarySlug,
        taxonomy.subSlug
      );
      browse = {
        enabled: meta.adEnabled === true,
        intervalEveryN: meta.intervalEveryN,
        maxInsertion: meta.maxInsertion,
      };
      if (!taxonomy.primaryLabel && meta.displayTitleKo) {
        taxonomy.primaryLabel = meta.displayTitleKo;
      }
    } catch {
      browse = { enabled: false, intervalEveryN: null, maxInsertion: null };
    }
  }

  return {
    store,
    storeLoadError: !storeLoad.ok,
    eligibilityWarning: storeLoad.ok ? storeLoad.eligibilityWarning : false,
    storeName: store?.nameKo ?? null,
    taxonomy,
    home,
    browse,
  };
}

export function surfacePolicyForInventory(
  payload: DeliveryAdPlacementPreviewPayload,
  inventoryKey: string
): DeliveryAdPlacementPreviewSurfacePolicy {
  if (inventoryKey === "STORES_HOME_FEED") return payload.home;
  if (inventoryKey === "STORES_CATEGORY_FEED") {
    return (
      payload.browse ?? {
        enabled: false,
        intervalEveryN: null,
        maxInsertion: null,
      }
    );
  }
  // Banner inventories — no list insertion gate; preview always shows placement shell.
  return { enabled: true, intervalEveryN: null, maxInsertion: null };
}
