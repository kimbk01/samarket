import type { SupabaseClient } from "@supabase/supabase-js";

export const DELIVERY_OPS_SETTING_KEYS = {
  riderLocationEnabled: "delivery_rider_location_enabled",
  /** `value_json`: `{ "value": "store" | "google" }` — 기본(행 없음)은 `store` */
  rideTimeSource: "delivery_ride_time_source",
} as const;

export type DeliveryRideTimeSource = "store" | "google";

export function normalizeDeliveryRideTimeSource(raw: unknown): DeliveryRideTimeSource {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "google") return "google";
  return "store";
}

/** 짧은 TTL + in-flight 단일화 — 목록·피드·ETA가 같은 요청/연속 요청에서 admin_settings 를 중복 조회하지 않게 한다 */
const RIDE_TIME_SOURCE_TTL_MS = 15_000;
let rideTimeSourceMem: { value: DeliveryRideTimeSource; expiresAt: number } | null = null;
let rideTimeSourceInflight: Promise<DeliveryRideTimeSource> | null = null;

async function fetchDeliveryRideTimeSourceFromDb(sb: SupabaseClient): Promise<DeliveryRideTimeSource> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", DELIVERY_OPS_SETTING_KEYS.rideTimeSource)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) return "store";
    console.error("[loadDeliveryRideTimeSource]", error);
    return "store";
  }
  const v = (data as { value_json?: unknown } | null)?.value_json as { value?: unknown } | null;
  return normalizeDeliveryRideTimeSource(v?.value);
}

export async function loadDeliveryRideTimeSource(sb: SupabaseClient): Promise<DeliveryRideTimeSource> {
  const now = Date.now();
  if (rideTimeSourceMem && rideTimeSourceMem.expiresAt > now) {
    return rideTimeSourceMem.value;
  }
  if (rideTimeSourceInflight) {
    return rideTimeSourceInflight;
  }
  rideTimeSourceInflight = (async () => {
    try {
      const value = await fetchDeliveryRideTimeSourceFromDb(sb);
      rideTimeSourceMem = { value, expiresAt: Date.now() + RIDE_TIME_SOURCE_TTL_MS };
      return value;
    } finally {
      rideTimeSourceInflight = null;
    }
  })();
  return rideTimeSourceInflight;
}

/** 관리자가 `delivery_ride_time_source` 를 바꾼 직후 — 프로세스 메모리 캐시를 즉시 비운다 */
export function invalidateDeliveryRideTimeSourceCache(): void {
  rideTimeSourceMem = null;
  rideTimeSourceInflight = null;
}

export async function loadDeliveryRiderLocationEnabled(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) return false;
    console.error("[loadDeliveryRiderLocationEnabled]", error);
    return false;
  }
  const v = (data as { value_json?: unknown } | null)?.value_json as { value?: unknown } | null;
  return v?.value === true;
}

