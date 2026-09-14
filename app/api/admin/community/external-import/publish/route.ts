import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { ensureDraftEdit } from "@/lib/community-operator-import/draft-store";
import { publishOperatorSelectedArticle } from "@/lib/community-operator-import/publish";
import type { OperatorDraftEdit, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<{
    article?: OperatorNormalizedArticle;
    edit?: OperatorDraftEdit;
    selectedArticleKeys?: string[];
  }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;

  const article = parsed.value.article;
  const selectedArticleKeys = Array.isArray(parsed.value.selectedArticleKeys)
    ? parsed.value.selectedArticleKeys.map((k) => String(k))
    : [];

  if (!article?.sourceArticleKey) {
    return jsonError("원문 article이 필요합니다.", 400, { code: "article_required" });
  }

  const edit = ensureDraftEdit(article, parsed.value.edit);
  try {
    const sb = getSupabaseServer();
    const result = await publishOperatorSelectedArticle(sb, {
      article,
      edit,
      selectedArticleKeys,
      adminUserId: auth.userId,
    });
    if (!result.ok) {
      return jsonError(result.message, 400, { code: result.code });
    }
    return jsonOk({
      published: true,
      postId: result.postId,
      topicSlug: result.topicSlug,
      selectedOnly: result.selectedOnly,
      selectedArticleKeys,
      publicSourceAttribution: false,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "게시에 실패했습니다.", 500, {
      code: "publish_failed",
    });
  }
}
