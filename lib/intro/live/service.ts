/**
 * DIBAY INTRO — V2 canonical Live authority.
 *
 * Set Live / Rollback / Disable against singleton app_intro_live.
 * Points at existing immutable V1 Pack — never rebuilds Pack.
 * CAS via expectedLiveKind + expectedPublishedRevisionId.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AppIntroLiveKind } from "@/lib/intro/db/authority";
import { LiveConflictError, LiveNotFoundError, LiveValidationError } from "./errors";

export type LiveRow = {
  singleton: boolean;
  live_kind: string;
  published_revision_id: string | null;
  pack_id: string | null;
  set_live_at: string | null;
  set_live_by: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
  updated_at: string;
};

export type LiveAuthorityView = {
  liveKind: string;
  publishedRevisionId: string | null;
  packId: string | null;
  setLiveAt: string | null;
  setLiveBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  updatedAt: string;
};

export type LiveCasExpectation = {
  /** Required CAS — current live_kind before mutation. */
  expectedLiveKind: string;
  /**
   * Required CAS — current published_revision_id.
   * Use null for NEVER_CONFIGURED / NO_LIVE_INTRO.
   */
  expectedPublishedRevisionId: string | null;
};

export type CommittedRevisionAuthority = {
  publishedRevisionId: string;
  packId: string;
  packIntegrity: string;
  packStoragePath: string;
  documentId: string;
  sourceDraftVersion: number;
  publishState: string;
  schemaVersion: number;
  protocolVersion: number;
  renderSpecVersion: number;
  fontSpecVersion: number;
};

function asView(row: LiveRow): LiveAuthorityView {
  return {
    liveKind: row.live_kind,
    publishedRevisionId: row.published_revision_id,
    packId: row.pack_id,
    setLiveAt: row.set_live_at,
    setLiveBy: row.set_live_by,
    disabledAt: row.disabled_at,
    disabledBy: row.disabled_by,
    updatedAt: row.updated_at,
  };
}

export async function readLiveRow(sb: SupabaseClient): Promise<LiveRow> {
  const { data, error } = await sb
    .from("app_intro_live")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(`LIVE_READ_FAILED:${error.message}`);
  if (!data) throw new LiveNotFoundError("LIVE_SINGLETON_MISSING");
  return data as LiveRow;
}

export async function getLiveAuthority(
  sb: SupabaseClient,
): Promise<LiveAuthorityView> {
  return asView(await readLiveRow(sb));
}

/**
 * Resolve a committed published revision + its canonical pack.
 * Rejects Draft / PREPARING / FAILED / missing pack.
 */
export async function resolveCommittedRevisionAuthority(
  sb: SupabaseClient,
  publishedRevisionId: string,
): Promise<CommittedRevisionAuthority> {
  if (!publishedRevisionId || typeof publishedRevisionId !== "string") {
    throw new LiveValidationError("INVALID_PUBLISHED_REVISION_ID");
  }

  const { data: rev, error: revErr } = await sb
    .from("app_intro_revisions")
    .select(
      "published_revision_id, document_id, source_draft_version, publish_state, pack_id, schema_version, protocol_version, render_spec_version, font_spec_version",
    )
    .eq("published_revision_id", publishedRevisionId)
    .maybeSingle();
  if (revErr) throw new Error(`REVISION_READ_FAILED:${revErr.message}`);
  if (!rev) throw new LiveNotFoundError("REVISION_NOT_FOUND");

  const publishState = String(rev.publish_state ?? "");
  if (publishState !== "COMMITTED") {
    throw new LiveValidationError(
      "REVISION_NOT_COMMITTED",
      `publish_state=${publishState}`,
    );
  }
  if (!rev.pack_id) {
    throw new LiveValidationError("REVISION_MISSING_PACK");
  }

  const { data: pack, error: packErr } = await sb
    .from("app_intro_packs")
    .select(
      "pack_id, published_revision_id, manifest_integrity, storage_path, schema_version, protocol_version, render_spec_version, font_spec_version",
    )
    .eq("pack_id", rev.pack_id)
    .maybeSingle();
  if (packErr) throw new Error(`PACK_READ_FAILED:${packErr.message}`);
  if (!pack) throw new LiveValidationError("PACK_MISSING");
  if (String(pack.published_revision_id) !== publishedRevisionId) {
    throw new LiveValidationError("PACK_REVISION_MISMATCH");
  }
  if (!pack.storage_path || !String(pack.storage_path).startsWith("authority/v1/packs/")) {
    throw new LiveValidationError("PACK_STORAGE_PATH_INVALID");
  }
  if (!pack.manifest_integrity || !String(pack.manifest_integrity).startsWith("sha256:")) {
    throw new LiveValidationError("PACK_INTEGRITY_INVALID");
  }

  return {
    publishedRevisionId,
    packId: String(pack.pack_id),
    packIntegrity: String(pack.manifest_integrity),
    packStoragePath: String(pack.storage_path),
    documentId: String(rev.document_id),
    sourceDraftVersion: Number(rev.source_draft_version),
    publishState,
    schemaVersion: Number(pack.schema_version ?? rev.schema_version),
    protocolVersion: Number(pack.protocol_version ?? rev.protocol_version),
    renderSpecVersion: Number(pack.render_spec_version ?? rev.render_spec_version),
    fontSpecVersion: Number(pack.font_spec_version ?? rev.font_spec_version),
  };
}

