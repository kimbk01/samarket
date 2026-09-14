import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { collectOperatorDetail, loadOperationalRegistry } from "@/lib/community-operator-import/collect";
import { defaultOperatorDraftEdit } from "@/lib/community-operator-import/draft-apply";
import { ensureDraftEdit, loadOperatorImportDraft } from "@/lib/community-operator-import/draft-store";
import { resolveRuntimeSourceBoard } from "@/lib/community-operator-import/source-store";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const source = (req.nextUrl.searchParams.get("source") || "").trim();
  const board = (req.nextUrl.searchParams.get("board") || "").trim();
  const articleKey = (req.nextUrl.searchParams.get("articleKey") || "").trim();

  const runtime = await loadOperationalRegistry();
  if (!resolveRuntimeSourceBoard(runtime.sources, runtime.boards, source, board)) {
    return jsonError("지원하지 않는 출처/게시판입니다.", 400, { code: "source_board_unsupported" });
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(articleKey)) {
    return jsonError("articleKey가 필요합니다.", 400, { code: "article_key_required" });
  }

  try {
    const article = await collectOperatorDetail(source, board, articleKey);
    let savedEdit = null as ReturnType<typeof defaultOperatorDraftEdit> | null;
    let draftMeta: {
      id: string;
      status: string;
      publishedPostId: string | null;
    } | null = null;
    try {
      const sb = getSupabaseServer();
      const draft = await loadOperatorImportDraft(sb, {
        sourceSite: article.sourceSite,
        sourceBoard: article.sourceBoard,
        sourceArticleKey: article.sourceArticleKey,
      });
      if (draft) {
        savedEdit = ensureDraftEdit(article, draft.edit);
        draftMeta = {
          id: draft.id,
          status: draft.status,
          publishedPostId: draft.publishedPostId,
        };
      }
    } catch {
      /* draft optional */
    }

    return jsonOk({
      article,
      edit: savedEdit || defaultOperatorDraftEdit(article),
      draft: draftMeta,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "본문 수집에 실패했습니다.", 502, {
      code: "detail_fetch_failed",
      source,
      board,
      articleKey,
    });
  }
}
