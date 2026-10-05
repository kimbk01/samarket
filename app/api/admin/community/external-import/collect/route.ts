import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { collectBoardToInbox } from "@/lib/community-operator-import/collect";
import { resolvePreviewPair, tryLockBoard } from "@/lib/community-operator-import/source-store";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual "collect now" for one board → inbox (never publishes). */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ sourceId?: string; boardId?: string; pages?: number }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const sourceId = String(parsed.value.sourceId || "").trim();
  const boardId = String(parsed.value.boardId || "").trim();
  if (!sourceId || !boardId) return jsonError("sourceId, boardId 필요", 400, { code: "board_required" });
  try {
    const sb = getSupabaseServer();
    const { source, board } = await resolvePreviewPair(sb, sourceId, boardId);
    if (!(await tryLockBoard(sb, sourceId, boardId, 90))) {
      return jsonError("이 게시판은 지금 수집 중입니다. 잠시 후 다시 시도하세요.", 409, { code: "board_locked" });
    }
    const res = await collectBoardToInbox(sb, source, board, { pages: Math.max(1, Math.min(3, Number(parsed.value.pages) || 1)), maxItems: 60 });
    const { rows: _rows, ...summary } = res;
    void _rows;
    if (!res.ok) return jsonError(res.error || "collect_failed", 502, { code: `collect_${res.errorKind || "failed"}`, result: summary });
    return jsonOk({ result: summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "collect_failed";
    return jsonError(msg, 400, { code: msg });
  }
}
