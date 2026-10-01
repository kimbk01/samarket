/**
 * DIBAY Intro — server access (service role). Draft / immutable Publication / single Live pointer.
 * Admin routes and the runtime discovery route only. Never imported by client code.
 */
import "server-only";
import { createHash, randomUUID } from "crypto";
import type { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  LAUNCH_INTRO_DRAFT_BUCKET,
  LAUNCH_INTRO_IMAGE_MAX_BYTES,
  LAUNCH_INTRO_IMAGE_MAX_EDGE,
  LAUNCH_INTRO_IMAGE_MIN_EDGE,
  LAUNCH_INTRO_PUBLIC_BUCKET,
  LAUNCH_INTRO_SLICE_ELIGIBILITY,
  launchIntroAssetExtension,
  launchIntroDocumentAssets,
  launchIntroDocumentImageRefs,
  sniffLaunchIntroImage,
  toPublicationDocument,
  validateLaunchIntroDocument,
  type LaunchIntroAsset,
  type LaunchIntroDocument,
  type LaunchIntroEligibility,
  type LaunchIntroImageRef,
  type LaunchIntroLivePayload,
  type LaunchIntroLiveState,
} from "@/lib/launch-intro/document";

export type Sb = ReturnType<typeof getSupabaseServer>;

export type LaunchIntroDraftRow = {
  id: string;
  document: LaunchIntroDocument;
  version: number;
  updated_at: string;
};

export type LaunchIntroPublicationRow = {
  id: string;
  source_draft_id: string | null;
  source_draft_version: number | null;
  document: LaunchIntroDocument;
  assets: LaunchIntroAsset[];
  eligibility: LaunchIntroEligibility;
  created_at: string;
};

export type LaunchIntroLiveRow = {
  publication_id: string | null;
  state: LaunchIntroLiveState;
  revision: number;
  updated_at: string;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; status?: number };

/**
 * Stored documents may be schema v1 (first slice) or v2. Every server reader returns v2 through the
 * one validator; immutable rows are never rewritten. Invalid stored data is surfaced, not repaired.
 */
function normalizeStored<T extends { document: unknown }>(
  row: T,
  mode: "draft" | "publication"
): (Omit<T, "document"> & { document: LaunchIntroDocument }) | null {
  const v = validateLaunchIntroDocument(row.document, mode);
  return v.ok ? { ...row, document: v.document } : null;
}

