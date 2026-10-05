import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperatorDraftEdit, OperatorDraftRecord, OperatorNormalizedArticle } from "./types";
import { defaultOperatorDraftEdit } from "./draft-apply";

export const OPERATOR_IMPORT_DRAFTS_TABLE = "community_operator_import_drafts";

type DraftRow = {
  id: string;
  source_site: string;
  source_board: string;
  source_article_key: string;
  canonical_url: string;
  original_json: OperatorNormalizedArticle;
  edit_json: OperatorDraftEdit;
  status: "draft" | "published";
  published_post_id: string | null;
  updated_at: string;
};

function mapRow(row: DraftRow): OperatorDraftRecord {
  return {
    id: row.id,
    sourceSite: row.source_site,
    sourceBoard: row.source_board,
    sourceArticleKey: row.source_article_key,
    canonicalUrl: row.canonical_url,
    original: row.original_json,
    edit: row.edit_json,
    status: row.status,
    publishedPostId: row.published_post_id,
    updatedAt: row.updated_at,
  };
}

/**
 * Save an operator draft. A previously published draft keeps `published` + its post id
 * (saving edits never detaches provenance); the inbox row moves to `draft` only when unreviewed.
 */
export async function upsertOperatorImportDraft(
  sb: SupabaseClient,
  input: {
    original: OperatorNormalizedArticle;
    edit: OperatorDraftEdit;
    updatedBy: string;
  },
): Promise<OperatorDraftRecord> {
  const { original, edit, updatedBy } = input;
  const key = {
    sourceSite: original.sourceSite,
    sourceBoard: original.sourceBoard,
    sourceArticleKey: original.sourceArticleKey,
  };
  const prev = await loadOperatorImportDraft(sb, key);
  const payload = {
    source_site: original.sourceSite,
    source_board: original.sourceBoard,
    source_article_key: original.sourceArticleKey,
    canonical_url: original.canonicalUrl,
    original_json: original,
    edit_json: edit,
    status: prev?.status === "published" ? ("published" as const) : ("draft" as const),
    published_post_id: prev?.publishedPostId ?? null,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from(OPERATOR_IMPORT_DRAFTS_TABLE)
    .upsert(payload, { onConflict: "source_site,source_board,source_article_key" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "operator_import_draft_upsert_failed");
  }
  await sb
    .from("community_operator_import_inbox")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("source_site", key.sourceSite)
    .eq("source_board", key.sourceBoard)
    .eq("source_article_key", key.sourceArticleKey)
    .in("status", ["new", "failed"]);
  return mapRow(data as DraftRow);
}

export async function loadOperatorImportDraft(
  sb: SupabaseClient,
  input: { sourceSite: string; sourceBoard: string; sourceArticleKey: string },
): Promise<OperatorDraftRecord | null> {
  const { data, error } = await sb
    .from(OPERATOR_IMPORT_DRAFTS_TABLE)
    .select("*")
    .eq("source_site", input.sourceSite)
    .eq("source_board", input.sourceBoard)
    .eq("source_article_key", input.sourceArticleKey)
    .maybeSingle();
  if (error) {
    const m = String(error.message || "").toLowerCase();
    if (m.includes("does not exist") || m.includes("schema cache")) {
      throw new Error("operator_import_drafts_table_missing");
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapRow(data as DraftRow);
}

export function ensureDraftEdit(
  article: OperatorNormalizedArticle,
  edit: OperatorDraftEdit | null | undefined,
): OperatorDraftEdit {
  const base = defaultOperatorDraftEdit(article);
  if (!edit) return base;
  return {
    ...base,
    ...edit,
    imageIncludes: { ...base.imageIncludes, ...(edit.imageIncludes || {}) },
    blockExcludes: { ...(base.blockExcludes || {}), ...(edit.blockExcludes || {}) },
    textOverrides: { ...(base.textOverrides || {}), ...(edit.textOverrides || {}) },
    imageOrder: Array.isArray(edit.imageOrder) && edit.imageOrder.length ? edit.imageOrder : base.imageOrder,
    thumbnailImageIndex:
      edit.thumbnailImageIndex !== undefined ? edit.thumbnailImageIndex : base.thumbnailImageIndex,
  };
}

/**
 * Carry operator edits onto a re-fetched article. Index-based edits (image include/order,
 * block excludes, text overrides) are only kept when the block structure is unchanged.
 */
export function carryEditToArticle(
  prevEdit: OperatorDraftEdit,
  prevArticle: OperatorNormalizedArticle,
  next: OperatorNormalizedArticle,
): OperatorDraftEdit {
  const sameShape =
    prevArticle.orderedContentBlocks.length === next.orderedContentBlocks.length &&
    prevArticle.orderedContentBlocks.every((b, i) => b.type === next.orderedContentBlocks[i]?.type);
  const base = sameShape ? ensureDraftEdit(next, prevEdit) : defaultOperatorDraftEdit(next);
  const titleEdited = prevEdit.displayTitle && prevEdit.displayTitle !== prevArticle.title;
  return {
    ...base,
    displayTitle: titleEdited ? prevEdit.displayTitle : next.title,
    displayAuthor: prevEdit.displayAuthor || base.displayAuthor,
    topicId: prevEdit.topicId,
    topicSlug: prevEdit.topicSlug,
    summaryText: prevEdit.summaryText,
    contentPolicy: prevEdit.contentPolicy,
    replaceFrom: prevEdit.replaceFrom,
    replaceTo: prevEdit.replaceTo,
  };
}
