/**
 * DIBAY System Start Layer B — Apply → immutable generation → Live pointer.
 * Does NOT mutate OS Splash / LaunchScreen binaries.
 */

import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_INTRO_STORAGE_BUCKET } from "@/lib/intro/db/authority";
import { getReadyRuntimeForMedia } from "@/lib/intro/media/service";
import { getSystemStartConfig } from "@/lib/intro/system-start/service";
import { BRAND_SIZE_NORM } from "@/lib/intro/system-start/contract";

export type SystemStartLiveConfig = {
  schemaVersion: 1;
  generationId: string;
  revision: number;
  backgroundColor: string;
  backgroundImageMediaId: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: "S" | "M" | "L";
  brandSizeNorm: number;
  brandXNorm: number;
  brandYNorm: number;
  minVisibleMs: number;
  assets: Record<
    string,
    {
      relativePath: string;
      integrity: string;
      width: number;
      height: number;
      format: string;
    }
  >;
};

export type SystemStartLiveStatus =
  | { kind: "NO_LIVE" }
  | {
      kind: "LIVE";
      generationId: string;
      revision: number;
      packageIntegrity: string;
      configRetrievalUrl: string;
      assetRetrievalUrls: Record<string, string>;
      config: SystemStartLiveConfig;
    };

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function getSystemStartLiveStatus(
  sb: SupabaseClient,
): Promise<SystemStartLiveStatus> {
  const { data, error } = await sb
    .from("app_system_start_live")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !data ||
    data.live_kind !== "COMMITTED_LIVE" ||
    !data.generation_id ||
    !data.storage_path ||
    !data.package_integrity
  ) {
    return { kind: "NO_LIVE" };
  }

  const bucket = data.storage_bucket || APP_INTRO_STORAGE_BUCKET;
  const { data: signed, error: signErr } = await sb.storage
    .from(bucket)
    .createSignedUrl(data.storage_path, 60 * 30);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`ss_live_signed:${signErr?.message ?? "missing"}`);
  }

  const { data: blob, error: dlErr } = await sb.storage
    .from(bucket)
    .download(data.storage_path);
  if (dlErr || !blob) throw new Error(`ss_live_download:${dlErr?.message ?? "missing"}`);
  const raw = Buffer.from(await blob.arrayBuffer());
  if (sha256Hex(raw) !== data.package_integrity) {
    throw new Error("ss_live_integrity_mismatch");
  }
  const config = JSON.parse(raw.toString("utf8")) as SystemStartLiveConfig;

  const assetRetrievalUrls: Record<string, string> = {};
  for (const [mediaId, asset] of Object.entries(config.assets ?? {})) {
    const path = `authority/v1/system-start/sealed/${data.generation_id}/${asset.relativePath}`;
    const { data: aSigned, error: aErr } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 30);
    if (aErr || !aSigned?.signedUrl) {
      throw new Error(`ss_asset_signed:${mediaId}`);
    }
    assetRetrievalUrls[mediaId] = aSigned.signedUrl;
  }

  return {
    kind: "LIVE",
    generationId: data.generation_id,
    revision: Number(data.source_revision),
    packageIntegrity: data.package_integrity,
    configRetrievalUrl: signed.signedUrl,
    assetRetrievalUrls,
    config,
  };
}

export async function applySystemStartLive(
  sb: SupabaseClient,
  args: { userId: string },
): Promise<SystemStartLiveStatus> {
  const { nextBuild } = await getSystemStartConfig(sb);
  const generationId = randomUUID();
  const assets: SystemStartLiveConfig["assets"] = {};

  const mediaIds = new Set<string>();
  if (nextBuild.brandAssetEnabled && nextBuild.brandAssetMediaId) {
    mediaIds.add(nextBuild.brandAssetMediaId);
  }
  const bgImageId = nextBuild.backgroundImageMediaId;
  if (bgImageId) mediaIds.add(bgImageId);

  for (const mediaId of mediaIds) {
    const runtime = await getReadyRuntimeForMedia(sb, mediaId);
    if (!runtime) throw new Error(`media_not_ready:${mediaId}`);
    const rel = `media/${mediaId}.${runtime.ext}`;
    const sealedPath = `authority/v1/system-start/sealed/${generationId}/${rel}`;
    const { error: upErr } = await sb.storage
      .from(APP_INTRO_STORAGE_BUCKET)
      .upload(sealedPath, runtime.bytes, {
        contentType: runtime.mime || "application/octet-stream",
        upsert: true,
      });
    if (upErr) throw new Error(`ss_seal_upload:${upErr.message}`);
    assets[mediaId] = {
      relativePath: rel,
      integrity: runtime.integrity,
      width: runtime.width,
      height: runtime.height,
      format: runtime.format,
    };
  }

  const config: SystemStartLiveConfig = {
    schemaVersion: 1,
    generationId,
    revision: nextBuild.revision,
    backgroundColor: nextBuild.backgroundColor,
    backgroundImageMediaId: bgImageId ?? null,
    brandAssetEnabled: nextBuild.brandAssetEnabled,
    brandAssetMediaId: nextBuild.brandAssetMediaId,
    brandSizePreset: nextBuild.brandSizePreset,
    brandSizeNorm: BRAND_SIZE_NORM[nextBuild.brandSizePreset],
    brandXNorm: nextBuild.brandXNorm,
    brandYNorm: nextBuild.brandYNorm,
    minVisibleMs: nextBuild.minVisibleMs,
    assets,
  };

  const configBytes = Buffer.from(JSON.stringify(config), "utf8");
  const packageIntegrity = sha256Hex(configBytes);
  const storagePath = `authority/v1/system-start/packs/${generationId}/config.json`;
  const { error: packErr } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .upload(storagePath, configBytes, {
      contentType: "application/json",
      upsert: true,
    });
  if (packErr) throw new Error(`ss_pack_upload:${packErr.message}`);

  const { error: liveErr } = await sb.from("app_system_start_live").upsert(
    {
      singleton: true,
      live_kind: "COMMITTED_LIVE",
      generation_id: generationId,
      source_revision: nextBuild.revision,
      config,
      package_integrity: packageIntegrity,
      storage_bucket: APP_INTRO_STORAGE_BUCKET,
      storage_path: storagePath,
      set_live_at: new Date().toISOString(),
      set_live_by: args.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "singleton" },
  );
  if (liveErr) throw new Error(liveErr.message);

  // Stamp materialized projection so next native build (Layer A) matches Live B appearance.
  const { error: stampErr } = await sb
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
  if (stampErr) throw new Error(stampErr.message);

  return getSystemStartLiveStatus(sb);
}
