/**
 * REBUILD 14 — System Start IR (mandatory product phase).
 * Field semantics aligned with lib/intro/system-start/contract.ts (data only).
 */

import {
  BRAND_SIZE_PRESETS,
  normalizeHexColor,
  parseBrandSizePreset,
  parseMinVisibleMs,
  type BrandSizePreset,
  type SystemStartMinVisibleMs,
} from "@/lib/intro/system-start/contract";

export type { BrandSizePreset, SystemStartMinVisibleMs };

export type SystemStartIR = {
  readonly backgroundColor: string;
  readonly backgroundImageMediaId: string | null;
  readonly brandAssetEnabled: boolean;
  readonly brandAssetMediaId: string | null;
  readonly brandSizePreset: BrandSizePreset;
  readonly brandXNorm: number;
  readonly brandYNorm: number;
  readonly minVisibleMs: SystemStartMinVisibleMs;
};

export type SystemStartIRValidation =
  | { readonly ok: true; readonly value: SystemStartIR }
  | { readonly ok: false; readonly reason: string };

function isNorm01(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/** Fail-closed parse for envelope.systemStart (mandatory object). */
export function parseSystemStartIR(raw: unknown): SystemStartIRValidation {
  if (raw == null) {
    return { ok: false, reason: "system_start_missing" };
  }
  if (typeof raw !== "object") {
    return { ok: false, reason: "system_start_not_object" };
  }
  const o = raw as Record<string, unknown>;
  const backgroundColor = normalizeHexColor(String(o.backgroundColor ?? ""));
  if (!backgroundColor) {
    return { ok: false, reason: "system_start_background_color_invalid" };
  }
  const minVisibleMs = parseMinVisibleMs(o.minVisibleMs);
  if (minVisibleMs == null) {
    return { ok: false, reason: "system_start_min_visible_ms_invalid" };
  }
  const brandSizePreset = parseBrandSizePreset(o.brandSizePreset);
  if (!brandSizePreset || !BRAND_SIZE_PRESETS.includes(brandSizePreset)) {
    return { ok: false, reason: "system_start_brand_size_invalid" };
  }
  const brandXNorm = Number(o.brandXNorm);
  const brandYNorm = Number(o.brandYNorm);
  if (!isNorm01(brandXNorm) || !isNorm01(brandYNorm)) {
    return { ok: false, reason: "system_start_brand_geometry_invalid" };
  }
  const brandAssetEnabled = Boolean(o.brandAssetEnabled);
  const brandAssetMediaId =
    o.brandAssetMediaId == null || o.brandAssetMediaId === ""
      ? null
      : String(o.brandAssetMediaId);
  if (brandAssetEnabled && !brandAssetMediaId) {
    return { ok: false, reason: "system_start_brand_media_required" };
  }
  const backgroundImageMediaId =
    o.backgroundImageMediaId == null || o.backgroundImageMediaId === ""
      ? null
      : String(o.backgroundImageMediaId);

  return {
    ok: true,
    value: {
      backgroundColor,
      backgroundImageMediaId,
      brandAssetEnabled,
      brandAssetMediaId,
      brandSizePreset,
      brandXNorm,
      brandYNorm,
      minVisibleMs,
    },
  };
}
