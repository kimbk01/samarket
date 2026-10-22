import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import {
  getNeighborhoodDevSamplePost,
  toggleNeighborhoodDevSamplePostLike,
} from "@/lib/neighborhood/dev-sample-data";
import { notifyCommunityPostLikeReceived } from "@/lib/notifications/community-social-inapp-notify";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertPostEngagementAllowed(sb: ReturnType<typeof getSupabaseServer>, postId: string, userId: string) {
  const { data: postRow, error } = await sb
    .from("community_posts")
    .select("user_id, status, is_deleted, is_hidden")
    .eq("id", postId)
    .maybeSingle();
  if (error && isMissingDbColumnError(error, "user_id")) {
    return { ok: false as const, status: 500, error: "post_load_failed" };
  }
  const post = postRow as Record<string, unknown> | null;
  if (!post?.user_id) return { ok: false as const, status: 404, error: "not_found" };
  const authorId = String(post.user_id);
  const visible = isCommunityPostPubliclyVisible(post as never) || authorId === userId;
  if (!visible) return { ok: false as const, status: 404, error: "not_found" };
  if (await isBlockedEitherWay(userId, authorId)) {
    return { ok: false as const, status: 403, error: "community_like_blocked_relation" };
  }
  return {
    ok: true as const,
    authorId,
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
      const next = toggleNeighborhoodDevSamplePostLike(id, auth.userId);
      if (!next) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true, liked: next.liked, like_count: next.like_count, fallback: "dev_samples" });
    }
    const sb = getSupabaseServer();
    const gate = await assertPostEngagementAllowed(sb, id, auth.userId);
    if (!gate.ok) {
      const msg =
        gate.error === "community_like_blocked_relation" ? "차단 관계에서는 공감할 수 없습니다." : gate.error;
      return NextResponse.json({ ok: false, error: msg, code: gate.error }, { status: gate.status });
    }

    /**
     * `{ liked: boolean }` 를 보내면 그 상태로 맞춘다(멱등) — 재시도·동시 요청에도 결과가 같다 (CM-R-08).
     * 본문 없이 오면 기존 토글(구 클라이언트 호환).
     */
    let desired: boolean | null = null;
    try {
      const body = (await req.json()) as { liked?: unknown };
      if (typeof body?.liked === "boolean") desired = body.liked;
    } catch {
      desired = null;
    }
    const { data: ex } = await sb
      .from("community_post_likes")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    const liked = desired ?? !ex;
    if (liked === Boolean(ex)) {
      // 이미 원하는 상태 — 변경 없음
    } else if (!liked) {
      const { error: delErr } = await sb
        .from("community_post_likes")
        .delete()
        .eq("post_id", id)
        .eq("user_id", auth.userId);
      if (delErr) {
        return NextResponse.json({ ok: false, error: delErr.message ?? "like_failed" }, { status: 500 });
      }
    } else {
      const { data: likeRow, error: insErr } = await sb
        .from("community_post_likes")
        .insert({ post_id: id, user_id: auth.userId })
        .select("id")
        .single();
      if (insErr) {
        /** 동시 요청으로 이미 들어간 공감(UNIQUE 위반)은 성공으로 본다 */
        if ((insErr as { code?: string }).code !== "23505") {
          return NextResponse.json({ ok: false, error: insErr.message ?? "like_failed" }, { status: 500 });
        }
      }
      const likeId = String((likeRow as { id?: string } | null)?.id ?? "").trim();
      if (liked && gate.authorId && likeId) {
        const principalId = await loadCommunityImportPrincipalUserId(sb);
        const recipientIsRealMember = Boolean(
          gate.authorId && (!principalId || gate.authorId !== principalId)
        );
        if (recipientIsRealMember) {
          void notifyCommunityPostLikeReceived(sb, {
            postId: id,
            postAuthorUserId: gate.authorId,
            likerUserId: auth.userId,
            likeId,
          }).catch(() => {});
        }
      }
    }
    const { data: postAfter } = await sb.from("community_posts").select("like_count").eq("id", id).maybeSingle();
    const likeCount = Number((postAfter as { like_count?: number } | null)?.like_count ?? 0);

    return NextResponse.json({ ok: true, liked, like_count: likeCount });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE — 본인 공감 해제 전용(최종 설계 C.0.3 A6 · S27). POST 토글 규칙·알림은 불변.
 * - 본인 행 삭제는 글 공개 여부(숨김·삭제)·차단 관계와 무관하게 허용(v2 D12) — 내 활동에서 정리 가능해야 함.
 * - 행이 없어도 200(멱등). 다른 회원의 행에는 영향 없음(`user_id = 세션`).
 * - `like_count` 는 기존 트리거/집계 그대로(이 라우트가 직접 쓰지 않음).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = (await resolveCanonicalCommunityPostId(raw)) ?? raw;
    const sb = getSupabaseServer();
    const { error: delErr } = await sb
      .from("community_post_likes")
      .delete()
      .eq("post_id", id)
      .eq("user_id", auth.userId);
    if (delErr) {
      return NextResponse.json({ ok: false, error: "unlike_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, liked: false });
  } catch {
    return NextResponse.json({ ok: false, error: "unlike_failed" }, { status: 500 });
  }
}
