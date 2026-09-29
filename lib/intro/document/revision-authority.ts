/**
 * Canonical Intro revision authority for Admin Service Apply.
 *
 * THREE separate authorities — never infer one from another:
 *   1. current Draft
 *   2. latest COMMITTED published revision for THIS documentId
 *   3. current Live revision (global singleton)
 *
 * No hardcoded revision UUID. No session-only fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveAuthority,
  resolveCommittedRevisionAuthority,
  type LiveAuthorityView,
  type CommittedRevisionAuthority,
} from "@/lib/intro/live/service";
import { getIntroDocument } from "@/lib/intro/document/service";

export type PublishedRevisionSummary = {
  publishedRevisionId: string;
  packId: string;
  documentId: string;
  sourceDraftVersion: number;
  publishState: "COMMITTED";
  createdAt: string;
  createdBy: string | null;
};

export type DocumentRevisionAuthority = {
  documentId: string;
  draft: {
    draftVersion: number;
    title: string;
    updatedAt: string;
  };
  /** Latest COMMITTED published revision for THIS document — Service Apply candidate. */
  latestPublished: PublishedRevisionSummary | null;
  /** All COMMITTED revisions for this document, newest first. */
  committedRevisions: PublishedRevisionSummary[];
  /** Global Live singleton. */
  live: LiveAuthorityView;
  /** Live revision detail when Live points at a COMMITTED revision (any document). */
  liveRevision: PublishedRevisionSummary | null;
  /** True when Live publishedRevisionId belongs to THIS documentId. */
  liveBelongsToDocument: boolean;
};

function mapRevisionRow(row: {
  published_revision_id: string;
  document_id: string;
  pack_id: string | null;
  source_draft_version: number;
  publish_state: string;
  created_at: string;
  created_by: string | null;
}): PublishedRevisionSummary | null {
  if (String(row.publish_state) !== "COMMITTED") return null;
  if (!row.pack_id) return null;
  return {
    publishedRevisionId: String(row.published_revision_id),
    packId: String(row.pack_id),
    documentId: String(row.document_id),
    sourceDraftVersion: Number(row.source_draft_version),
    publishState: "COMMITTED",
    createdAt: String(row.created_at),
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

/**
 * List COMMITTED published revisions for a document, newest first.
 * No hardcoded identity. Discovery only.
 */
export async function listCommittedRevisionsForDocument(
  sb: SupabaseClient,
  documentId: string,
): Promise<PublishedRevisionSummary[]> {
  if (!documentId || typeof documentId !== "string") {
    throw new Error("INVALID_DOCUMENT_ID");
  }
  const { data, error } = await sb
    .from("app_intro_revisions")
    .select(
      "published_revision_id, document_id, pack_id, source_draft_version, publish_state, created_at, created_by",
    )
    .eq("document_id", documentId)
    .eq("publish_state", "COMMITTED")
    .not("pack_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`REVISION_LIST_FAILED:${error.message}`);
  const out: PublishedRevisionSummary[] = [];
  for (const row of data ?? []) {
    const mapped = mapRevisionRow(row as Parameters<typeof mapRevisionRow>[0]);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function getLatestCommittedRevisionForDocument(
  sb: SupabaseClient,
  documentId: string,
): Promise<PublishedRevisionSummary | null> {
  const list = await listCommittedRevisionsForDocument(sb, documentId);
  return list[0] ?? null;
}

async function loadRevisionSummaryById(
  sb: SupabaseClient,
  publishedRevisionId: string,
): Promise<PublishedRevisionSummary | null> {
  const { data, error } = await sb
    .from("app_intro_revisions")
    .select(
      "published_revision_id, document_id, pack_id, source_draft_version, publish_state, created_at, created_by",
    )
    .eq("published_revision_id", publishedRevisionId)
    .maybeSingle();
  if (error) throw new Error(`REVISION_READ_FAILED:${error.message}`);
  if (!data) return null;
  return mapRevisionRow(data as Parameters<typeof mapRevisionRow>[0]);
}

/**
 * Canonical Admin authority state for one document.
 * Draft / latestPublished / Live are independent.
 */
export async function getDocumentRevisionAuthority(
  sb: SupabaseClient,
  documentId: string,
): Promise<DocumentRevisionAuthority> {
  const record = await getIntroDocument({ sb, documentId });
  const committedRevisions = await listCommittedRevisionsForDocument(
    sb,
    documentId,
  );
  const live = await getLiveAuthority(sb);
  const liveRevision = live.publishedRevisionId
    ? await loadRevisionSummaryById(sb, live.publishedRevisionId)
    : null;
  const liveBelongsToDocument =
    liveRevision !== null && liveRevision.documentId === documentId;

  return {
    documentId,
    draft: {
      draftVersion: record.draftVersion,
      title: record.title,
      updatedAt: record.updatedAt,
    },
    latestPublished: committedRevisions[0] ?? null,
    committedRevisions,
    live,
    liveRevision,
    liveBelongsToDocument,
  };
}

/**
 * Validate a Service Apply target against the current document.
 * Rejects wrong-document / non-COMMITTED / invalid pack.
 */
export async function assertRevisionEligibleForDocumentLive(args: {
  sb: SupabaseClient;
  documentId: string;
  publishedRevisionId: string;
}): Promise<CommittedRevisionAuthority> {
  const { LiveValidationError } = await import("@/lib/intro/live/errors");
  const authority = await resolveCommittedRevisionAuthority(
    args.sb,
    args.publishedRevisionId,
  );
  if (authority.documentId !== args.documentId) {
    throw new LiveValidationError(
      "REVISION_DOCUMENT_MISMATCH",
      `expectedDocument=${args.documentId} actual=${authority.documentId}`,
    );
  }
  return authority;
}

export {
  humanDraftVersionLabel,
  humanLiveVersionLabel,
  humanPublishedVersionLabel,
} from "./authority-labels";
