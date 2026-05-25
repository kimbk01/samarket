/**
 * SB1 stores browse — parse unified RPC payload into build bundle.
 */
import type { BrowseTaxonomySlice } from "@/lib/stores/stores-browse-taxonomy-cache";
import {
  BROWSE_STORE_ROW_SELECTED_COLUMNS,
  type BannerMini,
  type ProductMini,
  type StoresBrowseDbBundle,
  type StoresBrowseResponseBody,
} from "@/lib/stores/stores-browse-build";
import type { StoresBrowseLegacyEarlyBody } from "@/lib/stores/fetch-stores-browse-legacy";

export type StoresBrowseSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  unknown_primary?: boolean;
  unknown_topic?: boolean;
  taxonomy?: Record<string, unknown>;
  store_rows?: unknown[];
  products?: unknown[];
  banners?: unknown[];
  snapshot_version?: number;
  updated_at?: string;
};

function parseTopicList(raw: unknown): BrowseTaxonomySlice["topicList"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t) => {
      const o = t as Record<string, unknown>;
      return {
        id: String(o.id ?? ""),
        slug: String(o.slug ?? ""),
        name: String(o.name ?? ""),
      };
    })
    .filter((t) => t.id && t.slug);
}

export function parseStoresBrowseSnapshotRpcData(
  data: unknown
): StoresBrowseSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as StoresBrowseSnapshotPayloadJson;
}

export function taxonomySliceFromRpcPayload(
  payload: StoresBrowseSnapshotPayloadJson,
  primary: string,
  sub: string,
  wantsAllSubs: boolean
): BrowseTaxonomySlice {
  const tax = payload.taxonomy ?? {};
  const selected = tax.selectedTopicMeta as { slug?: string; name?: string } | null | undefined;
  return {
    categoryId: String(tax.categoryId ?? ""),
    categorySlug: String(tax.categorySlug ?? primary).trim().toLowerCase(),
    categoryName: String(tax.categoryName ?? primary),
    primaryAliases: Array.isArray(tax.primaryAliases)
      ? (tax.primaryAliases as unknown[]).map((s) => String(s)).filter(Boolean)
      : [primary],
    topicList: parseTopicList(tax.topicList),
    resolvedTopicId: tax.resolvedTopicId ? String(tax.resolvedTopicId) : null,
    selectedTopicMeta:
      selected?.slug && selected?.name ?
        { slug: String(selected.slug), name: String(selected.name) }
      : null,
    unknownPrimary: payload.unknown_primary === true || tax.unknownPrimary === true,
    unknownTopic: payload.unknown_topic === true || tax.unknownTopic === true,
  };
}

export function earlyBrowseBodyFromRpcPayload(
  payload: StoresBrowseSnapshotPayloadJson,
  primary: string,
  sub: string,
  wantsAllSubs: boolean
): StoresBrowseLegacyEarlyBody | null {
  if (payload.unknown_primary) {
    return {
      ok: true,
      stores: [],
      meta: {
        source: "supabase",
        primary,
        sub,
        all_topics: wantsAllSubs,
        reason: "unknown_primary_slug",
      },
    };
  }
  if (payload.unknown_topic) {
    return {
      ok: true,
      stores: [],
      meta: {
        source: "supabase",
        primary,
        sub,
        all_topics: false,
        reason: "unknown_topic_slug",
      },
    };
  }
  return null;
}

export function storesBrowseDbBundleFromRpcPayload(
  payload: StoresBrowseSnapshotPayloadJson,
  primary: string,
  sub: string,
  wantsAllSubs: boolean,
  rpcMs: number
): StoresBrowseDbBundle {
  return {
    taxonomySlice: taxonomySliceFromRpcPayload(payload, primary, sub, wantsAllSubs),
    storeRowsRaw: Array.isArray(payload.store_rows) ? payload.store_rows : [],
    products: (Array.isArray(payload.products) ? payload.products : []) as ProductMini[],
    banners: (Array.isArray(payload.banners) ? payload.banners : []) as BannerMini[],
    taxonomyCacheHit: false,
    baseQueryMs: rpcMs,
    categoryQueryMs: 0,
    productPreviewQueryMs: 0,
    distanceSortMs: 0,
    queryCount: 1,
  };
}

export function isStoresBrowseResponseBody(body: unknown): body is StoresBrowseResponseBody {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return o.ok === true && Array.isArray(o.stores);
}
