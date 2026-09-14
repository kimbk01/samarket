import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperatorBoardCategory, OperatorSourceEngine, VerifiedOperatorBoard, VerifiedOperatorSource } from "./registry";
import {
  listVerifiedBoards,
  listVerifiedSources,
  resolveVerifiedBoard,
  resolveVerifiedSource,
} from "./registry";
import type { ProposedBoard, SourceVerifyResult, VerifyVerdict } from "./source-verify";
import { canEnableVerification, slugFromUrl } from "./source-verify";

export const OPERATOR_IMPORT_SOURCES_TABLE = "community_operator_import_sources";
export const OPERATOR_IMPORT_SOURCE_BOARDS_TABLE = "community_operator_import_source_boards";

export type ManagedSourceRow = {
  id: string;
  displayName: string;
  baseUrl: string;
  engine: OperatorSourceEngine;
  verification: VerifyVerdict;
  enabled: boolean;
  priority: "P0" | "P1" | "P2";
  origin: "seed" | "admin";
  reason: string | null;
  verifyJson: Record<string, unknown>;
  boards: Array<{
    boardId: string;
    displayName: string;
    shortLabel: string;
    category: string;
    engineKey: string;
    enabled: boolean;
  }>;
};

function mapSource(row: Record<string, unknown>, boards: ManagedSourceRow["boards"]): ManagedSourceRow {
  return {
    id: String(row.id || ""),
    displayName: String(row.display_name || ""),
    baseUrl: String(row.base_url || ""),
    engine: String(row.engine || "wordpress_rest") as OperatorSourceEngine,
    verification: String(row.verification || "NOT_PROVEN") as VerifyVerdict,
    enabled: Boolean(row.enabled),
    priority: (String(row.priority || "P1") as "P0" | "P1" | "P2") || "P1",
    origin: (String(row.origin || "admin") as "seed" | "admin") || "admin",
    reason: (row.reason as string | null) || null,
    verifyJson: (row.verify_json as Record<string, unknown>) || {},
    boards,
  };
}

export async function loadManagedSources(sb: SupabaseClient): Promise<ManagedSourceRow[]> {
  const { data: sources, error } = await sb
    .from(OPERATOR_IMPORT_SOURCES_TABLE)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    const m = String(error.message || "").toLowerCase();
    if (m.includes("does not exist") || m.includes("schema cache")) {
      throw new Error("operator_import_sources_table_missing");
    }
    throw new Error(error.message);
  }
  const ids = (sources || []).map((s) => String((s as { id: string }).id));
  const boardsBySource = new Map<string, ManagedSourceRow["boards"]>();
  if (ids.length) {
    const { data: boards } = await sb
      .from(OPERATOR_IMPORT_SOURCE_BOARDS_TABLE)
      .select("*")
      .in("source_id", ids);
    for (const b of boards || []) {
      const row = b as Record<string, unknown>;
      const sid = String(row.source_id || "");
      const list = boardsBySource.get(sid) || [];
      list.push({
        boardId: String(row.board_id || ""),
        displayName: String(row.display_name || ""),
        shortLabel: String(row.short_label || ""),
        category: String(row.category || "living"),
        engineKey: String(row.engine_key || ""),
        enabled: Boolean(row.enabled),
      });
      boardsBySource.set(sid, list);
    }
  }
  return (sources || []).map((s) => {
    const row = s as Record<string, unknown>;
    return mapSource(row, boardsBySource.get(String(row.id)) || []);
  });
}

