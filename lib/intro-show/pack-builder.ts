import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTRO_ENGINE_ID,
  INTRO_ENGINE_VERSION,
  parseIntroShowDocument,
  type IntroRuntimeManifest,
  type IntroShowDocument,
} from "@/intro-engine";
import { DIBAY_GREEN } from "@/intro-engine/identity";
import { sha256BufferHex } from "@/lib/intro-show/hash";
import { INTRO_SHOW_NAMESPACE } from "@/intro-engine/identity";

const BUCKET = INTRO_SHOW_NAMESPACE.storageBucket;

export function readIntroEngineRuntimeJs(): string {
  const path = join(process.cwd(), "intro-engine/runtime-build/engine.js");
  return readFileSync(path, "utf8");
}

export function introEngineRuntimeHash(engineJs: string): string {
  return sha256BufferHex(engineJs);
}

export function buildIntroRuntimeIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"/>
<style>html,body,#root{margin:0;padding:0;width:100%;height:100%;background:${DIBAY_GREEN};overflow:hidden}</style>
</head>
<body>
<div id="root"></div>
<script src="./engine.js"></script>
</body>
</html>
`;
}

export type SealedIntroPack = {
  identity: {
    engineId: string;
    engineVersion: string;
    engineHash: string;
    revisionId: string;
    documentChecksum: string;
    assetChecksums: Record<string, string>;
    completeness: "complete";
    packChecksum: string;
  };
  engineJs: string;
  indexHtml: string;
  manifest: IntroRuntimeManifest;
  media: Record<string, string>;
};

export async function buildSealedIntroPack(
  sb: SupabaseClient,
  input: { revisionId: string; campaignId: string; document: IntroShowDocument; documentChecksum: string },
): Promise<SealedIntroPack> {
  const engineJs = readIntroEngineRuntimeJs();
  const engineHash = introEngineRuntimeHash(engineJs);
  const media: Record<string, string> = {};
  const manifestMedia: IntroRuntimeManifest["media"] = {};
  const assetChecksums: Record<string, string> = {};

  for (const layer of input.document.scene.layers) {
    const { data: asset, error } = await sb
      .from("intro_show_media_assets")
      .select("runtime_storage_key, width, height, checksum")
      .eq("media_id", layer.mediaId)
      .maybeSingle();
    if (error || !asset) throw new Error("runtime_asset_missing");
    const { data: file, error: dlError } = await sb.storage
      .from(BUCKET)
      .download(String(asset.runtime_storage_key));
    if (dlError || !file) throw new Error("runtime_file_missing");
    const buf = Buffer.from(await file.arrayBuffer());
    const fileName = `${layer.mediaId}.webp`;
    const checksum = sha256BufferHex(buf);
    if (checksum !== String(asset.checksum)) throw new Error("asset_checksum_mismatch");
    media[fileName] = buf.toString("base64");
    assetChecksums[fileName] = checksum;
    manifestMedia[layer.mediaId] = {
      mediaId: layer.mediaId,
      file: fileName,
      width: Number(asset.width),
      height: Number(asset.height),
      checksum,
    };
  }

  const manifest: IntroRuntimeManifest = {
    revisionId: input.revisionId,
    documentVersion: input.document.version,
    engineId: INTRO_ENGINE_ID,
    engineVersion: INTRO_ENGINE_VERSION,
    engineHash,
    document: input.document,
    documentChecksum: input.documentChecksum,
    media: manifestMedia,
    completeness: "complete",
  };

  const identityBody = JSON.stringify({
    engineId: INTRO_ENGINE_ID,
    engineVersion: INTRO_ENGINE_VERSION,
    engineHash,
    revisionId: input.revisionId,
    documentChecksum: input.documentChecksum,
    assetChecksums,
    completeness: "complete",
  });
  const packChecksum = sha256BufferHex(identityBody);

  return {
    identity: {
      engineId: INTRO_ENGINE_ID,
      engineVersion: INTRO_ENGINE_VERSION,
      engineHash,
      revisionId: input.revisionId,
      documentChecksum: input.documentChecksum,
      assetChecksums,
      completeness: "complete",
      packChecksum,
    },
    engineJs,
    indexHtml: buildIntroRuntimeIndexHtml(),
    manifest,
    media,
  };
}

export async function loadLiveIntroPack(sb: SupabaseClient): Promise<SealedIntroPack | null> {
  const { data: live, error } = await sb
    .from("intro_show_live")
    .select("revision_id, campaign_id")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!live?.revision_id) return null;
  const { data: revision, error: revError } = await sb
    .from("intro_show_revisions")
    .select("id, campaign_id, document, document_checksum")
    .eq("id", live.revision_id)
    .maybeSingle();
  if (revError) throw new Error(revError.message);
  if (!revision) return null;
  const document = parseIntroShowDocument(revision.document);
  if (!document) throw new Error("live_document_invalid");
  return buildSealedIntroPack(sb, {
    revisionId: String(revision.id),
    campaignId: String(revision.campaign_id),
    document,
    documentChecksum: String(revision.document_checksum),
  });
}

export function publicRuntimeFromPack(pack: SealedIntroPack) {
  return {
    revisionId: pack.identity.revisionId,
    documentVersion: pack.manifest.documentVersion,
    engineId: pack.identity.engineId,
    engineVersion: pack.identity.engineVersion,
    engineHash: pack.identity.engineHash,
    document: pack.manifest.document,
    documentChecksum: pack.identity.documentChecksum,
    media: pack.manifest.media,
    completeness: "complete" as const,
    packChecksum: pack.identity.packChecksum,
  };
}
