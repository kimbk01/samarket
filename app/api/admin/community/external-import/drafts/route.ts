import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ensureDraftEdit, upsertOperatorImportDraft } from "@/lib/community-operator-import/draft-store";
import { loadManagedSource } from "@/lib/community-operator-import/source-store";
import { buildPublishContent } from "@/lib/community-operator-import/publish-content";
import { loadRules, rulesFor } from "@/lib/community-operator-import/rules";
import type { OperatorDraftEdit, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST {article, edit, action?: "save" | "preview"}
 *  save    → stores the draft (keeps published status/provenance) and returns the server-side preview
 *  preview → returns the exact content that would be published (policy + rules), nothing saved
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ article?: OperatorNormalizedArticle; edit?: OperatorDraftEdit; action?: string }>(
    req,
    "JSON 본문이 필요합니다.",
  );
  if (!parsed.ok) return parsed.response;
  const article = parsed.value.article;
  if (!article?.sourceArticleKey || !article.sourceSite || !article.sourceBoard) {
    return jsonError("원문 article이 필요합니다.", 400, { code: "article_required" });
  }
  const edit = ensureDraftEdit(article, parsed.value.edit);
  try {
    const sb = getSupabaseServer();
    const [source, rules] = await Promise.all([loadManagedSource(sb, article.sourceSite), loadRules(sb)]);
    if (!source) return jsonError("출처 없음", 404, { code: "source_not_found" });
    const preview = buildPublishContent({
      article,
      edit,
      sourcePolicy: source.contentPolicy,
      sourceName: source.displayName,
      rules: rulesFor(rules, article.sourceSite, article.sourceBoard),
    });
    if (parsed.value.action === "preview") return jsonOk({ preview });
    const draft = await upsertOperatorImportDraft(sb, { original: article, edit, updatedBy: auth.userId });
    return jsonOk({
      saved: true,
      preview,
      draft: { id: draft.id, status: draft.status, updatedAt: draft.updatedAt, publishedPostId: draft.publishedPostId },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "draft_save_failed", 500, { code: "draft_save_failed" });
  }
}
