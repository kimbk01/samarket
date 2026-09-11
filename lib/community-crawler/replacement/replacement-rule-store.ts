/**
 * V2-2 replacement rule store — ONE SSOT for community_crawl_replacement_rules.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCommunityCrawlReplacementRules,
  type CommunityCrawlReplacementRuleLike,
} from "@/lib/community-crawler/replacement/apply-replacement-rules";
import { getCommunityCrawlBoard } from "@/lib/community-crawler/admin-crawl-store";
import { listCommunityCrawlItems } from "@/lib/community-crawler/crawl-item-store";

export type CommunityCrawlReplacementRuleRow = CommunityCrawlReplacementRuleLike & {
  updated_at: string;
};

const MAX_TEXT = 500;

function mapRule(row: Record<string, unknown>): CommunityCrawlReplacementRuleRow {
  return {
    id: String(row.id),
    source_id: String(row.source_id),
    board_id: row.board_id != null ? String(row.board_id) : null,
    from_text: String(row.from_text ?? ""),
    to_text: String(row.to_text ?? ""),
    apply_title: row.apply_title !== false,
    apply_body: row.apply_body !== false,
    priority: Number(row.priority ?? 100) || 100,
    enabled: row.enabled !== false,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function validateReplacementRuleInput(input: {
  from_text: string;
  to_text: string;
  apply_title?: boolean;
  apply_body?: boolean;
}): { ok: true; from_text: string; to_text: string; apply_title: boolean; apply_body: boolean } | {
  ok: false;
  error: string;
} {
  // Do not trim meaningful internal spaces — only reject empty after ends trim for emptiness check.
  const from_text = String(input.from_text ?? "");
  const to_text = String(input.to_text ?? "");
  if (!from_text || from_text.length === 0) return { ok: false, error: "from_text_required" };
  if (from_text.length > MAX_TEXT) return { ok: false, error: "from_text_too_long" };
  if (to_text.length > MAX_TEXT) return { ok: false, error: "to_text_too_long" };
  if (from_text === to_text) return { ok: false, error: "from_equals_to" };
  const apply_title = input.apply_title !== false;
  const apply_body = input.apply_body !== false;
  if (!apply_title && !apply_body) return { ok: false, error: "apply_target_required" };
  return { ok: true, from_text, to_text, apply_title, apply_body };
}

export async function listCommunityCrawlReplacementRules(
  sb: SupabaseClient,
  input: { sourceId: string; boardId?: string | null }
): Promise<CommunityCrawlReplacementRuleRow[]> {
  const sourceId = input.sourceId.trim();
  if (!sourceId) throw new Error("source_id_required");

  // Source-scoped + optional board-scoped for this board.
  const q = sb.from("community_crawl_replacement_rules").select("*").eq("source_id", sourceId);
  const { data, error } = await q.order("priority", { ascending: true }).order("created_at", {
    ascending: true,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r) => mapRule(r as Record<string, unknown>));
  if (!input.boardId) {
    return rows.filter((r) => r.board_id == null);
  }
  const boardId = input.boardId.trim();
  return rows.filter((r) => r.board_id == null || r.board_id === boardId);
}

/** Rules to apply for a board crawl/materialize. */
export async function loadReplacementRulesForBoard(
  sb: SupabaseClient,
  input: { sourceId: string; boardId: string }
): Promise<CommunityCrawlReplacementRuleRow[]> {
  return listCommunityCrawlReplacementRules(sb, {
    sourceId: input.sourceId,
    boardId: input.boardId,
  });
}

