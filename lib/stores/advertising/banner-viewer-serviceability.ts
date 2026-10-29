/**
 * ADC-04 — 배너(히어로·인라인·업종상단)도 매장 목록·스폰서드와 같은 배달 가능 기준으로 노출.
 *
 * 새 판정 함수 없음: 목록이 쓰는 origin(`resolveStoreListDeliveryOrigin`)과
 * 서비스 지역 SSOT(`resolveDiscoveryOorWithServiceAreaAuthority` → `evaluateDeliveryServiceArea` +
 * `resolveListDistanceOutOfRange`)를 그대로 쓴다. 목록에서 제외되는 매장(OOR)의 배너만 뺀다.
 * - 게스트·GPS: 목록도 제외하지 않으므로 배너도 제외 없음 (배달 화면은 로그인 유도).
 * - 주소 없는 회원: 목록과 같이 실매장 배너 제외, 샘플 매장 배너는 유지.
 * 제외 판정 = 목록과 같은 `shouldExcludeStoreFromMemberDeliveryList`.
 * - 매장 없는 배너(플랫폼·퍼스트파티): 대상 아님.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDeliveryServiceabilityRuntimeContext } from "@/lib/delivery/load-delivery-serviceability-runtime";
import {
  memberDeliveryServiceabilityActive,
  shouldExcludeStoreFromMemberDeliveryList,
} from "@/lib/delivery/delivery-list-oor-policy";
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
  origin: BannerViewerOrigin | null | undefined
): Promise<Set<string>> {
  const ids = [...eligibleStoreIds];
  if (!ids.length || !origin) return new Set(ids);
  const memberNoAddress = origin.source === "member_no_address";
  if (!memberNoAddress && !memberDeliveryServiceabilityActive(origin.source)) return new Set(ids);
  if (!memberNoAddress && (origin.lat == null || origin.lng == null)) return new Set(ids);

  const ctx = memberNoAddress ? null : await loadDeliveryServiceabilityRuntimeContext(sb);
  if (ctx && !ctx.policy.enabled) return new Set(ids);

  const { data, error } = await sb
    .from("stores")
    .select("id, lat, lng, delivery_radius_km, store_kind")
    .in("id", ids);
  if (error) {
    console.error("[excludeViewerOutOfRangeBannerStores]", error.message);
    return new Set();
  }
  const rows = (data ?? []) as Array<{
    id: string;
    lat?: unknown;
    lng?: unknown;
    delivery_radius_km?: unknown;
    store_kind?: unknown;
  }>;

  const outOfRangeById = memberNoAddress
    ? new Map<string, boolean>()
    : (
        await resolveDiscoveryOorWithServiceAreaAuthority(sb, {
          rows: rows.map((r) => ({ ...r, id: String(r.id) })),
          originLat: origin.lat,
          originLng: origin.lng,
          originSource: origin.source,
          memberLguId: origin.canonicalLguId,
          distanceAxisEnabled: true,
          shadowOutOfRangeById: new Map(),
        })
      ).outOfRangeById;

  const out = new Set<string>();
  for (const r of rows) {
    const id = String(r.id);
    const excluded = shouldExcludeStoreFromMemberDeliveryList({
      originSource: origin.source,
      distanceOutOfRange: outOfRangeById.get(id) === true,
      storeKind: typeof r.store_kind === "string" ? r.store_kind : null,
    });
    if (!excluded) out.add(id);
  }
  return out;
}
