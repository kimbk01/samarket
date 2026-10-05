import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { detectSource, probeBoard } from "@/lib/community-operator-import/detect";
import {
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
  const auth = await requireAdminApiUser();
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
 *  update   {sourceId, patch}                       → name / enabled / content policy / adapter config
 *  board    {sourceId, boardId, patch}              → enabled / collectEnabled / defaultTopicId / kind / name
 *  verify   {sourceId}                              → re-sample stored boards, store verdicts
 *  rescan   {sourceId}                              → re-discover boards from the site (adds new ones)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<Body>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const b = parsed.value;
  const action = String(b.action || "").trim();
  const sb = getSupabaseServer();
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
      return jsonOk({ source, detect });
    }
    const sourceId = String(b.sourceId || "").trim();
    if (!sourceId) return jsonError("sourceId 필요", 400, { code: "source_id_required" });
    if (action === "update") {
      return jsonOk({ source: await updateSource(sb, sourceId, b.patch || {}) });
    }
    if (action === "board") {
      const boardId = String(b.boardId || "").trim();
      if (!boardId) return jsonError("boardId 필요", 400, { code: "board_id_required" });
      return jsonOk({ board: await updateBoard(sb, sourceId, boardId, b.patch || {}) });
    }
    const source = await loadManagedSource(sb, sourceId);
    if (!source) return jsonError("출처 없음", 404, { code: "source_not_found" });
    if (action === "verify") {
      const outcome = await verifyStoredSource(sb, source, { maxBoards: 8, budgetMs: 45_000 });
      return jsonOk({ outcome, source: await loadManagedSource(sb, sourceId) });
    }
    if (action === "rescan") {
      const detect = await detectSource(source.baseUrl, { sampleBoards: 6, budgetMs: 45_000 });
      if (detect.engine && detect.engine === source.engine) await upsertDetectedBoards(sb, sourceId, detect);
      return jsonOk({ detect, source: await loadManagedSource(sb, sourceId) });
    }
    return jsonError("지원 action: detect | register | update | board | verify | rescan", 400, { code: "unsupported_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sources_action_failed";
    return jsonError(msg, 400, { code: msg.split(":")[0] || "sources_action_failed" });
  }
}
