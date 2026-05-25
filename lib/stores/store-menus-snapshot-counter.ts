/**
 * Store menus snapshot counter table keys + TTL.
 */
export const STORE_MENUS_SNAPSHOT_TABLE = "store_menus_snapshots";

export const STORE_MENUS_SNAPSHOT_MENU_VERSION = "default";

/** Nil UUID — anonymous viewer snapshot key */
export const STORE_MENUS_SNAPSHOT_ANON_VIEWER_ID = "00000000-0000-0000-0000-000000000000";

export function storeMenusSnapshotCounterTtlMs(): number {
  const raw = Number(process.env.STORE_MENUS_SNAPSHOT_COUNTER_TTL_MS ?? 5000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

export function storeMenusSnapshotCacheKeyParts(
  storeSlug: string,
  viewerUserId: string | null,
  menuVersion = STORE_MENUS_SNAPSHOT_MENU_VERSION
): {
  store_slug: string;
  viewer_user_id: string;
  menu_version: string;
} {
  const uid = viewerUserId?.trim() || STORE_MENUS_SNAPSHOT_ANON_VIEWER_ID;
  return {
    store_slug: storeSlug.trim().toLowerCase(),
    viewer_user_id: uid,
    menu_version: menuVersion.trim() || STORE_MENUS_SNAPSHOT_MENU_VERSION,
  };
}
