import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import {
  getNeighborhoodDevSamplePost,
  getNeighborhoodDevSamplePostViewCount,
  incrementNeighborhoodDevSamplePostView,
} from "@/lib/neighborhood/dev-sample-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_KEY_COOKIE = "dibay_community_viewer_key";

function readViewerKey(req: NextRequest): string | null {
  const fromCookie = req.cookies.get(VIEWER_KEY_COOKIE)?.value?.trim();
  if (fromCookie) return fromCookie;
  return req.headers.get("x-dibay-viewer-key")?.trim() || null;
}

function jsonWithOptionalViewerKey(
  body: Record<string, unknown>,
  status: number,
  viewerKey: string | null,
  setNewKey: boolean
) {
  const res = NextResponse.json(body, { status });
  if (setNewKey && viewerKey) {
    res.cookies.set(VIEWER_KEY_COOKIE, viewerKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false }, { status: 404 });

    const viewerUserId = await getOptionalAuthenticatedUserId();
    let viewerKey = viewerUserId ? null : readViewerKey(req);
    const needNewKey = !viewerUserId && !viewerKey;
    if (needNewKey) viewerKey = crypto.randomUUID();

    if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
      const actorKey = viewerUserId ? `u:${viewerUserId}` : `k:${viewerKey}`;
      const sample = getNeighborhoodDevSamplePost(id);
      if (viewerUserId && sample?.author_id === viewerUserId) {
        return jsonWithOptionalViewerKey(
          {
            ok: true,
            view_count: getNeighborhoodDevSamplePostViewCount(id) ?? 0,
            deduped: true,
            counted: false,
            fallback: "dev_samples",
          },
          200,
          viewerKey,
          needNewKey
        );
      }
      const vc = incrementNeighborhoodDevSamplePostView(id) ?? 0;
      return jsonWithOptionalViewerKey(
        { ok: true, view_count: vc, deduped: false, counted: true, fallback: "dev_samples", actorKey },
        200,
        viewerKey,
        needNewKey
      );
    }

    const sb = getSupabaseServer();
    const { data: postRow } = await sb
      .from("community_posts")
      .select("id, user_id, status, is_deleted, is_hidden")
      .eq("id", id)
      .maybeSingle();
    const post = postRow as Record<string, unknown> | null;
    if (!post?.id || !isCommunityPostPubliclyVisible(post as never)) {
      return NextResponse.json({ ok: false, error: "not_visible" }, { status: 404 });
    }

    if (viewerUserId && post.user_id) {
      const authorId = String(post.user_id);
      if (authorId === viewerUserId) {
        const { data: row } = await sb.from("community_posts").select("view_count").eq("id", id).maybeSingle();
        return jsonWithOptionalViewerKey(
          {
            ok: true,
            view_count: Number((row as { view_count?: number } | null)?.view_count ?? 0),
            deduped: true,
            counted: false,
            reason: "author_self",
          },
          200,
          viewerKey,
          needNewKey
        );
      }
      if (await isBlockedEitherWay(viewerUserId, authorId)) {
        return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
      }
    }

    const { data: rpcData, error: rpcErr } = await sb.rpc("record_community_post_view", {
      p_post_id: id,
      p_viewer_user_id: viewerUserId ?? null,
      p_viewer_key: viewerUserId ? null : viewerKey,
    });

    if (!rpcErr && rpcData && typeof rpcData === "object") {
      const payload = rpcData as Record<string, unknown>;
      return jsonWithOptionalViewerKey(
        {
          ok: payload.ok !== false,
          view_count: Number(payload.view_count ?? 0),
          deduped: payload.deduped === true,
          counted: payload.counted === true,
        },
        payload.ok === false ? 404 : 200,
        viewerKey,
        needNewKey
      );
    }

    const rpcMsg = rpcErr?.message ?? "";
    if (rpcMsg.includes("record_community_post_view") || rpcMsg.includes("community_post_views")) {
      const { data: row } = await sb.from("community_posts").select("view_count").eq("id", id).maybeSingle();
      const vc = Number((row as { view_count?: number } | null)?.view_count ?? 0);
      return jsonWithOptionalViewerKey(
        { ok: true, view_count: vc, deduped: true, counted: false, migration_required: true },
        200,
        viewerKey,
        needNewKey
      );
    }

    const { data: row } = await sb.from("community_posts").select("view_count").eq("id", id).maybeSingle();
    const vc = Number((row as { view_count?: number } | null)?.view_count ?? 0);
    return jsonWithOptionalViewerKey({ ok: true, view_count: vc, deduped: true, counted: false }, 200, viewerKey, needNewKey);
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
