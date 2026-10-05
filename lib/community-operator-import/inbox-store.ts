/**
 * INBOX: every collected list row lands here (never auto-published).
 * Batch upsert (1 read + 1 write per board page) that preserves operator state:
 * published/draft/hidden/skipped survive re-collection; a changed fingerprint marks `source_updated`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type { OperatorListRow, QualityVerdict } from "./types";

export const INBOX_TABLE = "community_operator_import_inbox";

export type InboxStatus = "new" | "draft" | "published" | "source_updated" | "failed" | "hidden" | "skipped";
export const INBOX_STATUSES: InboxStatus[] = ["new", "draft", "published", "source_updated", "failed", "hidden", "skipped"];

export type InboxRow = {
  sourceSite: string;
  sourceBoard: string;
  sourceArticleKey: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  sourcePublishedAt: string | null;
  thumbnailUrl: string | null;
  summary: string | null;
  fingerprint: string;
  status: InboxStatus;
  publishedPostId: string | null;
  lastError: string | null;
  quality: QualityVerdict | null;
  qualityReasons: string[];
  firstSeenAt: string | null;
  lastChangedAt: string | null;
  collectedAt: string | null;
};

export function fingerprintListRow(row: OperatorListRow): string {
  return createHash("sha1")
    .update([row.articleKey, row.title, row.author || "", row.sourcePublishedDate || "", row.thumbnailUrl || ""].join("|"))
    .digest("hex");
}

export function mapInboxRow(r: Record<string, unknown>): InboxRow {
  const reasons = Array.isArray(r.quality_reasons) ? (r.quality_reasons as unknown[]).map(String) : [];
  const q = String(r.quality || "");
  return {
    sourceSite: String(r.source_site || ""),
    sourceBoard: String(r.source_board || ""),
    sourceArticleKey: String(r.source_article_key || ""),
    canonicalUrl: String(r.canonical_url || ""),
    title: String(r.title || ""),
    author: (r.author as string | null) || null,
    sourcePublishedAt: (r.source_published_at as string | null) || null,
    thumbnailUrl: (r.thumbnail_url as string | null) || null,
    summary: (r.summary as string | null) || null,
    fingerprint: String(r.fingerprint || ""),
    status: (INBOX_STATUSES.includes(String(r.status) as InboxStatus) ? String(r.status) : "new") as InboxStatus,
    publishedPostId: (r.published_post_id as string | null) || null,
    lastError: (r.last_error as string | null) || null,
    quality: q === "FULL" || q === "PARTIAL" || q === "FAILED" ? q : null,
    qualityReasons: reasons,
    firstSeenAt: (r.first_seen_at as string | null) || null,
    lastChangedAt: (r.last_changed_at as string | null) || null,
    collectedAt: (r.collected_at as string | null) || null,
  };
}

/** Status after re-collection, given the stored row (pure; unit-tested). */
export function nextInboxStatus(
  prev: { status: InboxStatus; fingerprint: string; publishedPostId: string | null } | null,
  fingerprint: string,
): { status: InboxStatus; changed: boolean } {
  if (!prev) return { status: "new", changed: false };
  const changed = Boolean(prev.fingerprint) && prev.fingerprint !== fingerprint;
  if (prev.status === "hidden" || prev.status === "skipped") return { status: prev.status, changed };
  if (prev.status === "published" || prev.publishedPostId) {
    return { status: changed ? "source_updated" : prev.status === "source_updated" ? "source_updated" : "published", changed };
  }
  if (prev.status === "draft") return { status: changed ? "source_updated" : "draft", changed };
  if (prev.status === "failed") return { status: "new", changed };
  return { status: changed && prev.status !== "new" ? "source_updated" : prev.status, changed };
}

export type UpsertInboxResult = { inserted: number; changed: number; unchanged: number; rows: InboxRow[] };