export async function loadLaunchIntroLive(sb: Sb): Promise<Result<{ live: LaunchIntroLiveRow }>> {
  const { data, error } = await sb
    .from("launch_intro_live")
    .select("publication_id, state, revision, updated_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "live_row_missing" };
  const row = data as LaunchIntroLiveRow;
  return { ok: true, live: { ...row, revision: Number(row.revision) } };
}

export async function loadLaunchIntroPublication(
  sb: Sb,
  id: string
): Promise<Result<{ publication: LaunchIntroPublicationRow | null }>> {
  const { data, error } = await sb
    .from("launch_intro_publications")
    .select("id, source_draft_id, source_draft_version, document, assets, eligibility, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, publication: null };
  const pub = normalizeStored(data as LaunchIntroPublicationRow, "publication");
  if (!pub) return { ok: false, error: "publication_document_invalid" };
  return { ok: true, publication: pub };
}

export async function listLaunchIntroPublications(
  sb: Sb,
  limit = 20
): Promise<Result<{ publications: LaunchIntroPublicationRow[] }>> {
  const { data, error } = await sb
    .from("launch_intro_publications")
    .select("id, source_draft_id, source_draft_version, document, assets, eligibility, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const publications: LaunchIntroPublicationRow[] = [];
  for (const row of (data as LaunchIntroPublicationRow[]) ?? []) {
    const pub = normalizeStored(row, "publication");
    if (!pub) return { ok: false, error: "publication_document_invalid" };
    publications.push(pub);
  }
  return { ok: true, publications };
}

export function launchIntroPublicAssetUrl(sb: Sb, path: string): string {
  return sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Runtime discovery payload: Live state + (when it points at one) the immutable publication. */
export async function buildLaunchIntroLivePayload(sb: Sb): Promise<Result<{ payload: LaunchIntroLivePayload }>> {
  const live = await loadLaunchIntroLive(sb);
  if (!live.ok) return live;
  let publication: LaunchIntroLivePayload["publication"] = null;
  if (live.live.publication_id) {
    const pub = await loadLaunchIntroPublication(sb, live.live.publication_id);
    if (!pub.ok) return pub;
    if (pub.publication) {
      publication = {
        id: pub.publication.id,
        document: pub.publication.document,
        eligibility: pub.publication.eligibility,
        assets: pub.publication.assets.map((a) => ({ ...a, url: launchIntroPublicAssetUrl(sb, a.path) })),
      };
    }
  }
  return {
    ok: true,
    payload: { ok: true, revision: live.live.revision, state: live.live.state, publication },
  };
}

/** The single working draft (slice): most recently updated. */
export async function loadLatestLaunchIntroDraft(sb: Sb): Promise<Result<{ draft: LaunchIntroDraftRow | null }>> {
  const { data, error } = await sb
    .from("launch_intro_drafts")
    .select("id, document, version, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, draft: null };
  const draft = normalizeStored(data as LaunchIntroDraftRow, "draft");
  if (!draft) return { ok: false, error: "draft_document_invalid" };
  return { ok: true, draft };
}

export async function loadLaunchIntroDraft(sb: Sb, id: string): Promise<Result<{ draft: LaunchIntroDraftRow | null }>> {
  const { data, error } = await sb
    .from("launch_intro_drafts")
    .select("id, document, version, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, draft: null };
  const draft = normalizeStored(data as LaunchIntroDraftRow, "draft");
  if (!draft) return { ok: false, error: "draft_document_invalid" };
  return { ok: true, draft };
}

/** Create (no id) or save with optimistic concurrency (expectedVersion must match). */
export async function saveLaunchIntroDraft(
  sb: Sb,
  input: { id: string | null; expectedVersion: number | null; document: unknown; actor: string | null }
): Promise<Result<{ draft: LaunchIntroDraftRow }>> {
  const v = validateLaunchIntroDocument(input.document, "draft");
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  const now = new Date().toISOString();
  if (!input.id) {
    const { data, error } = await sb
      .from("launch_intro_drafts")
      .insert({ document: v.document, version: 1, updated_at: now, updated_by: input.actor })
      .select("id, document, version, updated_at")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "create_failed" };
    return { ok: true, draft: data as LaunchIntroDraftRow };
  }
  if (!Number.isInteger(input.expectedVersion)) return { ok: false, error: "version_required", status: 400 };
  const { data, error } = await sb
    .from("launch_intro_drafts")
    .update({
      document: v.document,
      version: (input.expectedVersion as number) + 1,
      updated_at: now,
      updated_by: input.actor,
    })
    .eq("id", input.id)
    .eq("version", input.expectedVersion as number)
    .select("id, document, version, updated_at")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "version_conflict", status: 409 };
  return { ok: true, draft: data as LaunchIntroDraftRow };
}

/** DELETE = draft only (contract §7). Removes the draft row and its private uploads. */
export async function deleteLaunchIntroDraft(sb: Sb, id: string): Promise<Result<object>> {
  const loaded = await loadLaunchIntroDraft(sb, id);
  if (!loaded.ok) return loaded;
  if (!loaded.draft) return { ok: false, error: "draft_not_found", status: 404 };
  const paths = launchIntroDocumentImageRefs(loaded.draft.document)
    .map((ref) => ref.draftPath)
    .filter((p): p is string => typeof p === "string");
  const { error } = await sb.from("launch_intro_drafts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (paths.length) await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).remove(paths);
  return { ok: true };
}

/** Private draft image upload. Returns the image reference to put into the draft document. */
export async function uploadLaunchIntroDraftImage(
  sb: Sb,
  bytes: Uint8Array
): Promise<Result<{ image: LaunchIntroImageRef }>> {
  if (bytes.length === 0) return { ok: false, error: "empty", status: 400 };
  if (bytes.length > LAUNCH_INTRO_IMAGE_MAX_BYTES) return { ok: false, error: "too_big_bytes", status: 400 };
  const info = sniffLaunchIntroImage(bytes);
  if (!info) return { ok: false, error: "unsupported_image", status: 400 };
  for (const edge of [info.width, info.height]) {
    if (edge < LAUNCH_INTRO_IMAGE_MIN_EDGE) return { ok: false, error: "too_small", status: 400 };
    if (edge > LAUNCH_INTRO_IMAGE_MAX_EDGE) return { ok: false, error: "too_big_dimensions", status: 400 };
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const draftPath = `draft/${randomUUID()}.${launchIntroAssetExtension(info.mime)}`;
  const { error } = await sb.storage
    .from(LAUNCH_INTRO_DRAFT_BUCKET)
    .upload(draftPath, bytes, { contentType: info.mime, upsert: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    image: { sha256, mime: info.mime, bytes: bytes.length, width: info.width, height: info.height, draftPath },
  };
}

export async function signLaunchIntroDraftImage(sb: Sb, draftPath: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).createSignedUrl(draftPath, 60 * 10);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * PUBLISH (contract §3): validate → copy draft images to content-addressed public paths
 * (sha verified) → one DB transaction: immutable publication (idempotent per draft version) + Live.
 */
export async function publishLaunchIntroDraft(
  sb: Sb,
  input: { draftId: string; expectedVersion: number; actor: string | null }
): Promise<Result<{ live: LaunchIntroLiveRow & { publication_id: string } }>> {
  const loaded = await loadLaunchIntroDraft(sb, input.draftId);
  if (!loaded.ok) return loaded;
  const draft = loaded.draft;
  if (!draft) return { ok: false, error: "draft_not_found", status: 404 };
  if (draft.version !== input.expectedVersion) return { ok: false, error: "version_conflict", status: 409 };

  const asDraft = validateLaunchIntroDocument(draft.document, "draft");
  if (!asDraft.ok) return { ok: false, error: asDraft.error, status: 400 };
  const pubDoc = toPublicationDocument(asDraft.document);
  const asPub = validateLaunchIntroDocument(pubDoc, "publication");
  if (!asPub.ok) return { ok: false, error: asPub.error, status: 400 };

  for (const img of launchIntroDocumentImageRefs(asDraft.document)) {
    if (!img.draftPath) continue;
    const dl = await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).download(img.draftPath);
    if (dl.error || !dl.data) return { ok: false, error: "draft_image_missing" };
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== img.sha256 || bytes.length !== img.bytes) return { ok: false, error: "draft_image_sha_mismatch" };
    const pubPath = `pub/${img.sha256}.${launchIntroAssetExtension(img.mime)}`;
    const up = await sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).upload(pubPath, bytes, {
      contentType: img.mime,
      cacheControl: "31536000",
      upsert: false,
    });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) {
      return { ok: false, error: `asset_copy_failed: ${up.error.message}` };
    }
  }

  const { data, error } = await sb.rpc("launch_intro_publish", {
    p_draft_id: draft.id,
    p_draft_version: draft.version,
    p_document: asPub.document,
    p_assets: launchIntroDocumentAssets(asPub.document),
    p_eligibility: LAUNCH_INTRO_SLICE_ELIGIBILITY,
    p_actor: input.actor,
  });
  if (error) return { ok: false, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { publication_id: string; revision: number; state: LaunchIntroLiveState }
    | undefined;
  if (!row?.publication_id) return { ok: false, error: "publish_failed" };
  return {
    ok: true,
    live: {
      publication_id: row.publication_id,
      state: row.state,
      revision: Number(row.revision),
      updated_at: new Date().toISOString(),
    },
  };
}

export type LaunchIntroStateAction = "pause" | "resume" | "unpublish" | "reactivate";

/** LIVE STATE MACHINE (contract §7). Rejected transitions → 409. */
export async function setLaunchIntroLiveState(
  sb: Sb,
  input: { action: LaunchIntroStateAction; publicationId: string | null; actor: string | null }
): Promise<Result<object>> {
  const { error } = await sb.rpc("launch_intro_set_state", {
    p_action: input.action,
    p_publication_id: input.publicationId,
    p_actor: input.actor,
  });
  if (error) {
    if (/transition_rejected/.test(error.message)) return { ok: false, error: "transition_rejected", status: 409 };
    if (/publication_not_found/.test(error.message)) return { ok: false, error: "publication_not_found", status: 404 };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
