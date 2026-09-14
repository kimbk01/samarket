import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type { OperatorListRow } from "./types";

export const OPERATOR_IMPORT_INBOX_TABLE = "community_operator_import_inbox";

export type InboxStatus = "new" | "draft" | "published" | "source_updated" | "failed";

export type InboxRow = {
  sourceSite: string;
  sourceBoard: string;
  sourceArticleKey: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  sourcePublishedAt: string | null;
  thumbnailUrl: string | null;
  fingerprint: string;
  status: InboxStatus;
  publishedPostId: string | null;
  lastError: string | null;
};

export function fingerprintListRow(row: OperatorListRow): string {
  return createHash("sha1")
    .update(
      [row.articleKey, row.title, row.author || "", row.sourcePublishedDate || "", row.thumbnailUrl || ""].join("|"),
    )
    .digest("hex");
}

export async function upsertInboxRowsFromList(
  sb: SupabaseClient,
  input: {
    sourceSite: string;
    sourceBoard: string;
    rows: OperatorListRow[];
  },
): Promise<Map<string, InboxRow>> {
  const out = new Map<string, InboxRow>();
  for (const row of input.rows) {
    const fp = fingerprintListRow(row);
    const { data: existing } = await sb
      .from(OPERATOR_IMPORT_INBOX_TABLE)
      .select("fingerprint, status, published_post_id, last_error")
      .eq("source_site", input.sourceSite)
      .eq("source_board", input.sourceBoard)
      .eq("source_article_key", row.articleKey)
      .maybeSingle();

    let status: InboxStatus = "new";
    let publishedPostId: string | null = null;
    if (existing) {
      publishedPostId = (existing as { published_post_id?: string | null }).published_post_id || null;
      const prevStatus = String((existing as { status?: string }).status || "new") as InboxStatus;
      const prevFp = String((existing as { fingerprint?: string }).fingerprint || "");
      if (prevStatus === "published" || publishedPostId) status = "published";
      else if (prevStatus === "draft") status = "draft";
      else if (prevFp && prevFp !== fp) status = "source_updated";
      else status = prevStatus === "failed" ? "new" : prevStatus;
    }

    const payload = {
      source_site: input.sourceSite,
      source_board: input.sourceBoard,
      source_article_key: row.articleKey,
      canonical_url: row.detailUrl,
      title: row.title,
      author: row.author,
      source_published_at: row.sourcePublishedDate,
      thumbnail_url: row.thumbnailUrl,
      fingerprint: fp,
      status,
      published_post_id: publishedPostId,
      last_error: null,
      collected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from(OPERATOR_IMPORT_INBOX_TABLE).upsert(payload, {
      onConflict: "source_site,source_board,source_article_key",
    });
    if (error) {
      // table may not exist yet — caller treats as best-effort
      throw error;
    }

    out.set(row.articleKey, {
      sourceSite: input.sourceSite,
      sourceBoard: input.sourceBoard,
      sourceArticleKey: row.articleKey,
      canonicalUrl: row.detailUrl,
      title: row.title,
      author: row.author,
      sourcePublishedAt: row.sourcePublishedDate,
      thumbnailUrl: row.thumbnailUrl,
      fingerprint: fp,
      status,
      publishedPostId,
      lastError: null,
    });
  }
  return out;
}

export async function loadInboxStatesForBoard(
  sb: SupabaseClient,
  input: { sourceSite: string; sourceBoard: string; articleKeys: string[] },
): Promise<Map<string, InboxRow>> {
  const map = new Map<string, InboxRow>();
  if (!input.articleKeys.length) return map;
  const { data, error } = await sb
    .from(OPERATOR_IMPORT_INBOX_TABLE)
    .select("*")
    .eq("source_site", input.sourceSite)
    .eq("source_board", input.sourceBoard)
    .in("source_article_key", input.articleKeys);
  if (error || !Array.isArray(data)) return map;
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const key = String(r.source_article_key || "");
    map.set(key, {
      sourceSite: String(r.source_site || ""),
      sourceBoard: String(r.source_board || ""),
      sourceArticleKey: key,
      canonicalUrl: String(r.canonical_url || ""),
      title: String(r.title || ""),
      author: (r.author as string | null) || null,
      sourcePublishedAt: (r.source_published_at as string | null) || null,
      thumbnailUrl: (r.thumbnail_url as string | null) || null,
      fingerprint: String(r.fingerprint || ""),
      status: String(r.status || "new") as InboxStatus,
      publishedPostId: (r.published_post_id as string | null) || null,
      lastError: (r.last_error as string | null) || null,
    });
  }
  return map;
}
