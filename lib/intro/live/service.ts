import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "dibay-intro";

export type LiveStatus =
  | { kind: "NO_LIVE" }
  | {
      kind: "LIVE";
      releaseId: string;
      packageId: string;
      packageIntegrity: string;
      packRetrievalUrl: string;
      /** Fresh signed URLs for sealed pack assets keyed by mediaId. */
      assetRetrievalUrls: Record<string, string>;
    };

export async function getLiveStatus(sb: SupabaseClient): Promise<LiveStatus> {
  const { data, error } = await sb
    .from("app_intro_live")
    .select("live_kind, published_revision_id, pack_id")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.live_kind !== "COMMITTED_LIVE" || !data.pack_id || !data.published_revision_id) {
    return { kind: "NO_LIVE" };
  }

  const { data: pack, error: packErr } = await sb
    .from("app_intro_packs")
    .select("pack_id, manifest_integrity, storage_path, storage_bucket")
    .eq("pack_id", data.pack_id)
    .maybeSingle();
  if (packErr) throw new Error(packErr.message);
  if (!pack) return { kind: "NO_LIVE" };

  const { data: signed, error: signErr } = await sb.storage
    .from(pack.storage_bucket || BUCKET)
    .createSignedUrl(pack.storage_path, 60 * 30);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`signed_url:${signErr?.message ?? "missing"}`);
  }

  // Sign sealed asset storage paths (authority/v1/sealed/…) — not pack-relative.
  const { data: sealedRows, error: sealedErr } = await sb
    .from("app_intro_sealed_assets")
    .select("media_id, storage_bucket, storage_path")
    .eq("published_revision_id", data.published_revision_id);
  if (sealedErr) throw new Error(sealedErr.message);

  const assetRetrievalUrls: Record<string, string> = {};
  for (const row of sealedRows ?? []) {
    const mediaId = row.media_id as string | null;
    const storagePath = row.storage_path as string | null;
    if (!mediaId || !storagePath) continue;
    const { data: assetSigned, error: assetSignErr } = await sb.storage
      .from(row.storage_bucket || pack.storage_bucket || BUCKET)
      .createSignedUrl(storagePath, 60 * 30);
    if (assetSignErr || !assetSigned?.signedUrl) {
      throw new Error(`asset_signed_url:${mediaId}:${assetSignErr?.message ?? "missing"}`);
    }
    assetRetrievalUrls[mediaId] = assetSigned.signedUrl;
  }

  // Fail closed: every pack asset must have a retrieval URL.
  const { data: packBlob, error: packDlErr } = await sb.storage
    .from(pack.storage_bucket || BUCKET)
    .download(pack.storage_path);
  if (packDlErr || !packBlob) {
    throw new Error(`pack_download:${packDlErr?.message ?? "missing"}`);
  }
  const packJson = JSON.parse(await packBlob.text()) as {
    assets?: Record<string, unknown>;
  };
  for (const mediaId of Object.keys(packJson.assets ?? {})) {
    if (!assetRetrievalUrls[mediaId]) {
      throw new Error(`asset_url_missing_for_pack_asset:${mediaId}`);
    }
  }

  return {
    kind: "LIVE",
    releaseId: data.published_revision_id,
    packageId: pack.pack_id,
    packageIntegrity: pack.manifest_integrity,
    packRetrievalUrl: signed.signedUrl,
    assetRetrievalUrls,
  };
}

export async function setLiveRelease(
  sb: SupabaseClient,
  args: { releaseId: string; userId: string },
): Promise<LiveStatus> {
  const { data: rev, error: revErr } = await sb
    .from("app_intro_revisions")
    .select("published_revision_id, pack_id, publish_state")
    .eq("published_revision_id", args.releaseId)
    .maybeSingle();
  if (revErr) throw new Error(revErr.message);
  if (!rev || rev.publish_state !== "COMMITTED" || !rev.pack_id) {
    throw new Error("release_not_committed");
  }

  const { error } = await sb.from("app_intro_live").upsert(
    {
      singleton: true,
      live_kind: "COMMITTED_LIVE",
      published_revision_id: rev.published_revision_id,
      pack_id: rev.pack_id,
      set_live_at: new Date().toISOString(),
      set_live_by: args.userId,
      disabled_at: null,
      disabled_by: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "singleton" },
  );
  if (error) throw new Error(error.message);
  return getLiveStatus(sb);
}

export async function getDocumentAuthority(
  sb: SupabaseClient,
  documentId: string,
): Promise<{
  draftVersion: number;
  latestReleaseId: string | null;
  liveReleaseId: string | null;
  isLive: boolean;
}> {
  const { data: doc } = await sb
    .from("app_intro_documents")
    .select("draft_version")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("document_not_found");

  const { data: latest } = await sb
    .from("app_intro_revisions")
    .select("published_revision_id")
    .eq("document_id", documentId)
    .eq("publish_state", "COMMITTED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const live = await getLiveStatus(sb);
  const liveReleaseId = live.kind === "LIVE" ? live.releaseId : null;

  let isLive = false;
  if (liveReleaseId) {
    const { data: liveRev } = await sb
      .from("app_intro_revisions")
      .select("document_id")
      .eq("published_revision_id", liveReleaseId)
      .maybeSingle();
    isLive = liveRev?.document_id === documentId;
  }

  return {
    draftVersion: doc.draft_version,
    latestReleaseId: latest?.published_revision_id ?? null,
    liveReleaseId,
    isLive,
  };
}
