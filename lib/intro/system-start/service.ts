import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type BrandSizePreset,
  type SystemStartInstalled,
  type SystemStartNextBuild,
  coerceMinVisibleMsForRead,
  normalizeHexColor,
  parseBrandSizePreset,
  parseMinVisibleMs,
} from "@/lib/intro/system-start/contract";
import {
  getReadyRuntimeForMedia,
  listReadyIntroMedia,
} from "@/lib/intro/media/service";

type Row = {
  revision: number;
  background_color: string;
  background_image_media_id?: string | null;
  brand_asset_enabled: boolean;
  brand_asset_media_id: string | null;
  brand_size_preset: string;
  brand_x_norm?: number | null;
  brand_y_norm?: number | null;
  min_visible_ms: number;
  updated_at: string;
  materialized_revision: number | null;
  materialized_background_color: string | null;
  materialized_brand_asset_enabled: boolean | null;
  materialized_brand_asset_media_id: string | null;
  materialized_brand_size_preset: string | null;
  materialized_min_visible_ms: number | null;
  materialized_at: string | null;
};

function clamp01(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

async function resolvePreview(
  sb: SupabaseClient,
  mediaId: string | null | undefined,
): Promise<string | null> {
  if (!mediaId) return null;
  const items = await listReadyIntroMedia(sb);
  return items.find((m) => m.mediaId === mediaId)?.previewUrl ?? null;
}

async function rowToNext(
  sb: SupabaseClient,
  row: Row,
): Promise<SystemStartNextBuild> {
  const brandPreviewUrl = await resolvePreview(sb, row.brand_asset_media_id);
  const bgId = row.background_image_media_id ?? null;
  const backgroundImagePreviewUrl = await resolvePreview(sb, bgId);
  return {
    revision: Number(row.revision),
    backgroundColor: String(row.background_color).toUpperCase(),
    backgroundImageMediaId: bgId,
    backgroundImagePreviewUrl,
    brandAssetEnabled: !!row.brand_asset_enabled,
    brandAssetMediaId: row.brand_asset_media_id,
    brandSizePreset: parseBrandSizePreset(row.brand_size_preset) ?? "M",
    brandXNorm: clamp01(Number(row.brand_x_norm ?? 0.5), 0.5),
    brandYNorm: clamp01(Number(row.brand_y_norm ?? 0.5), 0.5),
    minVisibleMs: coerceMinVisibleMsForRead(row.min_visible_ms),
    updatedAt: row.updated_at,
    brandPreviewUrl,
  };
}

async function rowToInstalled(
  sb: SupabaseClient,
  row: Row,
): Promise<SystemStartInstalled | null> {
  if (
    row.materialized_revision == null ||
    !row.materialized_background_color ||
    !row.materialized_at ||
    row.materialized_min_visible_ms == null ||
    !row.materialized_brand_size_preset
  ) {
    return null;
  }
  const brandPreviewUrl = await resolvePreview(
    sb,
    row.materialized_brand_asset_media_id,
  );
  return {
    revision: Number(row.materialized_revision),
    backgroundColor: String(row.materialized_background_color).toUpperCase(),
    backgroundImageMediaId: null,
    backgroundImagePreviewUrl: null,
    brandAssetEnabled: !!row.materialized_brand_asset_enabled,
    brandAssetMediaId: row.materialized_brand_asset_media_id,
    brandSizePreset: parseBrandSizePreset(row.materialized_brand_size_preset) ?? "M",
    brandXNorm: 0.5,
    brandYNorm: 0.5,
    minVisibleMs: coerceMinVisibleMsForRead(row.materialized_min_visible_ms),
    materializedAt: row.materialized_at,
    brandPreviewUrl,
  };
}

export async function getSystemStartConfig(sb: SupabaseClient): Promise<{
  nextBuild: SystemStartNextBuild;
  installed: SystemStartInstalled | null;
}> {
  const { data, error } = await sb
    .from("app_system_start_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("system_start_config_missing");
  const row = data as Row;
  return {
    nextBuild: await rowToNext(sb, row),
    installed: await rowToInstalled(sb, row),
  };
}

export type SystemStartPutInput = {
  backgroundColor?: string;
  backgroundImageMediaId?: string | null;
  clearBackgroundImage?: boolean;
  brandAssetEnabled?: boolean;
  brandAssetMediaId?: string | null;
  clearBrandAsset?: boolean;
  brandSizePreset?: BrandSizePreset;
  brandXNorm?: number;
  brandYNorm?: number;
  minVisibleMs?: number;
  updatedBy?: string | null;
};

export async function putSystemStartConfig(
  sb: SupabaseClient,
  input: SystemStartPutInput,
): Promise<{
  nextBuild: SystemStartNextBuild;
  installed: SystemStartInstalled | null;
}> {
  const current = await getSystemStartConfig(sb);
  const bg =
    input.backgroundColor !== undefined
      ? normalizeHexColor(input.backgroundColor)
      : current.nextBuild.backgroundColor;
  if (!bg) throw new Error("invalid_background_color");

  let mediaId = current.nextBuild.brandAssetMediaId;
  if (input.clearBrandAsset === true || input.brandAssetMediaId === null) {
    mediaId = null;
  } else if (
    typeof input.brandAssetMediaId === "string" &&
    input.brandAssetMediaId.trim()
  ) {
    mediaId = input.brandAssetMediaId.trim();
  }

  let bgImageId = current.nextBuild.backgroundImageMediaId;
  if (input.clearBackgroundImage === true || input.backgroundImageMediaId === null) {
    bgImageId = null;
  } else if (
    typeof input.backgroundImageMediaId === "string" &&
    input.backgroundImageMediaId.trim()
  ) {
    bgImageId = input.backgroundImageMediaId.trim();
  }

  const wantBrand =
    input.brandAssetEnabled !== undefined
      ? !!input.brandAssetEnabled
      : current.nextBuild.brandAssetEnabled;
  const brandAssetEnabled = wantBrand && !!mediaId;
  const brandAssetMediaId = brandAssetEnabled ? mediaId : null;

  if (brandAssetMediaId) {
    const runtime = await getReadyRuntimeForMedia(sb, brandAssetMediaId);
    if (!runtime) throw new Error("brand_media_not_ready");
  }
  if (bgImageId) {
    const runtime = await getReadyRuntimeForMedia(sb, bgImageId);
    if (!runtime) throw new Error("background_image_not_ready");
  }

  const brandSizePresetRaw =
    input.brandSizePreset !== undefined
      ? input.brandSizePreset
      : current.nextBuild.brandSizePreset;
  const brandSizePreset = parseBrandSizePreset(brandSizePresetRaw);
  if (!brandSizePreset) throw new Error("invalid_brand_size_preset");

  const minVisibleRaw =
    input.minVisibleMs !== undefined
      ? input.minVisibleMs
      : current.nextBuild.minVisibleMs;
  const minVisibleMs = parseMinVisibleMs(minVisibleRaw);
  if (minVisibleMs == null) throw new Error("invalid_min_visible_ms");

  const brandXNorm = clamp01(
    input.brandXNorm !== undefined
      ? Number(input.brandXNorm)
      : current.nextBuild.brandXNorm,
    0.5,
  );
  const brandYNorm = clamp01(
    input.brandYNorm !== undefined
      ? Number(input.brandYNorm)
      : current.nextBuild.brandYNorm,
    0.5,
  );

  const nextRevision = current.nextBuild.revision + 1;
  const { error } = await sb
    .from("app_system_start_config")
    .update({
      revision: nextRevision,
      background_color: bg,
      background_image_media_id: bgImageId,
      brand_asset_enabled: brandAssetEnabled,
      brand_asset_media_id: brandAssetMediaId,
      brand_size_preset: brandSizePreset,
      brand_x_norm: brandXNorm,
      brand_y_norm: brandYNorm,
      min_visible_ms: minVisibleMs,
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy ?? null,
    })
    .eq("id", 1);

  if (error) throw new Error(error.message);
  return getSystemStartConfig(sb);
}

/** Build materializer stamps installed projection after native resources written. */
export async function stampSystemStartMaterialized(
  sb: SupabaseClient,
): Promise<void> {
  const { nextBuild } = await getSystemStartConfig(sb);
  const { error } = await sb
    .from("app_system_start_config")
    .update({
      materialized_revision: nextBuild.revision,
      materialized_background_color: nextBuild.backgroundColor,
      materialized_brand_asset_enabled: nextBuild.brandAssetEnabled,
      materialized_brand_asset_media_id: nextBuild.brandAssetMediaId,
      materialized_brand_size_preset: nextBuild.brandSizePreset,
      materialized_min_visible_ms: nextBuild.minVisibleMs,
      materialized_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}
