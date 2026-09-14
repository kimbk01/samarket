import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { ensureDraftEdit } from "@/lib/community-operator-import/draft-store";
import { upsertOperatorImportDraft } from "@/lib/community-operator-import/draft-store";
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
  }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;

  const article = parsed.value.article;
  if (!article?.sourceArticleKey || !article.sourceSite || !article.sourceBoard) {
    return jsonError("원문 article이 필요합니다.", 400, { code: "article_required" });
  }

  const edit = ensureDraftEdit(article, parsed.value.edit);
  try {
    const sb = getSupabaseServer();
    const draft = await upsertOperatorImportDraft(sb, {
      original: article,
      edit,
      updatedBy: auth.userId,
    });
    return jsonOk({
      saved: true,
      published: false,
      draft: {
        id: draft.id,
        status: draft.status,
        updatedAt: draft.updatedAt,
        publishedPostId: draft.publishedPostId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "임시저장 실패";
    if (msg.includes("operator_import_drafts_table_missing") || /does not exist|schema cache/i.test(msg)) {
      return jsonError("임시저장 테이블이 아직 없습니다. 마이그레이션 적용이 필요합니다.", 503, {
        code: "drafts_table_missing",
      });
    }
    return jsonError(msg, 500, { code: "draft_save_failed" });
  }
}
