import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  buildRegistryPayloadFromRuntime,
  collectOperatorList,
  loadOperationalRegistry,
} from "@/lib/community-operator-import/collect";
import { resolveRuntimeSourceBoard } from "@/lib/community-operator-import/source-store";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const page = Number(req.nextUrl.searchParams.get("page") || "1") || 1;
  const maxPages = Number(req.nextUrl.searchParams.get("maxPages") || "1") || 1;
  const maxItems = Number(req.nextUrl.searchParams.get("maxItems") || "40") || 40;
  const source = (req.nextUrl.searchParams.get("source") || "").trim();
  const board = (req.nextUrl.searchParams.get("board") || "").trim();
  const runtime = await loadOperationalRegistry();
  const registry = buildRegistryPayloadFromRuntime(runtime);

  if (!source || !board) {
    return jsonOk({
      ...registry,
      source: null,
      page,
      maxPages,
      maxItems,
      rows: [],
      hint: "source와 board를 선택하세요.",
    });
  }

  if (!resolveRuntimeSourceBoard(runtime.sources, runtime.boards, source, board)) {
    return jsonError("지원하지 않는 출처/게시판입니다.", 400, {
      code: "source_board_unsupported",
      source,
      board,
    });
  }

  try {
    const { meta, rows, page: usedPage, maxPages: usedMaxPages } = await collectOperatorList(source, board, {
      page,
      maxPages,
      maxItems,
    });

    let rowsWithState = rows.map((r) => ({
      ...r,
      inboxStatus: "new" as string,
      publishedPostId: null as string | null,
    }));
    try {
      const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
      const { upsertInboxRowsFromList } = await import("@/lib/community-operator-import/inbox-store");
      const sb = getSupabaseServer();
      const map = await upsertInboxRowsFromList(sb, {
        sourceSite: meta.site,
        sourceBoard: meta.board,
        rows,
      });
      rowsWithState = rows.map((r) => {
        const st = map.get(r.articleKey);
        return {
          ...r,
          inboxStatus: st?.status || "new",
          publishedPostId: st?.publishedPostId || null,
        };
      });
    } catch {
      /* inbox optional until migration */
    }

    return jsonOk({
      ...registry,
      source: meta,
      page: usedPage,
      maxPages: usedMaxPages,
      maxItems,
      rows: rowsWithState,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "목록 수집에 실패했습니다.", 502, {
      code: "list_fetch_failed",
      source,
      board,
    });
  }
}
