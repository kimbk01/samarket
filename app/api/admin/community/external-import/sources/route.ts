import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { detectSource, probeBoard } from "@/lib/community-operator-import/detect";
import {
  addCustomBoard,
  type BoardPatch,
  loadManagedSource,
  loadManagedSources,
  saveDetectedSource,
  type SourcePatch,
  updateBoard,
  updateSource,
  upsertDetectedBoards,
} from "@/lib/community-operator-import/source-store";
import type { AdapterConfig, ContentPolicy, SourceEngine } from "@/lib/community-operator-import/types";
import { verifyStoredSource } from "@/lib/community-operator-import/verify";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  try {
    const sources = await loadManagedSources(getSupabaseServer());
    return jsonOk({ sources });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "sources_load_failed", 500, { code: "sources_load_failed" });
  }
}

type Body = {
  action?: string;
  url?: string;
  sourceId?: string;
  boardId?: string;
  displayName?: string;
  contentPolicy?: ContentPolicy;
  selectedBoardIds?: string[];
  patch?: SourcePatch & BoardPatch;
  baseUrl?: string;
  engine?: SourceEngine;
  adapterConfig?: AdapterConfig;
  engineKey?: string;
  articleIndex?: number;
};

/**
 * actions:
 *  detect   {url}                                   → type, real boards, per-board sample (nothing saved)
 *  probe    {baseUrl, engine, adapterConfig, engineKey, articleIndex?} → board list + one full article (nothing saved)
 *  register {url, sourceId?, displayName?, contentPolicy?, selectedBoardIds?} → re-detect server-side + save
 *  update   {sourceId, patch}                       → name / enabled / content policy / rights / adapter config
 *  board    {sourceId, boardId, patch}              → enabled / collectEnabled / defaultTopicId / kind / name
 *  verify   {sourceId}                              → re-sample stored boards, store verdicts
 *  rescan   {sourceId}                              → re-discover boards from the site (adds new ones)
 *  addBoard {sourceId, displayName, engineKey}      → operator board, e.g. feed#keyword=필리핀 (collection off)
 */
function pickKeys(obj: unknown, keys: string[]): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
}

