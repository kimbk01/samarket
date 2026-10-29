/**
 * ADC-04 — 배너(히어로·인라인·업종상단)도 매장 목록·스폰서드와 같은 배달 가능 기준으로 노출.
 *
 * 새 판정 함수 없음: 목록이 쓰는 origin(`resolveStoreListDeliveryOrigin`)과
 * 서비스 지역 SSOT(`resolveDiscoveryOorWithServiceAreaAuthority` → `evaluateDeliveryServiceArea` +
 * `resolveListDistanceOutOfRange`)를 그대로 쓴다. 목록에서 제외되는 매장(OOR)의 배너만 뺀다.
 * - 게스트·GPS·주소 없음: 목록도 제외하지 않으므로 배너도 제외 없음.
 * - 매장 없는 배너(플랫폼·퍼스트파티): 대상 아님.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDeliveryServiceabilityRuntimeContext } from "@/lib/delivery/load-delivery-serviceability-runtime";
import { memberDeliveryServiceabilityActive } from "@/lib/delivery/delivery-list-oor-policy";
import { resolveDiscoveryOorWithServiceAreaAuthority } from "@/lib/stores/discovery/resolve-discovery-oor-with-service-area";
import type { StoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";

export type BannerViewerOrigin = Pick<
  StoreListDeliveryOrigin,
  "source" | "lat" | "lng" | "canonicalLguId"
>;

/**
 * `eligibleStoreIds`(ADS-06 자격) 중 이 사용자 기준 배달 불가(OOR) 매장을 뺀 집합.
 * 매장 좌표 조회 실패 → 매장 연결 배너 미노출(빈 집합, ADS-06 과 같은 fail-closed).
 */
export async function excludeViewerOutOfRangeBannerStores(
  sb: SupabaseClient,
  eligibleStoreIds: ReadonlySet<string>,
  origin: BannerViewerOrigin | null | undefined,
  /** v4 PERF-14 — 자격 조회에서 이미 읽은 매장 좌표 행 (있으면 stores 재조회 없음) */
  prefetchedRows?: ReadonlyArray<{ id: string; lat?: unknown; lng?: unknown; delivery_radius_km?: unknown }>
): Promise<Set<string>> {
  const ids = [...eligibleStoreIds];
  if (!ids.length || !origin) return new Set(ids);
  if (!memberDeliveryServiceabilityActive(origin.source)) return new Set(ids);
  if (origin.lat == null || origin.lng == null) return new Set(ids);

  const ctx = await loadDeliveryServiceabilityRuntimeContext(sb);
  if (!ctx.policy.enabled) return new Set(ids);

  let rows: Array<{
    id: string;
    lat?: unknown;
    lng?: unknown;
    delivery_radius_km?: unknown;
  }>;
  if (prefetchedRows) {
    const wanted = new Set(ids);
    rows = prefetchedRows.filter((r) => wanted.has(String(r.id)));
  } else {
    const { data, error } = await sb
      .from("stores")
      .select("id, lat, lng, delivery_radius_km")
      .in("id", ids);
    if (error) {
      console.error("[excludeViewerOutOfRangeBannerStores]", error.message);
      return new Set();
    }
    rows = (data ?? []) as typeof rows;
  }

  const { outOfRangeById } = await resolveDiscoveryOorWithServiceAreaAuthority(sb, {
    rows: rows.map((r) => ({ ...r, id: String(r.id) })),
    originLat: origin.lat,
    originLng: origin.lng,
    originSource: origin.source,
    memberLguId: origin.canonicalLguId,
    distanceAxisEnabled: true,
    shadowOutOfRangeById: new Map(),
  });

  const out = new Set<string>();
  for (const r of rows) {
    const id = String(r.id);
    if (outOfRangeById.get(id) !== true) out.add(id);
  }
  return out;
}
