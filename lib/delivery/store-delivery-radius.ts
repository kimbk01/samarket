/**
 * STORE DELIVERY RADIUS SSOT — CUT 1
 *
 * Canonical column: `stores.delivery_radius_km`
 * Effective default when NULL/absent: 10 km (Owner-locked).
 *
 * Do NOT fall back to admin_settings.defaultMaxKm or
 * delivery_store_distance_overrides.maxKm for store radius.
 */

/** Owner-locked product default when column is NULL. */
export const DEFAULT_STORE_DELIVERY_RADIUS_KM = 10 as const;

/**
 * Temporary write validation until Owner sets MIN/MAX.
 * Rejects: NaN, non-finite, <= 0. Rounds to 0.1 km.
 * No invented business max.
 */
export function parseStoreDeliveryRadiusKmForWrite(
  raw: unknown
): { ok: true; value: number } | { ok: false; error: "invalid_delivery_radius_km" } {
  if (raw == null || raw === "") {
    return { ok: false, error: "invalid_delivery_radius_km" };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "invalid_delivery_radius_km" };
  }
  return { ok: true, value: Math.round(n * 10) / 10 };
}

/** Persistable configured value: finite > 0 at 0.1 km, else null (use default). */
export function parseConfiguredStoreDeliveryRadiusKm(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

/**
 * ONE canonical effective radius for Customer / Owner display / Admin display.
 * configured → configured; NULL/absent/invalid → 10.
 */
export function resolveEffectiveStoreDeliveryRadiusKm(raw: unknown): number {
  const configured = parseConfiguredStoreDeliveryRadiusKm(raw);
  if (configured != null) return configured;
  return DEFAULT_STORE_DELIVERY_RADIUS_KM;
}

/** Display helper — always shows effective km (never blank for NULL). */
export function formatStoreDeliveryRadiusKmForInput(raw: unknown): string {
  return String(resolveEffectiveStoreDeliveryRadiusKm(raw));
}

/**
 * Owner/Admin save: omit when input equals current effective AND DB stays NULL (default display).
 * Otherwise persist explicit positive km (including explicit 10).
 */
export function resolveStoreDeliveryRadiusKmPatch(
  configuredRaw: unknown,
  inputRaw: unknown
):
  | { omit: true }
  | { ok: true; value: number }
  | { ok: false; error: "invalid_delivery_radius_km" } {
  const parsed = parseStoreDeliveryRadiusKmForWrite(inputRaw);
  if (!parsed.ok) return parsed;
  const configured = parseConfiguredStoreDeliveryRadiusKm(configuredRaw);
  const currentEffective = resolveEffectiveStoreDeliveryRadiusKm(configuredRaw);
  if (configured == null && parsed.value === currentEffective) {
    return { omit: true };
  }
  if (configured != null && configured === parsed.value) {
    return { omit: true };
  }
  return { ok: true, value: parsed.value };
}