export async function createCommunityCrawlReplacementRule(
  sb: SupabaseClient,
  input: {
    source_id: string;
    board_id?: string | null;
    from_text: string;
    to_text: string;
    apply_title?: boolean;
    apply_body?: boolean;
    priority?: number;
    enabled?: boolean;
  }
): Promise<CommunityCrawlReplacementRuleRow> {
  const validated = validateReplacementRuleInput(input);
  if (!validated.ok) throw new Error(validated.error);

  const sourceId = input.source_id.trim();
  if (!sourceId) throw new Error("source_id_required");
  const boardId: string | null = input.board_id?.trim() || null;
  if (boardId) {
    const board = await getCommunityCrawlBoard(sb, boardId);
    if (!board) throw new Error("board_not_found");
    if (board.source_id !== sourceId) throw new Error("board_source_mismatch");
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("community_crawl_replacement_rules")
    .insert({
      source_id: sourceId,
      board_id: boardId,
      from_text: validated.from_text,
      to_text: validated.to_text,
      apply_title: validated.apply_title,
      apply_body: validated.apply_body,
      priority: typeof input.priority === "number" ? Math.floor(input.priority) : 100,
      enabled: input.enabled !== false,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  return mapRule(data as Record<string, unknown>);
}

export async function updateCommunityCrawlReplacementRule(
  sb: SupabaseClient,
  id: string,
  patch: Partial<{
    from_text: string;
    to_text: string;
    apply_title: boolean;
    apply_body: boolean;
    priority: number;
    enabled: boolean;
  }>
): Promise<CommunityCrawlReplacementRuleRow> {
  const { data: existing, error: loadErr } = await sb
    .from("community_crawl_replacement_rules")
    .select("*")
    .eq("id", id.trim())
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!existing) throw new Error("not_found");

  const cur = mapRule(existing as Record<string, unknown>);
  const nextFrom = patch.from_text !== undefined ? patch.from_text : cur.from_text;
  const nextTo = patch.to_text !== undefined ? patch.to_text : cur.to_text;
  const nextApplyTitle = patch.apply_title !== undefined ? patch.apply_title : cur.apply_title;
  const nextApplyBody = patch.apply_body !== undefined ? patch.apply_body : cur.apply_body;
  const validated = validateReplacementRuleInput({
    from_text: nextFrom,
    to_text: nextTo,
    apply_title: nextApplyTitle,
    apply_body: nextApplyBody,
  });
  if (!validated.ok) throw new Error(validated.error);

  const next: Record<string, unknown> = {
    from_text: validated.from_text,
    to_text: validated.to_text,
    apply_title: validated.apply_title,
    apply_body: validated.apply_body,
    updated_at: new Date().toISOString(),
  };
  if (typeof patch.priority === "number") next.priority = Math.floor(patch.priority);
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;

  const { data, error } = await sb
    .from("community_crawl_replacement_rules")
    .update(next)
    .eq("id", id.trim())
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "update_failed");
  return mapRule(data as Record<string, unknown>);
}

export async function deleteCommunityCrawlReplacementRule(
  sb: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await sb.from("community_crawl_replacement_rules").delete().eq("id", id.trim());
  if (error) throw new Error(error.message);
}

export async function reapplyCommunityCrawlReplacementRules(
  sb: SupabaseClient,
  input: { sourceId: string; boardId: string }
): Promise<{
  scanned: number;
  updated: number;
  skipped_manual: number;
  failed: number;
}> {
  const rules = await loadReplacementRulesForBoard(sb, {
    sourceId: input.sourceId,
    boardId: input.boardId,
  });
  const items = await listCommunityCrawlItems(sb, {
    boardId: input.boardId,
    sourceId: input.sourceId,
    limit: 200,
  });

  let updated = 0;
  let skipped_manual = 0;
  let failed = 0;
  for (const item of items) {
    if (item.manual_override) {
      skipped_manual += 1;
      continue;
    }
    const next = applyCommunityCrawlReplacementRules({
      sourceTitle: item.source_title,
      sourceBody: item.source_body_normalized,
      rules,
    });
    if (next.dibay_title === item.dibay_title && next.dibay_body === item.dibay_body) {
      continue;
    }
    const { error } = await sb
      .from("community_crawl_items")
      .update({
        dibay_title: next.dibay_title,
        dibay_body: next.dibay_body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("manual_override", false);
    if (error) failed += 1;
    else updated += 1;
  }
  return { scanned: items.length, updated, skipped_manual, failed };
}
