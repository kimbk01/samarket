/**
 * DIBAY System Start Layer B — Apply → immutable generation → Live pointer.
 * Does NOT mutate OS Splash / LaunchScreen binaries.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_INTRO_STORAGE_BUCKET } from "@/lib/intro/db/authority";

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

/**
 * R14-P6 FINAL: shadow writer removed.
 * Product route returns 409; this lower-level entry must not mutate Live.
 */
export async function applySystemStartLive(
  _sb: SupabaseClient,
  _args: { userId: string },
): Promise<SystemStartLiveStatus> {
  throw Object.assign(new Error("system_start_separate_apply_retired"), {
    status: 409,
  });
}