export async function POST(req: NextRequest) {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<Body>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const b = parsed.value;
  const action = String(b.action || "").trim();
  const sb = getSupabaseServer();
  const audit = async (
    targetType: string,
    targetId: string,
    act: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null
  ) => {
    const r = await appendCommunityAdminAudit(sb, req, {
      actorId: auth.userId,
      targetType,
      targetId,
      action: act,
      before,
      after,
    });
    return r.ok ? {} : { audit_warning: "audit_failed" as const };
  };
  try {
    if (action === "detect") {
      const result = await detectSource(String(b.url || ""), { sampleBoards: 6, budgetMs: 45_000 });
      const existing = await loadManagedSource(sb, result.sourceIdSuggestion);
      return jsonOk({ detect: result, existingSourceId: existing?.id ?? null });
    }
    if (action === "probe") {
      const engine = b.engine;
      if (!b.baseUrl || !b.engineKey || !engine || !["gnuboard", "wordpress_rest", "rss_atom", "html"].includes(engine)) {
        return jsonError("baseUrl, engine, engineKey 필요", 400, { code: "probe_input_required" });
      }
      const probe = await probeBoard({
        baseUrl: b.baseUrl,
        engine,
        adapterConfig: b.adapterConfig ?? {},
        engineKey: b.engineKey,
        displayName: b.displayName,
        articleIndex: Number(b.articleIndex) || 0,
      });
      return jsonOk({ probe });
    }
    if (action === "register") {
      const detect = await detectSource(String(b.url || ""), { sampleBoards: 6, budgetMs: 40_000 });
      if (!detect.engine || detect.verdict === "BLOCKED") {
        return jsonError(`등록 불가: ${detect.verdict} · ${detect.reason}`, 400, { code: "cannot_register", detect });
      }
      const source = await saveDetectedSource(sb, {
        detect,
        sourceId: b.sourceId,
        displayName: b.displayName,
        contentPolicy: b.contentPolicy,
        selectedBoardIds: Array.isArray(b.selectedBoardIds) ? b.selectedBoardIds.map(String) : undefined,
        adminUserId: auth.userId,
      });
      const w = await audit("community_import_source", String(source.id), "community_import.source_register", null, {
        url: String(b.url || ""),
        display_name: b.displayName ?? null,
        content_policy: b.contentPolicy ?? null,
        selected_board_ids: Array.isArray(b.selectedBoardIds) ? b.selectedBoardIds.map(String) : null,
      });
      return jsonOk({ source, detect, ...w });
    }
    const sourceId = String(b.sourceId || "").trim();
    if (!sourceId) return jsonError("sourceId 필요", 400, { code: "source_id_required" });
    if (action === "update") {
      const patch = b.patch || {};
      const keys = Object.keys(patch);
      const prev = await loadManagedSource(sb, sourceId);
      const updatedSource = await updateSource(sb, sourceId, patch, auth.userId);
      const w = await audit(
        "community_import_source",
        sourceId,
        "community_import.source_update",
        pickKeys(prev, keys),
        pickKeys(updatedSource, keys) ?? (patch as Record<string, unknown>)
      );
      return jsonOk({ source: updatedSource, ...w });
    }
    if (action === "addBoard") {
      const input = { displayName: String(b.displayName || ""), engineKey: String(b.engineKey || "") };
      const board = await addCustomBoard(sb, sourceId, input);
      const w = await audit("community_import_source", sourceId, "community_import.board_add", null, {
        display_name: input.displayName,
        engine_key: input.engineKey,
      });
      return jsonOk({ board, ...w });
    }
    if (action === "board") {
      const boardId = String(b.boardId || "").trim();
      if (!boardId) return jsonError("boardId 필요", 400, { code: "board_id_required" });
      const patch = b.patch || {};
      const keys = Object.keys(patch);
      const prevSource = await loadManagedSource(sb, sourceId);
      const prevBoard = prevSource?.boards.find((x) => x.boardId === boardId) ?? null;
      const board = await updateBoard(sb, sourceId, boardId, patch);
      const w = await audit(
        "community_import_board",
        `${sourceId}/${boardId}`,
        "community_import.board_update",
        pickKeys(prevBoard, keys),
        pickKeys(board, keys) ?? (patch as Record<string, unknown>)
      );
      return jsonOk({ board, ...w });
    }
    const source = await loadManagedSource(sb, sourceId);
    if (!source) return jsonError("출처 없음", 404, { code: "source_not_found" });
    if (action === "verify") {
      const outcome = await verifyStoredSource(sb, source, { maxBoards: 8, budgetMs: 45_000 });
      const w = await audit("community_import_source", sourceId, "community_import.source_verify", null, {
        outcome: outcome as unknown as Record<string, unknown>,
      });
      return jsonOk({ outcome, source: await loadManagedSource(sb, sourceId), ...w });
    }
    if (action === "rescan") {
      const detect = await detectSource(source.baseUrl, { sampleBoards: 6, budgetMs: 45_000 });
      const applied = Boolean(detect.engine && detect.engine === source.engine);
      if (applied) await upsertDetectedBoards(sb, sourceId, detect);
      const w = await audit("community_import_source", sourceId, "community_import.source_rescan", {
        board_count: source.boards.length,
      }, { applied, engine: detect.engine ?? null, verdict: detect.verdict ?? null });
      return jsonOk({ detect, source: await loadManagedSource(sb, sourceId), ...w });
    }
    return jsonError("지원 action: detect | register | update | board | verify | rescan", 400, { code: "unsupported_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sources_action_failed";
    return jsonError(msg, 400, { code: msg.split(":")[0] || "sources_action_failed" });
  }
}
