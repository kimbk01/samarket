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

export async function upsertOperatorImportDraft(
  sb: SupabaseClient,
  input: {
    original: OperatorNormalizedArticle;
    edit: OperatorDraftEdit;
    updatedBy: string;
  },
): Promise<OperatorDraftRecord> {
  const { original, edit, updatedBy } = input;
  const payload = {
    source_site: original.sourceSite,
    source_board: original.sourceBoard,
    source_article_key: original.sourceArticleKey,
    canonical_url: original.canonicalUrl,
    original_json: original,
    edit_json: edit,
    status: "draft" as const,
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

export async function markOperatorImportDraftPublished(
  sb: SupabaseClient,
  input: {
    sourceSite: string;
    sourceBoard: string;
    sourceArticleKey: string;
    publishedPostId: string;
    edit: OperatorDraftEdit;
  },
): Promise<void> {
  const { error } = await sb
    .from(OPERATOR_IMPORT_DRAFTS_TABLE)
    .update({
      status: "published",
      published_post_id: input.publishedPostId,
      edit_json: input.edit,
      updated_at: new Date().toISOString(),
    })
    .eq("source_site", input.sourceSite)
    .eq("source_board", input.sourceBoard)
    .eq("source_article_key", input.sourceArticleKey);
  if (error) throw new Error(error.message);
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
