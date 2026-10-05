import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchArticleForInbox } from "@/lib/community-operator-import/collect";
import { carryEditToArticle, ensureDraftEdit, loadOperatorImportDraft } from "@/lib/community-operator-import/draft-store";
import { loadInboxRow } from "@/lib/community-operator-import/inbox-store";
import { buildPublishContent } from "@/lib/community-operator-import/publish-content";
import { QUALITY_REASON_LABELS } from "@/lib/community-operator-import/quality";
import { loadRules, rulesFor } from "@/lib/community-operator-import/rules";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Source article (fresh fetch) + saved draft edit + publish link, for the compare editor. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const key = {
    sourceSite: String(sp.get("site") || ""),
    sourceBoard: String(sp.get("board") || ""),
    sourceArticleKey: String(sp.get("key") || ""),
  };
  if (!key.sourceSite || !key.sourceBoard || !key.sourceArticleKey) {
    return jsonError("site, board, key 필요", 400, { code: "key_required" });
  }
  try {
    const sb = getSupabaseServer();
    const { article, source, board } = await fetchArticleForInbox(sb, key);
    const [draft, inbox, rules] = await Promise.all([loadOperatorImportDraft(sb, key), loadInboxRow(sb, key), loadRules(sb)]);
    let edit = draft ? carryEditToArticle(draft.edit, draft.original, article) : ensureDraftEdit(article, null);
    if (!edit.topicId && board.defaultTopicId) {
      const { data: t } = await sb.from("community_topics").select("id, slug").eq("id", board.defaultTopicId).maybeSingle();
      if (t) edit = { ...edit, topicId: String((t as { id: string }).id), topicSlug: String((t as { slug: string }).slug) };
    }
    // The community post this article is published as (provenance link), for status + management.
    const { data: link } = await sb
      .from("community_import_post_links")
      .select("post_id")
      .match({ source_site: key.sourceSite, source_board: key.sourceBoard, source_article_key: key.sourceArticleKey })
      .maybeSingle();
    const linkedPostId = (link as { post_id?: string } | null)?.post_id ?? null;
    const { data: postRow } = linkedPostId
      ? await sb.from("community_posts").select("id, title, status, topic_slug, updated_at").eq("id", linkedPostId).maybeSingle()
      : { data: null };
    const preview = buildPublishContent({
      article,
      edit,
      sourcePolicy: source.contentPolicy,
      sourceName: source.displayName,
      rules: rulesFor(rules, key.sourceSite, key.sourceBoard),
    });
    return jsonOk({
      article,
      edit,
      draft: draft ? { status: draft.status, publishedPostId: draft.publishedPostId, updatedAt: draft.updatedAt } : null,
      inbox,
      source: { id: source.id, displayName: source.displayName, contentPolicy: source.contentPolicy, baseUrl: source.baseUrl },
      board: { boardId: board.boardId, displayName: board.displayName, defaultTopicId: board.defaultTopicId },
      preview,
      post: postRow
        ? {
            id: String((postRow as { id: string }).id),
            title: String((postRow as { title?: string | null }).title ?? ""),
            status: String((postRow as { status?: string | null }).status ?? ""),
            topicSlug: String((postRow as { topic_slug?: string | null }).topic_slug ?? ""),
            updatedAt: String((postRow as { updated_at?: string | null }).updated_at ?? ""),
          }
        : null,
      qualityLabels: QUALITY_REASON_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "detail_failed";
    return jsonError(msg, 502, { code: "detail_failed" });
  }
}