export async function upsertManagedSourceFromVerify(
  sb: SupabaseClient,
  input: {
    displayName: string;
    verify: SourceVerifyResult;
    enabled: boolean;
    adminUserId: string;
    sourceId?: string;
    boards?: ProposedBoard[];
  },
): Promise<ManagedSourceRow> {
  if (!canEnableVerification(input.verify.verdict) && input.enabled) {
    throw new Error("blocked_or_unproven_cannot_enable");
  }
  if (input.verify.engine === "unknown") {
    throw new Error("unknown_engine_cannot_register");
  }
  const id = (input.sourceId || slugFromUrl(input.verify.url)).trim().toLowerCase();
  const boards = input.boards?.length ? input.boards : input.verify.proposedBoards;
  if (!boards.length) throw new Error("no_boards_to_register");

  const payload = {
    id,
    display_name: String(input.displayName || id).trim() || id,
    base_url: input.verify.url,
    engine: input.verify.engine,
    verification: input.verify.verdict,
    enabled: Boolean(input.enabled) && canEnableVerification(input.verify.verdict),
    priority: "P1",
    origin: "admin",
    verify_json: input.verify as unknown as Record<string, unknown>,
    reason: input.verify.reason,
    created_by: input.adminUserId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from(OPERATOR_IMPORT_SOURCES_TABLE).upsert(payload, { onConflict: "id" });
  if (error) throw new Error(error.message);

  await sb.from(OPERATOR_IMPORT_SOURCE_BOARDS_TABLE).delete().eq("source_id", id);
  const boardRows = boards.map((b) => ({
    source_id: id,
    board_id: b.boardId,
    display_name: b.displayName,
    short_label: b.shortLabel || b.boardId,
    category: b.category || "living",
    engine_key: b.engineKey,
    enabled: true,
    updated_at: new Date().toISOString(),
  }));
  const { error: be } = await sb.from(OPERATOR_IMPORT_SOURCE_BOARDS_TABLE).insert(boardRows);
  if (be) throw new Error(be.message);

  const all = await loadManagedSources(sb);
  const found = all.find((s) => s.id === id);
  if (!found) throw new Error("register_readback_failed");
  return found;
}

export async function setManagedSourceEnabled(
  sb: SupabaseClient,
  sourceId: string,
  enabled: boolean,
): Promise<ManagedSourceRow> {
  const { data, error } = await sb
    .from(OPERATOR_IMPORT_SOURCES_TABLE)
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "source_not_found");
  const verification = String((data as { verification?: string }).verification || "") as VerifyVerdict;
  if (enabled && !canEnableVerification(verification)) {
    throw new Error("blocked_or_unproven_cannot_enable");
  }
  const { error: ue } = await sb
    .from(OPERATOR_IMPORT_SOURCES_TABLE)
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", sourceId);
  if (ue) throw new Error(ue.message);
  const all = await loadManagedSources(sb);
  const found = all.find((s) => s.id === sourceId);
  if (!found) throw new Error("enable_readback_failed");
  return found;
}

/**
 * Runtime operational sources = code seed VERIFIED + DB enabled managed sources.
 * BLOCKED/NOT_PROVEN never appear even if somehow stored enabled=false only.
 */
export async function buildRuntimeOperationalRegistry(sb: SupabaseClient | null): Promise<{
  sources: VerifiedOperatorSource[];
  boards: VerifiedOperatorBoard[];
  managed: ManagedSourceRow[];
}> {
  const seedSources = listVerifiedSources();
  const seedBoards = listVerifiedBoards();
  let managed: ManagedSourceRow[] = [];
  if (sb) {
    try {
      managed = await loadManagedSources(sb);
    } catch {
      managed = [];
    }
  }

  const sources: VerifiedOperatorSource[] = [...seedSources];
  const boards: VerifiedOperatorBoard[] = [...seedBoards];
  const seedIds = new Set(seedSources.map((s) => s.id));

  for (const m of managed) {
    if (!m.enabled) continue;
    if (!canEnableVerification(m.verification)) continue;
    if (m.engine !== "gnuboard" && m.engine !== "wordpress_rest" && m.engine !== "rss_atom") continue;
    if (seedIds.has(m.id)) {
      // seed already present; managed enable primarily for admin-registered extras
      continue;
    }
    sources.push({
      id: m.id,
      displayName: m.displayName,
      baseUrl: m.baseUrl,
      engine: m.engine,
      status: "verified",
      priority: m.priority,
    });
    for (const b of m.boards.filter((x) => x.enabled)) {
      boards.push({
        sourceId: m.id,
        boardId: b.boardId,
        displayName: b.displayName,
        shortLabel: b.shortLabel || b.boardId,
        category: (b.category as OperatorBoardCategory) || "living",
        engineKey: b.engineKey,
        enabled: true,
        verification: "verified",
      });
    }
  }

  return { sources, boards, managed };
}

export function resolveRuntimeSourceBoard(
  sources: VerifiedOperatorSource[],
  boards: VerifiedOperatorBoard[],
  sourceId: string,
  boardId: string,
): { source: VerifiedOperatorSource; board: VerifiedOperatorBoard } | null {
  const source = sources.find((s) => s.id === sourceId) || resolveVerifiedSource(sourceId);
  const board =
    boards.find((b) => b.sourceId === sourceId && b.boardId === boardId) ||
    resolveVerifiedBoard(sourceId, boardId);
  if (!source || !board) return null;
  return { source, board };
}
