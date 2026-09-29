/**
 * DIBAY INTRO — V2 Device Live payload + temporary retrieval capability.
 *
 * No public bucket. No service role in app. No permanent signed URL in Pack.
 * No Admin auth on cold runtime — device uses app session + short-lived URLs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APP_INTRO_STORAGE_BUCKET,
  AppIntroLiveKind,
  mapsToDeviceNoLiveIntro,
} from "@/lib/intro/db/authority";
import {
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_REQUIRED_FONTS,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PACK_SUPPORTED_ACTIONS,
  INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS,
  INTRO_PACK_SUPPORTED_TRANSITIONS,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
  type IntroPackV1,
} from "@/lib/intro/contracts/pack";
import { ServerLiveStatus } from "@/lib/intro/contracts/status";
import { getLiveAuthority, resolveCommittedRevisionAuthority } from "./service";

const RETRIEVAL_TTL_SEC = 10 * 60;

export type DeviceSealedAssetRetrieval = {
  sealedAssetId: string;
  sealedIntegrity: string;
  byteLength: number;
  relativePackPath: string;
  mime: string;
  format: string;
  kind: string;
  retrievalUrl: string;
  expiresAt: string;
};

export type DeviceLiveCommittedPayload = {
  kind: typeof ServerLiveStatus.LIVE;
  liveKind: typeof AppIntroLiveKind.COMMITTED_LIVE;
  publishedRevisionId: string;
  packId: string;
  packIntegrity: string;
  documentId: string;
  sourceDraftVersion: number;
  compatibility: {
    schemaVersion: number;
    protocolVersion: number;
    renderSpecVersion: number;
    fontSpecVersion: number;
    supportedTransitions: readonly string[];
    supportedActions: readonly string[];
    supportedMediaRuntimeFormats: readonly string[];
    requiredFonts: readonly string[];
  };
  packRetrieval: {
    storagePath: string;
    retrievalUrl: string;
    expiresAt: string;
  };
  sealedAssets: DeviceSealedAssetRetrieval[];
  setLiveAt: string | null;
};

export type DeviceLiveNoLivePayload = {
  kind: typeof ServerLiveStatus.NO_LIVE_INTRO;
  liveKind:
    | typeof AppIntroLiveKind.NEVER_CONFIGURED
    | typeof AppIntroLiveKind.NO_LIVE_INTRO;
  /** Physical discriminant preserved for device interpretation. */
  physicalLiveKind: string;
};

export type DeviceLivePayload =
  | DeviceLiveCommittedPayload
  | DeviceLiveNoLivePayload;

async function signedRetrieval(
  sb: SupabaseClient,
  path: string,
): Promise<{ retrievalUrl: string; expiresAt: string }> {
  const { data, error } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .createSignedUrl(path, RETRIEVAL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(`SIGNED_URL_FAILED:${error?.message ?? "missing"}`);
  }
  return {
    retrievalUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + RETRIEVAL_TTL_SEC * 1000).toISOString(),
  };
}

export async function buildDeviceLivePayload(
  sb: SupabaseClient,
): Promise<DeviceLivePayload> {
  const live = await getLiveAuthority(sb);

  if (mapsToDeviceNoLiveIntro(live.liveKind as typeof AppIntroLiveKind.NEVER_CONFIGURED)) {
    return {
      kind: ServerLiveStatus.NO_LIVE_INTRO,
      liveKind:
        live.liveKind === AppIntroLiveKind.NO_LIVE_INTRO
          ? AppIntroLiveKind.NO_LIVE_INTRO
          : AppIntroLiveKind.NEVER_CONFIGURED,
      physicalLiveKind: live.liveKind,
    };
  }

  if (
    live.liveKind !== AppIntroLiveKind.COMMITTED_LIVE ||
    !live.publishedRevisionId ||
    !live.packId
  ) {
    throw new Error("LIVE_SHAPE_INVALID");
  }

  const authority = await resolveCommittedRevisionAuthority(
    sb,
    live.publishedRevisionId,
  );
  if (authority.packId !== live.packId) {
    throw new Error("LIVE_PACK_POINTER_MISMATCH");
  }

  const { data: packBlob, error: packDlErr } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .download(authority.packStoragePath);
  if (packDlErr || !packBlob) {
    throw new Error(`PACK_DOWNLOAD_FAILED:${packDlErr?.message ?? "missing"}`);
  }
  const packJson = JSON.parse(
    Buffer.from(await packBlob.arrayBuffer()).toString("utf8"),
  ) as IntroPackV1;
  if (packJson.packId !== authority.packId) {
    throw new Error("PACK_JSON_ID_MISMATCH");
  }
  if (packJson.packIntegrity !== authority.packIntegrity) {
    throw new Error("PACK_JSON_INTEGRITY_MISMATCH");
  }
  if (packJson.publishedRevisionId !== authority.publishedRevisionId) {
    throw new Error("PACK_JSON_REVISION_MISMATCH");
  }

  const packRetrieval = await signedRetrieval(sb, authority.packStoragePath);

  const sealedAssets: DeviceSealedAssetRetrieval[] = [];
  for (const asset of packJson.assets) {
    const { data: sealedRow } = await sb
      .from("app_intro_sealed_assets")
      .select("sealed_asset_id, integrity, storage_path, byte_length")
      .eq("sealed_asset_id", asset.sealedAssetId)
      .eq("published_revision_id", authority.publishedRevisionId)
      .maybeSingle();
    if (!sealedRow) {
      throw new Error(`SEALED_ROW_MISSING:${asset.sealedAssetId}`);
    }
    if (String(sealedRow.integrity) !== asset.sealedIntegrity) {
      throw new Error(`SEALED_INTEGRITY_MISMATCH:${asset.sealedAssetId}`);
    }
    const retrieval = await signedRetrieval(sb, String(sealedRow.storage_path));
    sealedAssets.push({
      sealedAssetId: asset.sealedAssetId,
      sealedIntegrity: asset.sealedIntegrity,
      byteLength: asset.byteLength,
      relativePackPath: asset.relativePackPath,
      mime: asset.mime,
      format: asset.format,
      kind: asset.kind,
      retrievalUrl: retrieval.retrievalUrl,
      expiresAt: retrieval.expiresAt,
    });
  }

  return {
    kind: ServerLiveStatus.LIVE,
    liveKind: AppIntroLiveKind.COMMITTED_LIVE,
    publishedRevisionId: authority.publishedRevisionId,
    packId: authority.packId,
    packIntegrity: authority.packIntegrity,
    documentId: authority.documentId,
    sourceDraftVersion: authority.sourceDraftVersion,
    compatibility: {
      schemaVersion: INTRO_PACK_SCHEMA_VERSION,
      protocolVersion: INTRO_PROTOCOL_VERSION,
      renderSpecVersion: INTRO_RENDER_SPEC_VERSION,
      fontSpecVersion: INTRO_FONT_SPEC_VERSION,
      supportedTransitions: [...INTRO_PACK_SUPPORTED_TRANSITIONS],
      supportedActions: [...INTRO_PACK_SUPPORTED_ACTIONS],
      supportedMediaRuntimeFormats: [
        ...INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS,
      ],
      requiredFonts: [...INTRO_PACK_REQUIRED_FONTS],
    },
    packRetrieval: {
      storagePath: authority.packStoragePath,
      retrievalUrl: packRetrieval.retrievalUrl,
      expiresAt: packRetrieval.expiresAt,
    },
    sealedAssets,
    setLiveAt: live.setLiveAt,
  };
}
