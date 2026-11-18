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
  /**
   * OUT-OF-RANGE PRODUCT POLICY (authenticated member + master address):
   * POLICY = EXCLUDE from normal orderable lists (browse/category/search/order-now/popular/rest).
   * Intentional discovery shelves may still surface OOR with primary copy
   * 「배달 가능 지역 아님」 — never as orderable.
   * Detail / cart / checkout / order: evaluateDeliveryServiceability → block if ineligible.
   */
  overDistanceBehavior: "exclude";
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
  overDistanceBehavior: "exclude",
};

export const DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES: DeliveryStoreDistanceOverrides = {
  stores: {},
};

/**
 * When true, `admin_settings.delivery_distance_policy.enabled` is honored at runtime
 * (browse sort/badge + checkout server gate). Serviceability uses haversine only — never Google.
 */
export const DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED = true;

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
    /** Legacy JSON may still store a number — not store-radius authority after CUT1. */
    defaultMaxKm: parseMaxKm(o.defaultMaxKm),
    overDistanceBehavior: "exclude",
  };
}

/**
 * LOC-011 — raw `admin_settings.delivery_distance_policy` vs what the code applies.
 * - `normalizedOnSave`: raw values the normalizer rewrites (shown as applied value; next save stores it).
 * - `ignored`: legacy values kept in storage but never used for eligibility (CUT1 store radius SSOT).
 */
export function describeDeliveryDistancePolicyRawDiff(raw: unknown): {
  normalizedOnSave: string[];
  ignored: string[];
} {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return { normalizedOnSave: [], ignored: [] };
  const norm = normalizeDeliveryDistancePolicy(o);
  const normalizedOnSave: string[] = [];
  const ignored: string[] = [];
  if ("enabled" in o && o.enabled !== norm.enabled) normalizedOnSave.push("enabled");
  if ("source" in o && o.source !== norm.source) normalizedOnSave.push("source");
  if ("overDistanceBehavior" in o && o.overDistanceBehavior !== norm.overDistanceBehavior) {
    normalizedOnSave.push("overDistanceBehavior");
  }
  if (norm.defaultMaxKm != null) ignored.push("defaultMaxKm");
  return { normalizedOnSave, ignored };
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
    // LOC-003: never silently fall back to policy OFF on a read error (fail-open).
    throw new DeliveryPolicyUnavailableError(error.message);
  }
  const rows = (data ?? []) as { key?: string; value_json?: unknown }[];
  const policyRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.distancePolicy);
  const overridesRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides);
  return {
    policy: normalizeDeliveryDistancePolicy(policyRow?.value_json),
    overrides: normalizeDeliveryStoreDistanceOverrides(overridesRow?.value_json),
  };
}

/** LOC-003 — distance policy could not be read (DB error). Order route maps to 503. */
export class DeliveryPolicyUnavailableError extends Error {
  readonly code = "delivery_policy_unavailable" as const;
  constructor(detail?: string) {
    super(detail ? `delivery_policy_unavailable: ${detail}` : "delivery_policy_unavailable");
    this.name = "DeliveryPolicyUnavailableError";
  }
}

export function isDeliveryPolicyUnavailableError(e: unknown): e is DeliveryPolicyUnavailableError {
  return e instanceof DeliveryPolicyUnavailableError;
}

/**
 * LOC-003 fail-closed fallback when no successful read exists in this process:
 * distance axis ON (store radius authority), no per-store overrides (no `disabled` bypass).
 */
export const FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS: {
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
} = {
  policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true },
  overrides: DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
};

/** Last successful read in this process (no TTL) — list/detail fallback on read error. */
let distancePolicyLastGood: {
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
} | null = null;

/**
 * Strict loader — throws `DeliveryPolicyUnavailableError` on DB error.
 * Use on the order (checkout) path and on persisted projections.
 */
export async function loadDeliveryDistanceSettingsOrThrow(sb: SupabaseClient): Promise<{
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
      distancePolicyLastGood = value;
      return value;
    } finally {
      distancePolicyInflight = null;
    }
  })();
  return distancePolicyInflight;
}

/**
 * List / detail loader — on read error returns the last successful value in this process,
 * or `FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS` when none (never policy OFF).
 */
export async function loadDeliveryDistanceSettings(sb: SupabaseClient): Promise<{
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
}> {
  try {
    return await loadDeliveryDistanceSettingsOrThrow(sb);
  } catch (e) {
    if (!isDeliveryPolicyUnavailableError(e)) throw e;
    return distancePolicyLastGood ?? FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS;
  }
}

export function invalidateDeliveryDistanceSettingsCache(): void {
  distancePolicyMem = null;
  distancePolicyInflight = null;
}

/** Test-only — reset process memory including last-good fallback. */
export function __resetDeliveryDistanceSettingsForTests(): void {
  distancePolicyMem = null;
  distancePolicyInflight = null;
  distancePolicyLastGood = null;
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

