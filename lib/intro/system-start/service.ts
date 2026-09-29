import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type BrandSizePreset,
  type SystemStartInstalled,
  type SystemStartNextBuild,
  normalizeBrandSizePreset,
  normalizeHexColor,
  normalizeMinVisibleMs,
} from "@/lib/intro/system-start/contract";
import {
  getReadyRuntimeForMedia,
  listReadyIntroMedia,
} from "@/lib/intro/media/service";

type Row = {
  revision: number;
  background_color: string;
  brand_asset_enabled: boolean;
  brand_asset_media_id: string | null;
  brand_size_preset: string;
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

async function resolvePreview(
  sb: SupabaseClient,
  mediaId: string | null,
): Promise<string | null> {
  if (!mediaId) return null;
  const items = await listReadyIntroMedia(sb);
  return items.find((m) => m.mediaId === mediaId)?.previewUrl ?? null;
}

function rowToNext(row: Row, brandPreviewUrl: string | null): SystemStartNextBuild {
  return {
    revision: Number(row.revision),
    backgroundColor: String(row.background_color).toUpperCase(),
    brandAssetEnabled: !!row.brand_asset_enabled,
    brandAssetMediaId: row.brand_asset_media_id,
    brandSizePreset: normalizeBrandSizePreset(row.brand_size_preset),
    minVisibleMs: normalizeMinVisibleMs(row.min_visible_ms),
    updatedAt: row.updated_at,
    brandPreviewUrl,
  };
}

function rowToInstalled(row: Row, brandPreviewUrl: string | null): SystemStartInstalled | null {
  if (
    row.materialized_revision == null ||
    !row.materialized_background_color ||
    !row.materialized_at ||
    row.materialized_min_visible_ms == null ||
    !row.materialized_brand_size_preset
  ) {
    return null;
  }
  return {
    revision: Number(row.materialized_revision),
    backgroundColor: String(row.materialized_background_color).toUpperCase(),
    brandAssetEnabled: !!row.materialized_brand_asset_enabled,
    brandAssetMediaId: row.materialized_brand_asset_media_id,
    brandSizePreset: normalizeBrandSizePreset(row.materialized_brand_size_preset),
    minVisibleMs: normalizeMinVisibleMs(row.materialized_min_visible_ms),
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
  const nextPreview = await resolvePreview(sb, row.brand_asset_media_id);
  const installedPreview = await resolvePreview(
    sb,
    row.materialized_brand_asset_media_id,
  );
  return {
    nextBuild: rowToNext(row, nextPreview),
    installed: rowToInstalled(row, installedPreview),
  };
}

export type SystemStartPutInput = {
  backgroundColor?: string;
  brandAssetEnabled?: boolean;
  brandAssetMediaId?: string | null;
  clearBrandAsset?: boolean;
  brandSizePreset?: BrandSizePreset;
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

  const brandSizePreset = normalizeBrandSizePreset(
    input.brandSizePreset ?? current.nextBuild.brandSizePreset,
  );
  const minVisibleMs = normalizeMinVisibleMs(
    input.minVisibleMs !== undefined
      ? input.minVisibleMs
      : current.nextBuild.minVisibleMs,
  );

  const nextRevision = current.nextBuild.revision + 1;
  const { error } = await sb
    .from("app_system_start_config")
    .update({
      revision: nextRevision,
      background_color: bg,
      brand_asset_enabled: brandAssetEnabled,
      brand_asset_media_id: brandAssetMediaId,
      brand_size_preset: brandSizePreset,
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
