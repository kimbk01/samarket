import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchArticleForInbox } from "@/lib/community-operator-import/collect";
import { carryEditToArticle, ensureDraftEdit } from "@/lib/community-operator-import/draft-store";
import { publishImportedArticle, type PublishMode } from "@/lib/community-operator-import/publish";
import { loadRules } from "@/lib/community-operator-import/rules";
import type { OperatorDraftEdit, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST {article, edit, mode: "create"|"update", acceptPartial?}
 * The article is re-fetched server-side; the operator's edit is applied to it (index edits kept
 * only when the source structure is unchanged). One item = one DB transaction.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{
    article?: OperatorNormalizedArticle;
    edit?: OperatorDraftEdit;
    mode?: PublishMode;
    acceptPartial?: boolean;
  }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const clientArticle = parsed.value.article;
  if (!clientArticle?.sourceArticleKey || !clientArticle.sourceSite || !clientArticle.sourceBoard) {
    return jsonError("원문 article이 필요합니다.", 400, { code: "article_required" });
  }
  const mode: PublishMode = parsed.value.mode === "update" ? "update" : "create";
  try {
    const sb = getSupabaseServer();
    const key = {
      sourceSite: clientArticle.sourceSite,
      sourceBoard: clientArticle.sourceBoard,
      sourceArticleKey: clientArticle.sourceArticleKey,
    };
    const { article } = await fetchArticleForInbox(sb, key);
    const edit = carryEditToArticle(ensureDraftEdit(clientArticle, parsed.value.edit), clientArticle, article);
    const result = await publishImportedArticle(sb, {
      article,
      edit,
      mode,
      adminUserId: auth.userId,
      acceptPartial: parsed.value.acceptPartial === true,
      rules: await loadRules(sb),
    });
    if (!result.ok) return jsonError(result.message, 400, { code: result.code });
    return jsonOk({ ...result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "게시에 실패했습니다.", 500, { code: "publish_failed" });
  }
}
