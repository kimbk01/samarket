"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  getCurrentUser,
  getHydrationSafeCurrentUser,
} from "@/lib/auth/get-current-user";
import type { CommunityCommentDTO, CommunityPostDetailDTO } from "@/lib/community-feed/types";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { formatTimeAgo } from "@/lib/utils/format";
import { createCommunityFeedPostReport } from "@/lib/reports/createCommunityFeedPostReport";
import {
  fetchCommunityPostCommentsDeduped,
  invalidateCommunityPostCommentsDeduped,
} from "@/lib/community/fetch-community-post-comments-deduped";
import { philifePostCommentsUrl, philifePostLikeUrl, philifePostViewUrl } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import { NeighborhoodInterleavedContent } from "@/components/community/NeighborhoodInterleavedContent";
import { hasInterleavedMarkdownImageSyntax } from "@/lib/philife/interleaved-body-markdown";
import {
  PHILIFE_DETAIL_BODY_CLASS,
  PHILIFE_DETAIL_COMMENTS_WRAP_CLASS,
  PHILIFE_DETAIL_META_CLASS,
  PHILIFE_DETAIL_PAGE_ROOT_CLASS,
  PHILIFE_DETAIL_POST_SLAB_CLASS,
  PHILIFE_DETAIL_TITLE_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

export function CommunityPostDetailClient({
  post,
  initialComments,
}: {
  post: CommunityPostDetailDTO;
  initialComments: CommunityCommentDTO[];
}) {
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [comments, setComments] = useState(initialComments);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportErr, setReportErr] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const tier1Title = post.is_meetup ? "모임" : post.topic_name?.trim() || "커뮤니티";

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        titleText: tier1Title,
        backHref: philifeAppPaths.home,
        preferHistoryBack: true,
        ariaLabel: "피드로",
        showHubQuickActions: true,
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, tier1Title]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(philifePostViewUrl(post.id), { method: "POST" });
        const data = (await res.json()) as { ok?: boolean; view_count?: number };
        if (data.ok && typeof data.view_count === "number") setViewCount(data.view_count);
      } catch {
        /* ignore */
      }
    })();
  }, [post.id]);

  const onLike = async () => {
    const prevLikeCount = likeCount;
    setBusy(true);
    setLikeCount((count) => count + 1);
    try {
      const res = await fetch(philifePostLikeUrl(post.id), { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; like_count?: number };
      if (data.ok && typeof data.like_count === "number") {
        setLikeCount(data.like_count);
      } else {
        setLikeCount(prevLikeCount);
      }
    } catch {
      setLikeCount(prevLikeCount);
    } finally {
      setBusy(false);
    }
  };

  const refreshComments = useCallback(
    async (opts?: { force?: boolean }) => {
      const result = await fetchCommunityPostCommentsDeduped(post.id, {
        force: opts?.force === true,
      });
      const data = result.json as { ok?: boolean; comments?: CommunityCommentDTO[] };
      if (result.status >= 200 && result.status < 300 && data.ok && data.comments) {
        setComments(data.comments);
      }
    },
    [post.id]
  );

  useRefetchOnPageShowRestore(() => void refreshComments({ force: true }));

  const onSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = commentText.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch(philifePostCommentsUrl(post.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: t }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        setCommentText("");
        invalidateCommunityPostCommentsDeduped(post.id);
        await refreshComments({ force: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const onReport = async () => {
    setReportErr("");
    setBusy(true);
    try {
      const res = await createCommunityFeedPostReport(post.id, reportText);
      if (res.ok) {
        setReportOpen(false);
        setReportText("");
      } else setReportErr(res.error);
    } finally {
      setBusy(false);
    }
  };

  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at))
      ? formatTimeAgo(post.created_at, "ko-KR")
      : "";

  return (
    <div className={`${PHILIFE_DETAIL_PAGE_ROOT_CLASS} pb-24`}>
      <article className={`w-full min-w-0 pb-4 pt-2 ${APP_MAIN_GUTTER_X_CLASS}`}>
        <div className={`${PHILIFE_DETAIL_POST_SLAB_CLASS} p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-ui-rect px-2 py-0.5 sam-text-xxs font-semibold text-white"
              style={{ backgroundColor: post.topic_color ?? "#64748b" }}
            >
              {post.topic_name}
            </span>
            {post.is_question ? (
              <span className="rounded-ui-rect bg-amber-100 px-1.5 py-0.5 sam-text-xxs font-medium text-amber-900">질문</span>
            ) : null}
          </div>
          <h1 className={PHILIFE_DETAIL_TITLE_CLASS}>{post.title}</h1>
          <div className={PHILIFE_DETAIL_META_CLASS}>
            <span>{post.author_name}</span>
            {post.region_label ? <span>{post.region_label}</span> : null}
            <span>{time}</span>
            <span>조회 {viewCount}</span>
            <span>댓글 {comments.length}</span>
          </div>
          {post.is_meetup ? (
            <div className={PHILIFE_DETAIL_BODY_CLASS}>{stripMeetupPostMetaFromContent(post.content)}</div>
          ) : hasInterleavedMarkdownImageSyntax(post.content) ? (
            <NeighborhoodInterleavedContent content={post.content} />
          ) : (
            <>
              <div className={PHILIFE_DETAIL_BODY_CLASS}>{post.content}</div>
              {post.images.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {post.images.map((im) =>
                    im.url ? (
                      <a
                        key={im.id}
                        href={im.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-ui-rect bg-sam-surface-muted"
                      >
                        <img
                          src={im.url}
                          alt=""
                          className="h-40 w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                        />
                      </a>
                    ) : null
                  )}
                </div>
              ) : null}
            </>
          )}

          {post.is_meetup && (post.meetup_date || post.meetup_place) ? (
            <div className="mt-4 rounded-ui-rect bg-emerald-50 px-3 py-2 sam-text-body-secondary text-emerald-900">
              {post.meetup_date ? <p>일시: {new Date(post.meetup_date).toLocaleString("ko-KR")}</p> : null}
              {post.meetup_place ? <p>장소: {post.meetup_place}</p> : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-sam-border-soft pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLike()}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
            >
              공감 {likeCount}
            </button>
            {me?.id && me.id !== post.author_id ? (
              <button
                type="button"
                onClick={() => {
                  setReportErr("");
                  setReportOpen(true);
                }}
                className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-2 sam-text-body-secondary font-medium text-red-800"
              >
                신고
              </button>
            ) : null}
            <Link href={philifeAppPaths.home} className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body-secondary text-sam-muted">
              목록
            </Link>
          </div>
        </div>

        {reportOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog">
            <div className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-4 ring-1 ring-black/[0.08]">
              <p className="sam-text-body font-semibold text-sam-fg">게시글 신고</p>
              <p className="mt-1 sam-text-helper text-sam-muted">신고 사유를 적어 주세요. 운영팀이 확인합니다.</p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={4}
                className="mt-3 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                placeholder="예: 스팸, 욕설, 사기 의심 등"
              />
              {reportErr ? <p className="mt-1 sam-text-helper text-red-600">{reportErr}</p> : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body text-sam-fg"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={busy || !reportText.trim()}
                  onClick={() => void onReport()}
                  className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white disabled:opacity-40"
                >
                  접수
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className={`${PHILIFE_DETAIL_COMMENTS_WRAP_CLASS} mt-4`} id="comments">
          <h2 className="sam-text-body font-semibold text-sam-fg">댓글 {comments.length}</h2>
          <ul className="mt-3 divide-y divide-sam-border-soft">
            {comments.map((c) => (
              <li key={c.id} className="py-3">
                <p className="sam-text-helper font-medium text-sam-muted">{c.author_name}</p>
                <p className="mt-1 sam-text-body text-sam-fg">{c.content}</p>
                <p className="mt-1 sam-text-xxs text-sam-meta">
                  {c.created_at && !Number.isNaN(Date.parse(c.created_at))
                    ? formatTimeAgo(c.created_at, "ko-KR")
                    : ""}
                </p>
              </li>
            ))}
          </ul>

          <form onSubmit={onSubmitComment} className="mt-4 border-t border-sam-border-soft pt-4">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={me?.id ? "댓글을 입력하세요" : "로그인 후 댓글을 작성할 수 있어요"}
              disabled={!me?.id || busy}
              rows={3}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body outline-none focus:border-sam-border"
            />
            <button
              type="submit"
              disabled={!me?.id || busy || !commentText.trim()}
              className="mt-2 w-full rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white disabled:opacity-40"
            >
              등록
            </button>
          </form>
        </section>
      </article>
    </div>
  );
}
