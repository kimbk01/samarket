/**
 * Event-driven stores browse snapshot refresh (SB1).
 *
 * 5-C BR-01 — 갱신은 요청한 (1차, 2차) 키 그대로 수행한다. 이전에는 항상 (1차, "all") 만 갱신해
 * 2차 스냅샷 행이 최초 생성 값으로 고정되었다(2차 업종 카드 메뉴 사진 → 「더보기」).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresBrowseSnapshotPayloadJson } from "@/lib/stores/stores-browse-snapshot-assemble";
import { refreshStoresBrowseSnapshotFromRpc } from "@/lib/stores/stores-browse-snapshot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const refreshInflight = new Map<string, Promise<StoresBrowseSnapshotPayloadJson | null>>();

function normalizeSnapshotRefreshKey(
  primarySlug: string,
  subSlug?: string | null
): { primary: string; sub: string } | null {
  const primary = primarySlug.trim().toLowerCase();
  if (!primary) return null;
  const sub = subSlug?.trim().toLowerCase() || "all";
  return { primary, sub };
}

/** 테스트·진단 — 진행 중 갱신 키 (`primary:sub`). */
export function storesBrowseSnapshotRefreshInflightKeys(): string[] {
  return [...refreshInflight.keys()];
}

/**
 * (1차, 2차) 스냅샷 행을 원본 RPC 로 다시 읽어 저장한다. 같은 키 진행 중 갱신이 있으면 합류(원본 RPC 1회).
 * 반환: 새 payload (실패·ok:false 면 null).
 */
export function refreshStoresBrowseSnapshotKey(
  sb: SupabaseClient<any> | null,
  primarySlug: string,
  subSlug?: string | null
): Promise<StoresBrowseSnapshotPayloadJson | null> {
  const key = normalizeSnapshotRefreshKey(primarySlug, subSlug);
  if (!key) return Promise.resolve(null);
  const flightKey = `${key.primary}:${key.sub}`;
  const existing = refreshInflight.get(flightKey);
  if (existing) return existing;

  const flight = (async () => {
    const client = sb ?? (tryGetSupabaseForStores() as SupabaseClient<any> | null);
    if (!client) return null;
    return refreshStoresBrowseSnapshotFromRpc(client, key.primary, key.sub);
  })().finally(() => {
    if (refreshInflight.get(flightKey) === flight) refreshInflight.delete(flightKey);
  });

  refreshInflight.set(flightKey, flight);
  return flight;
}

export function scheduleStoresBrowseSnapshotRefresh(primarySlug: string, subSlug?: string | null): void {
  void refreshStoresBrowseSnapshotKey(null, primarySlug, subSlug).catch(() => null);
}
