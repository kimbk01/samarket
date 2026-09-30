import type { SupabaseClient } from "@supabase/supabase-js";
import { startupEnvelopeStoragePath } from "@/lib/intro/live/apply-intent";
import {
  evaluateOwnerLiveContentClass,
  ownerLiveForbiddenError,
} from "@/lib/intro/live/owner-live-eligibility";

const BUCKET = "dibay-intro";

export type LivePackageAuthority =
  | "StartupPackageEnvelope"
  | "IntroRuntimePackageV1_LEGACY";

export type LiveStatus =
  | { kind: "NO_LIVE" }
  | {
      kind: "LIVE";
      releaseId: string;
      packageId: string;
      packageIntegrity: string;
      /**
       * Canonical runtime package authority for P7/native.
       * When StartupPackageEnvelope is present it is the only active package shape.
       */
      packageAuthority: LivePackageAuthority;
      /** Signed URL for StartupPackageEnvelope when stored (canonical). */
      envelopeRetrievalUrl: string | null;
      /**
       * LEGACY_COMPAT Intro-shaped pack.json — sealed asset layout / transitional
       * retrieval only. Must not be treated as an alternate package authority.
       */
      packRetrievalUrl: string;
      legacyIntroPackClassification: "LEGACY_COMPAT";
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
    schemaVersion?: number;
  };
  for (const mediaId of Object.keys(packJson.assets ?? {})) {
    if (!assetRetrievalUrls[mediaId]) {
      throw new Error(`asset_url_missing_for_pack_asset:${mediaId}`);
    }
  }

  // Canonical package = StartupPackageEnvelope when present on storage.
  const envelopePath = startupEnvelopeStoragePath(pack.pack_id);
  const { data: envelopeSigned } = await sb.storage
    .from(pack.storage_bucket || BUCKET)
    .createSignedUrl(envelopePath, 60 * 30);
  let packageAuthority: LivePackageAuthority = "IntroRuntimePackageV1_LEGACY";
  let envelopeRetrievalUrl: string | null = null;
  if (envelopeSigned?.signedUrl) {
    const { data: envBlob } = await sb.storage
      .from(pack.storage_bucket || BUCKET)
      .download(envelopePath);
    if (envBlob) {
      try {
        const envJson = JSON.parse(await envBlob.text()) as {
          schemaVersion?: number;
          integrity?: string;
        };
        if (envJson.schemaVersion === 14 && typeof envJson.integrity === "string") {
          packageAuthority = "StartupPackageEnvelope";
          envelopeRetrievalUrl = envelopeSigned.signedUrl;
        }
      } catch {
        /* keep legacy until next Apply stores envelope */
      }
    }
  }

  return {
    kind: "LIVE",
    releaseId: data.published_revision_id,
    packageId: pack.pack_id,
    packageIntegrity: pack.manifest_integrity,
    packageAuthority,
    envelopeRetrievalUrl,
    packRetrievalUrl: signed.signedUrl,
    legacyIntroPackClassification: "LEGACY_COMPAT",
    assetRetrievalUrls,
  };
}

/**
 * Canonical Owner Live mutation primitive.
 *
 * ANY caller (including service-role QA) must pass persisted OWNER eligibility.
 * Caller-supplied contentClass is ignored — authority is
 * revision → document.content_class.
 */
export async function setLiveRelease(
  sb: SupabaseClient,
  args: {
    releaseId: string;
    userId: string;
    /**
     * When set, Apply fail-closes unless the release was published from this
     * draft version — prevents applying a stale release after draft edits.
     */
    expectedSourceDraftVersion?: number;
    /**
     * Ignored if present. Callers cannot spoof OWNER; eligibility is derived
     * from persisted document.content_class only.
     */
    contentClass?: string;
  },
): Promise<LiveStatus> {
  const { data: rev, error: revErr } = await sb
    .from("app_intro_revisions")
    .select(
      "published_revision_id, pack_id, publish_state, source_draft_version, document_id",
    )
    .eq("published_revision_id", args.releaseId)
    .maybeSingle();
  if (revErr) throw new Error(revErr.message);
  if (!rev) {
    throw new Error("release_not_found");
  }
  if (rev.publish_state !== "COMMITTED" || !rev.pack_id) {
    throw new Error("release_not_committed");
  }
  if (!rev.document_id) {
    throw ownerLiveForbiddenError("missing_document");
  }

  const { data: doc, error: docErr } = await sb
    .from("app_intro_documents")
    .select("document_id, content_class")
    .eq("document_id", rev.document_id)
    .maybeSingle();
  if (docErr) throw new Error(docErr.message);
  if (!doc) {
    throw ownerLiveForbiddenError("missing_document");
  }

  // Authoritative persisted class only — ignore args.contentClass spoof.
  void args.contentClass;
  const eligibility = evaluateOwnerLiveContentClass(doc.content_class);
  if (!eligibility.ok) {
    throw ownerLiveForbiddenError(eligibility.contentClass);
  }

  if (
    typeof args.expectedSourceDraftVersion === "number" &&
    rev.source_draft_version !== args.expectedSourceDraftVersion
  ) {
    const err = new Error("stale_release_for_current_draft");
    (err as Error & { status: number }).status = 409;
    throw err;
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
  latestReleaseSourceDraftVersion: number | null;
  /** True when current saved draft has a matching committed publish. */
  draftMatchesLatestRelease: boolean;
  /** True when Live pointer equals this document's latest release. */
  liveMatchesLatestRelease: boolean;
  liveReleaseId: string | null;
  /** This document owns the current SERVER Live pointer (content may still lag draft). */
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
    .select("published_revision_id, source_draft_version")
    .eq("document_id", documentId)
    .eq("publish_state", "COMMITTED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const live = await getLiveStatus(sb);
  const liveReleaseId = live.kind === "LIVE" ? live.releaseId : null;
  const latestReleaseId = latest?.published_revision_id ?? null;
  const latestReleaseSourceDraftVersion =
    typeof latest?.source_draft_version === "number"
      ? latest.source_draft_version
      : null;
  const draftMatchesLatestRelease =
    latestReleaseSourceDraftVersion != null &&
    latestReleaseSourceDraftVersion === doc.draft_version;
  const liveMatchesLatestRelease =
    Boolean(latestReleaseId) && liveReleaseId === latestReleaseId;

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
    latestReleaseId,
    latestReleaseSourceDraftVersion,
    draftMatchesLatestRelease,
    liveMatchesLatestRelease,
    liveReleaseId,
    isLive,
  };
}