async function assertCas(
  current: LiveRow,
  cas: LiveCasExpectation,
): Promise<void> {
  if (current.live_kind !== cas.expectedLiveKind) {
    throw new LiveConflictError(
      "LIVE_CAS_KIND_MISMATCH",
      `expected=${cas.expectedLiveKind} actual=${current.live_kind}`,
    );
  }
  const actualRev = current.published_revision_id;
  const expectedRev = cas.expectedPublishedRevisionId;
  if (actualRev !== expectedRev) {
    throw new LiveConflictError(
      "LIVE_CAS_REVISION_MISMATCH",
      `expected=${expectedRev} actual=${actualRev}`,
    );
  }
}

/**
 * Set Live to a COMMITTED revision only.
 * Does not mutate published revision. Does not rebuild Pack.
 */
export async function setLiveToCommittedRevision(args: {
  sb: SupabaseClient;
  userId: string;
  publishedRevisionId: string;
  cas: LiveCasExpectation;
  /**
   * When set, revision MUST belong to this documentId.
   * Admin Service Apply always passes current document — do not trust arbitrary UUID.
   */
  expectedDocumentId?: string;
}): Promise<{
  live: LiveAuthorityView;
  authority: CommittedRevisionAuthority;
}> {
  const { sb, userId, publishedRevisionId, cas, expectedDocumentId } = args;
  const authority = await resolveCommittedRevisionAuthority(
    sb,
    publishedRevisionId,
  );
  if (
    expectedDocumentId &&
    authority.documentId !== expectedDocumentId
  ) {
    throw new LiveValidationError(
      "REVISION_DOCUMENT_MISMATCH",
      `expectedDocument=${expectedDocumentId} actual=${authority.documentId}`,
    );
  }
  const current = await readLiveRow(sb);
  await assertCas(current, cas);

  // Idempotent: already pointing at same revision
  if (
    current.live_kind === AppIntroLiveKind.COMMITTED_LIVE &&
    current.published_revision_id === authority.publishedRevisionId &&
    current.pack_id === authority.packId
  ) {
    return { live: asView(current), authority };
  }

  const now = new Date().toISOString();
  let query = sb
    .from("app_intro_live")
    .update({
      live_kind: AppIntroLiveKind.COMMITTED_LIVE,
      published_revision_id: authority.publishedRevisionId,
      pack_id: authority.packId,
      set_live_at: now,
      set_live_by: userId,
      disabled_at: null,
      disabled_by: null,
      updated_at: now,
    })
    .eq("singleton", true)
    .eq("live_kind", cas.expectedLiveKind);

  if (cas.expectedPublishedRevisionId === null) {
    query = query.is("published_revision_id", null);
  } else {
    query = query.eq(
      "published_revision_id",
      cas.expectedPublishedRevisionId,
    );
  }

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(`SET_LIVE_FAILED:${error.message}`);
  if (!data) {
    throw new LiveConflictError("LIVE_CAS_LOST");
  }
  return { live: asView(data as LiveRow), authority };
}

/**
 * Rollback Live to a prior COMMITTED compatible revision.
 * Same mutation surface as Set Live with CAS against current COMMITTED_LIVE.
 */
export async function rollbackLiveToCommittedRevision(args: {
  sb: SupabaseClient;
  userId: string;
  publishedRevisionId: string;
  cas: LiveCasExpectation;
}): Promise<{
  live: LiveAuthorityView;
  authority: CommittedRevisionAuthority;
}> {
  if (args.cas.expectedLiveKind !== AppIntroLiveKind.COMMITTED_LIVE) {
    throw new LiveValidationError(
      "ROLLBACK_REQUIRES_COMMITTED_LIVE_CAS",
    );
  }
  return setLiveToCommittedRevision(args);
}

/**
 * Disable Intro → NO_LIVE_INTRO.
 * Distinct from NEVER_CONFIGURED and from device fetch failure.
 */
export async function disableLiveIntro(args: {
  sb: SupabaseClient;
  userId: string;
  cas: LiveCasExpectation;
}): Promise<LiveAuthorityView> {
  const { sb, userId, cas } = args;
  const current = await readLiveRow(sb);
  await assertCas(current, cas);

  if (current.live_kind === AppIntroLiveKind.NO_LIVE_INTRO) {
    return asView(current);
  }

  const now = new Date().toISOString();
  let query = sb
    .from("app_intro_live")
    .update({
      live_kind: AppIntroLiveKind.NO_LIVE_INTRO,
      published_revision_id: null,
      pack_id: null,
      set_live_at: null,
      set_live_by: null,
      disabled_at: now,
      disabled_by: userId,
      updated_at: now,
    })
    .eq("singleton", true)
    .eq("live_kind", cas.expectedLiveKind);

  if (cas.expectedPublishedRevisionId === null) {
    query = query.is("published_revision_id", null);
  } else {
    query = query.eq(
      "published_revision_id",
      cas.expectedPublishedRevisionId,
    );
  }

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(`DISABLE_LIVE_FAILED:${error.message}`);
  if (!data) throw new LiveConflictError("LIVE_CAS_LOST");
  return asView(data as LiveRow);
}
