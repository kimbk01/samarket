import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isSupportedPhilsamoBoard } from "@/lib/community-operator-import/boards";
import { defaultOperatorDraftEdit } from "@/lib/community-operator-import/draft-apply";
import { ensureDraftEdit, loadOperatorImportDraft } from "@/lib/community-operator-import/draft-store";
import { fetchPhilsamoTravelDetail } from "@/lib/community-operator-import/philsamo-travel";
import { PHILSAMO_SOURCE_SITE, PHILSAMO_TRAVEL_BOARD } from "@/lib/community-operator-import/types";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const source = (req.nextUrl.searchParams.get("source") || PHILSAMO_SOURCE_SITE).trim();
  const board = (req.nextUrl.searchParams.get("board") || PHILSAMO_TRAVEL_BOARD).trim();
  const articleKey = (req.nextUrl.searchParams.get("articleKey") || "").trim();

  if (source !== PHILSAMO_SOURCE_SITE || !isSupportedPhilsamoBoard(board)) {
    return jsonError("지원하지 않는 출처/게시판입니다.", 400, { code: "source_board_unsupported" });
  }
  if (!/^\d+$/.test(articleKey)) {
    return jsonError("articleKey가 필요합니다.", 400, { code: "article_key_required" });
  }

  try {
    const article = await fetchPhilsamoTravelDetail(articleKey, board);
    let savedEdit = null as ReturnType<typeof defaultOperatorDraftEdit> | null;
    let draftMeta: { id: string; status: string; publishedPostId: string | null } | null = null;
    try {
      const sb = getSupabaseServer();
      const draft = await loadOperatorImportDraft(sb, {
        sourceSite: article.sourceSite,
        sourceBoard: article.sourceBoard,
        sourceArticleKey: article.sourceArticleKey,
      });
      if (draft) {
        savedEdit = ensureDraftEdit(article, draft.edit);
        draftMeta = { id: draft.id, status: draft.status, publishedPostId: draft.publishedPostId };
      }
    } catch {
      /* draft table may not be applied yet — detail still works */
    }

    return jsonOk({
      article,
      edit: savedEdit || defaultOperatorDraftEdit(article),
      draft: draftMeta,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "본문 수집에 실패했습니다.", 502, {
      code: "detail_fetch_failed",
    });
  }
}
