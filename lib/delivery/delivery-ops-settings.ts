import type { SupabaseClient } from "@supabase/supabase-js";

export const DELIVERY_OPS_SETTING_KEYS = {
  riderLocationEnabled: "delivery_rider_location_enabled",
  /** `value_json`: `{ "value": "store" | "google" }` — 기본(행 없음)은 `store` */
  rideTimeSource: "delivery_ride_time_source",
  /** `value_json`: `DeliveryDistancePolicy` — 배달 browse 거리 표시·정렬 정책 */
  distancePolicy: "delivery_distance_policy",
  /** `value_json`: `DeliveryStoreDistanceOverrides` — 매장별 거리 정책 override */
  storeDistanceOverrides: "delivery_store_distance_overrides",
} as const;

export type DeliveryRideTimeSource = "store" | "google";
export type DeliveryDistanceSource = "straight" | "google";
export type DeliveryStoreDistanceMode = "inherit" | "enabled" | "disabled";

export type DeliveryDistancePolicy = {
  enabled: boolean;
  source: DeliveryDistanceSource;
  defaultMaxKm: number | null;
  overDistanceBehavior: "deprioritize";
};

export type DeliveryStoreDistanceOverride = {
  mode: DeliveryStoreDistanceMode;
  maxKm: number | null;
};

export type DeliveryStoreDistanceOverrides = {
  stores: Record<string, DeliveryStoreDistanceOverride>;
};

export const DEFAULT_DELIVERY_DISTANCE_POLICY: DeliveryDistancePolicy = {
  enabled: false,
  source: "straight",
  defaultMaxKm: null,
  overDistanceBehavior: "deprioritize",
};

export const DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES: DeliveryStoreDistanceOverrides = {
  stores: {},
};

/** 운영 적용 전까지 배달 browse 거리 정책은 항상 OFF. 저장된 세부 설정은 보존한다. */
export const DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED = false;

export function normalizeDeliveryRideTimeSource(raw: unknown): DeliveryRideTimeSource {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "google") return "google";
  return "store";
}

export function normalizeDeliveryDistanceSource(raw: unknown): DeliveryDistanceSource {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "google") return "google";
  return "straight";
}

export function normalizeDeliveryStoreDistanceMode(raw: unknown): DeliveryStoreDistanceMode {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "enabled" || s === "disabled") return s;
  return "inherit";
}

function parseMaxKm(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

export function normalizeDeliveryDistancePolicy(raw: unknown): DeliveryDistancePolicy {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: o.enabled === true,
    source: normalizeDeliveryDistanceSource(o.source),
    defaultMaxKm: parseMaxKm(o.defaultMaxKm),
    overDistanceBehavior: "deprioritize",
  };
}

export function normalizeDeliveryStoreDistanceOverride(raw: unknown): DeliveryStoreDistanceOverride {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    mode: normalizeDeliveryStoreDistanceMode(o.mode),
    maxKm: parseMaxKm(o.maxKm),
  };
}

export function normalizeDeliveryStoreDistanceOverrides(raw: unknown): DeliveryStoreDistanceOverrides {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const storesRaw = o.stores && typeof o.stores === "object" ? (o.stores as Record<string, unknown>) : {};
  const stores: Record<string, DeliveryStoreDistanceOverride> = {};
  for (const [storeId, value] of Object.entries(storesRaw)) {
    const id = storeId.trim();
    if (!id) continue;
    const next = normalizeDeliveryStoreDistanceOverride(value);
    if (next.mode === "inherit" && next.maxKm == null) continue;
    stores[id] = next;
  }
  return { stores };
}

/** 짧은 TTL + in-flight 단일화 — 목록·피드·ETA가 같은 요청/연속 요청에서 admin_settings 를 중복 조회하지 않게 한다 */
const RIDE_TIME_SOURCE_TTL_MS = 15_000;
let rideTimeSourceMem: { value: DeliveryRideTimeSource; expiresAt: number } | null = null;
let rideTimeSourceInflight: Promise<DeliveryRideTimeSource> | null = null;
let distancePolicyMem:
  | { value: { policy: DeliveryDistancePolicy; overrides: DeliveryStoreDistanceOverrides }; expiresAt: number }
  | null = null;
let distancePolicyInflight: Promise<{
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
}> | null = null;

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

/** 프로세스 메모리 TTL 히트 시 즉시 반환(목록 API 등 — DB 왕복 생략) */
export function peekDeliveryRideTimeSource(): DeliveryRideTimeSource | null {
  const now = Date.now();
  if (rideTimeSourceMem && rideTimeSourceMem.expiresAt > now) {
    return rideTimeSourceMem.value;
  }
  return null;
}

export async function loadDeliveryRideTimeSource(sb: SupabaseClient): Promise<DeliveryRideTimeSource> {
  const peeked = peekDeliveryRideTimeSource();
  if (peeked != null) return peeked;
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

export function peekDeliveryDistanceSettings(): {
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
} | null {
  const now = Date.now();
  if (distancePolicyMem && distancePolicyMem.expiresAt > now) {
    return distancePolicyMem.value;
  }
  return null;
}

async function fetchDeliveryDistanceSettingsFromDb(sb: SupabaseClient): Promise<{
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
}> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("key, value_json")
    .in("key", [DELIVERY_OPS_SETTING_KEYS.distancePolicy, DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides]);
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return {
        policy: DEFAULT_DELIVERY_DISTANCE_POLICY,
        overrides: DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
      };
    }
    console.error("[loadDeliveryDistanceSettings]", error);
    return {
      policy: DEFAULT_DELIVERY_DISTANCE_POLICY,
      overrides: DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
    };
  }
  const rows = (data ?? []) as { key?: string; value_json?: unknown }[];
  const policyRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.distancePolicy);
  const overridesRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides);
  return {
    policy: normalizeDeliveryDistancePolicy(policyRow?.value_json),
    overrides: normalizeDeliveryStoreDistanceOverrides(overridesRow?.value_json),
  };
}

export async function loadDeliveryDistanceSettings(sb: SupabaseClient): Promise<{
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
}> {
  const peeked = peekDeliveryDistanceSettings();
  if (peeked != null) return peeked;
  if (distancePolicyInflight) return distancePolicyInflight;
  distancePolicyInflight = (async () => {
    try {
      const value = await fetchDeliveryDistanceSettingsFromDb(sb);
      distancePolicyMem = { value, expiresAt: Date.now() + RIDE_TIME_SOURCE_TTL_MS };
      return value;
    } finally {
      distancePolicyInflight = null;
    }
  })();
  return distancePolicyInflight;
}

export function invalidateDeliveryDistanceSettingsCache(): void {
  distancePolicyMem = null;
  distancePolicyInflight = null;
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