export async function upsertInboxRowsFromList(
  sb: SupabaseClient,
  input: { sourceSite: string; sourceBoard: string; rows: OperatorListRow[] },
): Promise<UpsertInboxResult> {
  const result: UpsertInboxResult = { inserted: 0, changed: 0, unchanged: 0, rows: [] };
  const unique = new Map<string, OperatorListRow>();
  for (const r of input.rows) if (r.articleKey && !unique.has(r.articleKey)) unique.set(r.articleKey, r);
  if (!unique.size) return result;
  const keys = [...unique.keys()];
  const { data: prevRows, error: pe } = await sb
    .from(INBOX_TABLE)
    .select("source_article_key, fingerprint, status, published_post_id, first_seen_at, last_changed_at")
    .eq("source_site", input.sourceSite)
    .eq("source_board", input.sourceBoard)
    .in("source_article_key", keys);
  if (pe) throw new Error(`inbox_read_failed: ${pe.message}`);
  const prev = new Map((prevRows || []).map((r) => [String((r as { source_article_key: string }).source_article_key), r as Record<string, unknown>]));

  const now = new Date().toISOString();
  const payload = keys.map((key) => {
    const row = unique.get(key)!;
    const fp = fingerprintListRow(row);
    const p = prev.get(key);
    const next = nextInboxStatus(
      p
        ? {
            status: String(p.status || "new") as InboxStatus,
            fingerprint: String(p.fingerprint || ""),
            publishedPostId: (p.published_post_id as string | null) || null,
          }
        : null,
      fp,
    );
    if (!p) result.inserted++;
    else if (next.changed) result.changed++;
    else result.unchanged++;
    return {
      source_site: input.sourceSite,
      source_board: input.sourceBoard,
      source_article_key: key,
      canonical_url: row.detailUrl,
      title: row.title.slice(0, 500),
      author: row.author,
      source_published_at: row.sourcePublishedDate,
      thumbnail_url: row.thumbnailUrl,
      summary: row.summary ? row.summary.slice(0, 1000) : null,
      fingerprint: fp,
      status: next.status,
      published_post_id: (p?.published_post_id as string | null) ?? null,
      last_error: null,
      collected_at: now,
      last_checked_at: now,
      first_seen_at: (p?.first_seen_at as string | null) ?? now,
      last_changed_at: next.changed ? now : ((p?.last_changed_at as string | null) ?? null),
      source_missing_at: null,
      updated_at: now,
    };
  });
  const { data: saved, error } = await sb
    .from(INBOX_TABLE)
    .upsert(payload, { onConflict: "source_site,source_board,source_article_key" })
    .select("*");
  if (error) throw new Error(`inbox_upsert_failed: ${error.message}`);
  result.rows = (saved || []).map((r) => mapInboxRow(r as Record<string, unknown>));
  return result;
}

export type InboxQuery = {
  sourceSite?: string | null;
  sourceBoard?: string | null;
  statuses?: InboxStatus[];
  quality?: QualityVerdict | "none" | null;
  q?: string | null;
  since?: string | null;
  limit?: number;
  offset?: number;
};

export async function listInbox(sb: SupabaseClient, query: InboxQuery): Promise<{ rows: InboxRow[]; total: number }> {
  const limit = Math.max(1, Math.min(200, Number(query.limit) || 50));
  const offset = Math.max(0, Number(query.offset) || 0);
  let q = sb.from(INBOX_TABLE).select("*", { count: "exact" });
  if (query.sourceSite) q = q.eq("source_site", query.sourceSite);
  if (query.sourceBoard) q = q.eq("source_board", query.sourceBoard);
  if (query.statuses?.length) q = q.in("status", query.statuses);
  if (query.quality === "none") q = q.is("quality", null);
  else if (query.quality) q = q.eq("quality", query.quality);
  if (query.since) q = q.gte("first_seen_at", query.since);
  const text = String(query.q || "").trim();
  if (text) q = q.ilike("title", `%${text.replace(/[%_,()]/g, " ").slice(0, 80)}%`);
  const { data, error, count } = await q
    .order("first_seen_at", { ascending: false })
    .order("source_article_key", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`inbox_list_failed: ${error.message}`);
  return { rows: (data || []).map((r) => mapInboxRow(r as Record<string, unknown>)), total: count ?? 0 };
}

export type InboxKey = { sourceSite: string; sourceBoard: string; sourceArticleKey: string };

export async function loadInboxRow(sb: SupabaseClient, key: InboxKey): Promise<InboxRow | null> {
  const { data, error } = await sb
    .from(INBOX_TABLE)
    .select("*")
    .eq("source_site", key.sourceSite)
    .eq("source_board", key.sourceBoard)
    .eq("source_article_key", key.sourceArticleKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapInboxRow(data as Record<string, unknown>) : null;
}

/** Store detail-quality outcome on the inbox row. */
export async function recordInboxQuality(
  sb: SupabaseClient,
  key: InboxKey,
  input: { quality: QualityVerdict | null; reasons: string[]; error?: string | null; failed?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = {
    quality: input.quality,
    quality_reasons: input.reasons,
    last_error: input.error ?? null,
    updated_at: new Date().toISOString(),
  };
  const base = () =>
    sb
      .from(INBOX_TABLE)
      .update(row)
      .eq("source_site", key.sourceSite)
      .eq("source_board", key.sourceBoard)
      .eq("source_article_key", key.sourceArticleKey);
  if (!input.failed) {
    await base();
    return;
  }
  // Only unreviewed rows flip to `failed`; draft/published rows keep their status and get the error text.
  await base();
  row.status = "failed";
  await base().in("status", ["new", "failed"]);
}

/** Operator status change (hide/skip/restore/draft). Never touches published_post_id. */
export async function setInboxStatus(sb: SupabaseClient, keys: InboxKey[], status: InboxStatus): Promise<number> {
  if (status === "published" || status === "source_updated") throw new Error("status_reserved_for_publish_pipeline");
  let n = 0;
  for (const k of keys) {
    let q = sb
      .from(INBOX_TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("source_site", k.sourceSite)
      .eq("source_board", k.sourceBoard)
      .eq("source_article_key", k.sourceArticleKey);
    // A published article keeps its published status; hiding a published post is done on the post itself.
    q = q.is("published_post_id", null);
    const { data, error } = await q.select("id");
    if (!error) n += data?.length ?? 0;
  }
  return n;
}
