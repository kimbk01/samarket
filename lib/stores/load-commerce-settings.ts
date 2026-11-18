import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMERCE_SETTING_KEYS, type CommerceSettingKey } from "@/lib/stores/commerce-settings-keys";
import { getStoreAutoCompleteDays } from "@/lib/stores/store-auto-complete-config";
import { getStoreSettlementDelayDays, getStoreSettlementFeeBp } from "@/lib/stores/store-settlement-config";

export type CommerceSettingsResolved = {
  autoCompleteDays: number;
  settlementFeeBp: number;
  settlementDelayDays: number;
  popularMenuWindowDays: number;
  popularMenuMinQty: number;
  popularMenuTopN: number;
  popularMenuRecommendedMax: number;
};

const ALL_KEYS: CommerceSettingKey[] = [
  COMMERCE_SETTING_KEYS.autoCompleteDays,
  COMMERCE_SETTING_KEYS.settlementFeeBp,
  COMMERCE_SETTING_KEYS.settlementDelayDays,
  COMMERCE_SETTING_KEYS.popularMenuWindowDays,
  COMMERCE_SETTING_KEYS.popularMenuMinQty,
  COMMERCE_SETTING_KEYS.popularMenuTopN,
  COMMERCE_SETTING_KEYS.popularMenuRecommendedMax,
];

function readNumericValue(
  valueJson: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (valueJson == null || typeof valueJson !== "object") return fallback;
  const v = Number((valueJson as Record<string, unknown>).value);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * DB admin_settings가 있으면 우선, 없거나 오류 시 .env 기본값
 */
export async function loadCommerceSettings(sb: SupabaseClient): Promise<CommerceSettingsResolved> {
  const fallback: CommerceSettingsResolved = {
    autoCompleteDays: getStoreAutoCompleteDays(),
    settlementFeeBp: getStoreSettlementFeeBp(),
    settlementDelayDays: getStoreSettlementDelayDays(),
    popularMenuWindowDays: 30,
    popularMenuMinQty: 1,
    popularMenuTopN: 5,
    popularMenuRecommendedMax: 10,
  };

  const { data, error } = await sb
    .from("admin_settings")
    .select("key, value_json")
    .in("key", ALL_KEYS);

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return fallback;
    }
    console.warn("[loadCommerceSettings]", error.message);
    return fallback;
  }

  const map = new Map<string, unknown>();
  for (const row of data ?? []) map.set(row.key as string, row.value_json);

  return {
    autoCompleteDays: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.autoCompleteDays),
      fallback.autoCompleteDays,
      1,
      90
    ),
    settlementFeeBp: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.settlementFeeBp),
      fallback.settlementFeeBp,
      0,
      10000
    ),
    settlementDelayDays: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.settlementDelayDays),
      fallback.settlementDelayDays,
      0,
      365
    ),
    popularMenuWindowDays: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.popularMenuWindowDays),
      fallback.popularMenuWindowDays,
      1,
      365
    ),
    popularMenuMinQty: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.popularMenuMinQty),
      fallback.popularMenuMinQty,
      1,
      10_000
    ),
    popularMenuTopN: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.popularMenuTopN),
      fallback.popularMenuTopN,
      1,
      50
    ),
    popularMenuRecommendedMax: readNumericValue(
      map.get(COMMERCE_SETTING_KEYS.popularMenuRecommendedMax),
      fallback.popularMenuRecommendedMax,
      0,
      30
    ),
  };
}

/** 관리자 화면용: DB에 행이 있는 키 목록 */
export async function listCommerceSettingKeysInDb(
  sb: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await sb.from("admin_settings").select("key").in("key", ALL_KEYS);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.key as string));
}
