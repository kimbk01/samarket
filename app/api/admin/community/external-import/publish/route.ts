import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { NextRequest } from "next/server";
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
  const auth = await requireCommunityAdmin("content");
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
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: auth.userId,
      targetType: "community_post",
      targetId: result.postId,
      action: mode === "update" ? "community_import.publish_update" : "community_import.publish",
      before: mode === "update" ? { post_id: result.postId } : null,
      after: {
        source_site: key.sourceSite,
        source_board: key.sourceBoard,
        source_article_key: key.sourceArticleKey,
        mode,
        topic_slug: result.topicSlug,
        image_count: result.imageCount,
        accept_partial: parsed.value.acceptPartial === true,
        warnings: result.warnings,
      },
    });
    return jsonOk({ ...result, ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "게시에 실패했습니다.", 500, { code: "publish_failed" });
  }
}
