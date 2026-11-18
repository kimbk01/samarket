/**
 * B1 — home-feed 요청당 admin_settings 1회.
 * ride / distance / commerce 키를 한 번에 읽어 라우트가 재조회하지 않게 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_DELIVERY_DISTANCE_POLICY,
  DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
  DELIVERY_OPS_SETTING_KEYS,
  FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS,
  normalizeDeliveryRideTimeSource,
  normalizeDeliveryDistancePolicy,
  normalizeDeliveryStoreDistanceOverrides,
  type DeliveryDistancePolicy,
  type DeliveryRideTimeSource,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import { COMMERCE_SETTING_KEYS } from "@/lib/stores/commerce-settings-keys";
import {
  resolveCommerceSettingsFromValueMap,
  type CommerceSettingsResolved,
} from "@/lib/stores/load-commerce-settings";

const HOME_FEED_ADMIN_SETTING_KEYS: string[] = [
  DELIVERY_OPS_SETTING_KEYS.rideTimeSource,
  DELIVERY_OPS_SETTING_KEYS.distancePolicy,
  DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides,
  COMMERCE_SETTING_KEYS.autoCompleteDays,
  COMMERCE_SETTING_KEYS.settlementFeeBp,
  COMMERCE_SETTING_KEYS.settlementDelayDays,
  COMMERCE_SETTING_KEYS.popularMenuWindowDays,
  COMMERCE_SETTING_KEYS.popularMenuMinQty,
  COMMERCE_SETTING_KEYS.popularMenuTopN,
  COMMERCE_SETTING_KEYS.popularMenuRecommendedMax,
];

export type HomeFeedAdminSettingsBundle = {
  rideTimeSource: DeliveryRideTimeSource;
  distance: {
    policy: DeliveryDistancePolicy;
    overrides: DeliveryStoreDistanceOverrides;
  };
  commerce: CommerceSettingsResolved;
};

function valueMapFromRows(rows: { key?: string; value_json?: unknown }[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const row of rows) {
    if (typeof row.key === "string" && row.key) map.set(row.key, row.value_json);
  }
  return map;
}

export function resolveHomeFeedAdminSettingsBundleFromRows(
  rows: { key?: string; value_json?: unknown }[]
): HomeFeedAdminSettingsBundle {
  const map = valueMapFromRows(rows);
  const rideRaw = map.get(DELIVERY_OPS_SETTING_KEYS.rideTimeSource) as { value?: unknown } | null | undefined;
  const policyRaw = map.get(DELIVERY_OPS_SETTING_KEYS.distancePolicy);
  const overridesRaw = map.get(DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides);
  return {
    rideTimeSource: normalizeDeliveryRideTimeSource(rideRaw?.value),
    distance: {
      policy: policyRaw == null ? DEFAULT_DELIVERY_DISTANCE_POLICY : normalizeDeliveryDistancePolicy(policyRaw),
      overrides:
        overridesRaw == null
          ? DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES
          : normalizeDeliveryStoreDistanceOverrides(overridesRaw),
    },
    commerce: resolveCommerceSettingsFromValueMap(map),
  };
}

/**
 * home-feed 핫패스 — admin_settings 왕복 1회.
 * 읽기 오류 시 목록 경로와 같이 fail-closed 거리 정책 + commerce 기본값 (주문 경로는 기존 OrThrow 유지).
 */
export async function loadHomeFeedAdminSettingsBundle(
  sb: SupabaseClient
): Promise<HomeFeedAdminSettingsBundle> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("key, value_json")
    .in("key", HOME_FEED_ADMIN_SETTING_KEYS);

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return resolveHomeFeedAdminSettingsBundleFromRows([]);
    }
    console.error("[loadHomeFeedAdminSettingsBundle]", error);
    return {
      rideTimeSource: "store",
      distance: FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS,
      commerce: resolveCommerceSettingsFromValueMap(new Map()),
    };
  }

  return resolveHomeFeedAdminSettingsBundleFromRows((data ?? []) as { key?: string; value_json?: unknown }[]);
}

export { HOME_FEED_ADMIN_SETTING_KEYS };
