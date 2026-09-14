import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";
import { publishExternalBoardArticleCanonical } from "@/lib/external-board-import/publish/canonical-publisher";
import { getExternalBoardSource } from "@/lib/external-board-import/registry/source-board-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MANUAL selection publish — publishes ONLY the explicit articleIds.
 * Never drains unpublished queue / source-all / AUTO scheduler.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as { articleIds?: unknown };
    const ids = Array.isArray(body.articleIds)
      ? [...new Set(body.articleIds.map((x) => String(x ?? "").trim()).filter(Boolean))]
      : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "게시할 글을 선택하세요.", communityDelta: 0, results: [] },
        { status: 400 }
      );
    }
    if (ids.length > 50) {
      return NextResponse.json(
        { ok: false, error: "한 번에 최대 50개까지 선택할 수 있습니다.", communityDelta: 0, results: [] },
        { status: 400 }
      );
    }

    const sb = getSupabaseServer();
    const results: Array<{
      articleId: string;
      ok: boolean;
      postId?: string;
      failureCode?: string;
      failureMessage?: string;
    }> = [];
    let communityDelta = 0;

    for (const articleId of ids) {
      const article = await getExternalBoardArticle(sb, articleId);
      if (!article) {
        results.push({
          articleId,
          ok: false,
          failureCode: "article_not_found",
          failureMessage: "글을 찾을 수 없습니다.",
        });
        continue;
      }
      if (article.published_post_id) {
        results.push({
          articleId,
          ok: false,
          failureCode: "already_published",
          failureMessage: "이미 게시 완료된 글입니다.",
          postId: article.published_post_id,
        });
        continue;
      }
      const source = await getExternalBoardSource(sb, article.source_id);
      if (!source) {
        results.push({
          articleId,
          ok: false,
          failureCode: "source_not_found",
          failureMessage: "게시판을 찾을 수 없습니다.",
        });
        continue;
      }
      if (source.enabled === false) {
        results.push({
          articleId,
          ok: false,
          failureCode: "source_disabled",
          failureMessage: "중지된 게시판입니다.",
        });
        continue;
      }
      const result = await publishExternalBoardArticleCanonical(sb, source, articleId);
      if (result.ok) {
        communityDelta += 1;
        results.push({ articleId, ok: true, postId: result.postId });
      } else {
        results.push({
          articleId,
          ok: false,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
          postId: result.alreadyPublishedPostId,
        });
      }
    }

    return NextResponse.json({
      ok: results.every((r) => r.ok),
      communityDelta,
      requested: ids.length,
      published: communityDelta,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error).message), communityDelta: 0, results: [] },
      { status: 500 }
    );
  }
}
