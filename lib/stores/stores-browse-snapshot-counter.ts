/** SB1 stores browse snapshot counter keys */
export const STORES_BROWSE_SNAPSHOT_TABLE = "stores_browse_snapshots";
export const STORES_BROWSE_SNAPSHOT_RPC = "get_stores_browse_snapshot";
export const STORES_BROWSE_SNAPSHOT_DEFAULT_SCOPE = "default";
export const STORES_BROWSE_SNAPSHOT_BUNDLE_SCOPE = "bundle";
export const STORES_BROWSE_SNAPSHOT_FETCH_CAP = 120;

export type StoresBrowseSnapshotKeyParts = {
  primary_slug: string;
  sub_slug: string;
  region: string;
  city: string;
  district: string;
  geo_part: string;
  list_limit: number;
  ui_lang: string;
  list_scope: string;
  cursor_key: string;
};

export function storesBrowseSnapshotCacheKeyParts(input: {
  primary: string;
  sub: string;
  region: string;
  city: string;
  district: string;
  geoPart: string;
  limit: number;
  uiLang: string;
  cursor?: string;
  listScope?: string;
}): StoresBrowseSnapshotKeyParts {
  return {
    primary_slug: input.primary.trim().toLowerCase(),
    sub_slug: input.sub.trim().toLowerCase(),
    region: input.region.trim(),
    city: input.city.trim(),
    district: input.district.trim(),
    geo_part: input.geoPart.trim() || "g:none",
    list_limit: Math.max(1, Math.min(100, Math.floor(input.limit) || 60)),
    ui_lang: input.uiLang.trim() || "ko",
    list_scope: input.listScope?.trim() || STORES_BROWSE_SNAPSHOT_DEFAULT_SCOPE,
    cursor_key: input.cursor?.trim() ?? "",
  };
}

/** RPC bundle counter — geo/lang/district assemble stays in TS per request. */
export function storesBrowseSnapshotBundleKeyParts(
  primary: string,
  sub: string
): StoresBrowseSnapshotKeyParts {
  return storesBrowseSnapshotCacheKeyParts({
    primary,
    sub,
    region: "",
    city: "",
    district: "",
    geoPart: "g:none",
    limit: STORES_BROWSE_SNAPSHOT_FETCH_CAP,
    uiLang: "ko",
    listScope: STORES_BROWSE_SNAPSHOT_BUNDLE_SCOPE,
  });
}

export function storesBrowseSnapshotCounterTtlMs(): number {
  const raw = process.env.STORES_BROWSE_SNAPSHOT_TTL_MS?.trim();
  const n = raw ? Number(raw) : 8_000;
  if (!Number.isFinite(n) || n < 1_000) return 8_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}
