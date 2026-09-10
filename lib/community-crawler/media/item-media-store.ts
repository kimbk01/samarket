/**
 * Durable crawler media row store (community_crawl_item_media).
 * Does NOT write community_post_images.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityCrawlItemMediaRole = "COVER" | "BODY";

export type CommunityCrawlItemMediaRow = {
  id: string;
  crawl_item_id: string;
  source_id: string | null;
  board_id: string | null;
  source_url: string;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  role: CommunityCrawlItemMediaRole;
  content_hash: string;
  sort_order: number;
  is_current: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Record<string, unknown>): CommunityCrawlItemMediaRow {
  return {
    id: String(row.id),
    crawl_item_id: String(row.crawl_item_id),
    source_id: row.source_id != null ? String(row.source_id) : null,
    board_id: row.board_id != null ? String(row.board_id) : null,
    source_url: String(row.source_url ?? ""),
    storage_bucket: String(row.storage_bucket ?? "post-images"),
    storage_path: String(row.storage_path ?? ""),
    public_url: row.public_url != null ? String(row.public_url) : null,
    mime_type: String(row.mime_type ?? ""),
    byte_size: Number(row.byte_size ?? 0) || 0,
    width: Number(row.width ?? 0) || 0,
    height: Number(row.height ?? 0) || 0,
    role: row.role === "BODY" ? "BODY" : "COVER",
    content_hash: String(row.content_hash ?? ""),
    sort_order: Number(row.sort_order ?? 0) || 0,
    is_current: row.is_current !== false,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function findCrawlItemMediaByHash(
  sb: SupabaseClient,
  input: { crawlItemId: string; role: CommunityCrawlItemMediaRole; contentHash: string }
): Promise<CommunityCrawlItemMediaRow | null> {
  const { data, error } = await sb
    .from("community_crawl_item_media")
    .select("*")
    .eq("crawl_item_id", input.crawlItemId)
    .eq("role", input.role)
    .eq("content_hash", input.contentHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function listCurrentCrawlItemMedia(
  sb: SupabaseClient,
  crawlItemId: string
): Promise<CommunityCrawlItemMediaRow[]> {
  const { data, error } = await sb
    .from("community_crawl_item_media")
    .select("*")
    .eq("crawl_item_id", crawlItemId)
    .eq("is_current", true)
    .order("role", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function insertCrawlItemMediaRow(
  sb: SupabaseClient,
  row: {
    crawlItemId: string;
    sourceId: string;
    boardId: string;
    sourceUrl: string;
    storageBucket: string;
    storagePath: string;
    publicUrl: string | null;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    role: CommunityCrawlItemMediaRole;
    contentHash: string;
    sortOrder: number;
    isCurrent: boolean;
  }
): Promise<CommunityCrawlItemMediaRow> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("community_crawl_item_media")
    .insert({
      crawl_item_id: row.crawlItemId,
      source_id: row.sourceId,
      board_id: row.boardId,
      source_url: row.sourceUrl,
      storage_bucket: row.storageBucket,
      storage_path: row.storagePath,
      public_url: row.publicUrl,
      mime_type: row.mimeType,
      byte_size: row.byteSize,
      width: row.width,
      height: row.height,
      role: row.role,
      content_hash: row.contentHash,
      sort_order: row.sortOrder,
      is_current: row.isCurrent,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert_media_failed");
  return mapRow(data as Record<string, unknown>);
}

export async function demoteCurrentCrawlItemMedia(
  sb: SupabaseClient,
  input: { crawlItemId: string; role: CommunityCrawlItemMediaRole; exceptId?: string }
): Promise<void> {
  let q = sb
    .from("community_crawl_item_media")
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq("crawl_item_id", input.crawlItemId)
    .eq("role", input.role)
    .eq("is_current", true);
  if (input.exceptId) q = q.neq("id", input.exceptId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function promoteCrawlItemMediaCurrent(
  sb: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await sb
    .from("community_crawl_item_media")
    .update({ is_current: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
