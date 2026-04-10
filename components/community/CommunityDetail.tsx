"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  getCurrentUser,
  getHydrationSafeCurrentUser,
} from "@/lib/auth/get-current-user";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodCommentNode, NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { formatTimeAgo } from "@/lib/utils/format";
import { createCommunityFeedPostReport } from "@/lib/reports/createCommunityFeedPostReport";
import { CommentList } from "./CommentList";
import { MeetingCard } from "./MeetingCard";
import { NeighborFollowButton } from "./NeighborFollowButton";
import { UserBlockButton } from "./UserBlockButton";
import {
  philifeNeighborhoodPostUrl,
  philifePostCommentsUrl,
  philifePostLikeUrl,
  philifePostViewUrl,
} from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import { AdApplyButton } from "@/components/ads/AdApplyButton";
import { logClientPerf, perfNow } from "@/lib/performance/samarket-perf";

function CommentLockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export function CommunityDetail({
  post,
  meeting,
  initialComments,
  viewerJoinedMeeting = false,
}: {
  post: NeighborhoodFeedPostDTO;
  meeting: NeighborhoodMeetingDetailDTO | null;
  initialComments: NeighborhoodCommentNode[];
  /** 모임 글: 참여(또는 호스트)일 때만 댓글 작성·목록 허용 */
  viewerJoinedMeeting?: boolean;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [comments, setComments] = useState(initialComments);
  const [commentsLoading, setCommentsLoading] = useState(initialComments.length === 0);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [scrollSig, setScrollSig] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportErr, setReportErr] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const mountedAtRef = useRef<number>(perfNow());
  const firstCommentsReadyLoggedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const tier1Title = meeting ? "모임" : post.category_label?.trim() || "커뮤니티";

  useEffect(() => {
    setComments(initialComments);
    setCommentsLoading(initialComments.length === 0);
  }, [initialComments, post.id]);

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
    const viewedKey = `community:viewed:${post.id}`;
    try {
      if (window.sessionStorage.getItem(viewedKey) === "1") return;
    } catch {
      /* ignore storage read errors */
    }

    const run = () => {
      void (async () => {
        try {
          const res = await fetch(philifePostViewUrl(post.id), { method: "POST" });
          const data = (await res.json()) as { ok?: boolean; view_count?: number };
          if (data.ok && typeof data.view_count === "number") {
            setViewCount(data.view_count);
            try {
              window.sessionStorage.setItem(viewedKey, "1");
            } catch {
              /* ignore storage write errors */
            }
          }
        } catch {
          /* ignore */
        }
      })();
    };

    const ric = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(run, { timeout: 2200 });
      return () => {
        const cancel = (globalThis as typeof globalThis & { cancelIdleCallback?: (n: number) => void })
          .cancelIdleCallback;
        if (typeof cancel === "function") cancel(id);
      };
    }
    const t = window.setTimeout(run, 1);
    return () => window.clearTimeout(t);
  }, [post.id]);

  const flatCommentCount = useCallback((nodes: NeighborhoodCommentNode[]): number => {
    let n = 0;
    const walk = (arr: NeighborhoodCommentNode[]) => {
      for (const x of arr) {
        n += 1;
        if (x.children.length) walk(x.children);
      }
    };
    walk(nodes);
    return n;
  }, []);

  const refreshComments = useCallback(
    async (opts?: { silent?: boolean }) => {
      const startedAt = perfNow();
      const silent = opts?.silent === true;
      if (!silent) setCommentsLoading(true);
      try {
        const res = await fetch(philifePostCommentsUrl(post.id), { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          comments?: {
            id: string;
            post_id: string;
            user_id: string;
            parent_id: string | null;
            content: string;
            created_at: string;
            author_name: string;
          }[];
        };
        if (!data.ok || !data.comments) return;
        const rows = data.comments;
        const nodes: NeighborhoodCommentNode[] = rows.map((r) => ({
          id: r.id,
          post_id: r.post_id,
          user_id: r.user_id,
          parent_id: r.parent_id,
          content: r.content,
          created_at: r.created_at,
          author_name: r.author_name,
          children: [],
        }));
        const byId = new Map(nodes.map((x) => [x.id, x]));
        const roots: NeighborhoodCommentNode[] = [];
        for (const x of nodes) {
          if (x.parent_id && byId.has(x.parent_id)) {
            byId.get(x.parent_id)!.children.push(x);
          } else {
            roots.push(x);
          }
        }
        setComments(roots);
        logClientPerf("community-detail.comments", {
          postId: post.id,
          silent,
          count: roots.length,
          elapsedMs: Math.round(perfNow() - startedAt),
        });
      } finally {
        if (!silent) setCommentsLoading(false);
      }
    },
    [post.id]
  );

  useEffect(() => {
    if (initialComments.length > 0) return;
    void refreshComments();
  }, [initialComments.length, refreshComments]);

  useEffect(() => {
    if (firstCommentsReadyLoggedRef.current) return;
    if (commentsLoading) return;
    firstCommentsReadyLoggedRef.current = true;
    logClientPerf("community-detail.first-ready", {
      postId: post.id,
      commentsCount: comments.length,
      sinceMountMs: Math.round(perfNow() - mountedAtRef.current),
    });
  }, [commentsLoading, comments.length, post.id]);

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

  const onSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = commentText.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch(philifePostCommentsUrl(post.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: t, parentId: parentId ?? undefined }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        setCommentText("");
        setParentId(null);
        await refreshComments({ silent: true });
        setScrollSig((s) => s + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDeletePost = async () => {
    if (!me?.id || me.id !== post.author_id) return;
    if (!window.confirm("이 글을 삭제할까요? (복구 불가)")) return;
    setBusy(true);
    setDeleteErr("");
    try {
      const res = await fetch(philifeNeighborhoodPostUrl(post.id), { method: "DELETE" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.replace(philifeAppPaths.home);
      else setDeleteErr(j.error ?? "삭제에 실패했습니다.");
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

  const meetingHostDisplay =
    meeting &&
    (isSameUserId(post.author_id, meeting.host_user_id) ||
      isSameUserId(post.author_id, meeting.created_by))
      ? post.author_name
      : meeting
        ? meeting.host_user_id.slice(0, 8)
        : undefined;

  const commentsLocked = Boolean(meeting && !viewerJoinedMeeting);

  const meetingToolbarBtn =
    "flex min-h-[44px] w-full items-center justify-center rounded-ui-rect border border-gray-200 bg-white px-1 py-2 text-center text-[11px] font-medium leading-tight text-gray-800 sm:text-[12px] disabled:opacity-50";
  const meetingToolbarWrap =
    "min-w-0 [&>button]:flex [&>button]:min-h-[44px] [&>button]:w-full [&>button]:items-center [&>button]:justify-center [&>button]:rounded-ui-rect [&>button]:border [&>button]:border-gray-200 [&>button]:bg-white [&>button]:px-1 [&>button]:py-2 [&>button]:text-center [&>button]:text-[11px] [&>button]:font-medium [&>button]:leading-tight [&>button]:text-gray-800 sm:[&>button]:text-[12px]";

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <article className={`w-full min-w-0 pb-4 pt-2 ${APP_MAIN_GUTTER_X_CLASS}`}>
        <div className="overflow-hidden rounded-ui-rect border border-gray-100 bg-white shadow-sm">
          {post.images.length > 0 ? (
            <div className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2">
              {post.images.map((url, i) =>
                url ? (
                  <a
                    key={`${url}-${i}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={`block overflow-hidden bg-gray-100 ${i === 0 ? "sm:col-span-2" : ""}`}
                  >
                    <img
                      src={url}
                      alt=""
                      className={`w-full object-cover ${i === 0 ? "max-h-[min(52vh,420px)] min-h-[200px]" : "h-44"}`}
                      loading={i === 0 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  </a>
                ) : null
              )}
            </div>
          ) : null}

          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-ui-rect bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {meeting ? "모임" : post.category_label}
              </span>
            </div>
            <h1 className="mt-3 text-xl font-bold text-gray-900">{post.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-gray-500">
              <span>{post.author_name}</span>
              {post.location_label ? <span>{post.location_label}</span> : null}
              <span>{time}</span>
              <span>조회 {viewCount}</span>
              <span>댓글 {flatCommentCount(comments)}</span>
            </div>
            <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
              {meeting ? stripMeetupPostMetaFromContent(post.content) : post.content}
            </div>

            {meeting ? (
              <div className="mt-5">
                <MeetingCard
                  meeting={meeting}
                  variant="postEmbed"
                  hostDisplayName={meetingHostDisplay}
                  viewerStatus={viewerJoinedMeeting ? "joined" : null}
                />
              </div>
            ) : null}
          </div>

          {meeting ? (
            <div className="grid grid-cols-3 gap-2 border-t border-gray-100 px-4 py-4 sm:grid-cols-6">
              <button type="button" disabled={busy} onClick={() => void onLike()} className={meetingToolbarBtn}>
                공감 {likeCount}
              </button>
              {me?.id && me.id !== post.author_id ? (
                <div className={meetingToolbarWrap}>
                  <NeighborFollowButton targetUserId={post.author_id} />
                </div>
              ) : (
                <div className="min-h-[44px]" aria-hidden />
              )}
              {me?.id && me.id !== post.author_id ? (
                <div className={meetingToolbarWrap}>
                  <UserBlockButton targetUserId={post.author_id} />
                </div>
              ) : (
                <div className="min-h-[44px]" aria-hidden />
              )}
              {me?.id ? (
                <Link
                  href={philifeAppPaths.meeting(meeting.id)}
                  className={`${meetingToolbarBtn} border-transparent bg-[#7b3fe4] text-white`}
                >
                  문의
                </Link>
              ) : (
                <button type="button" onClick={() => router.push("/login")} className={meetingToolbarBtn}>
                  문의
                </button>
              )}
              {me?.id && me.id !== post.author_id ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportErr("");
                    setReportOpen(true);
                  }}
                  className={`${meetingToolbarBtn} border-red-200 bg-red-50 text-red-800`}
                >
                  신고
                </button>
              ) : (
                <div className="min-h-[44px]" aria-hidden />
              )}
              <Link href={philifeAppPaths.home} className={`${meetingToolbarBtn} text-gray-700`}>
                목록
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onLike()}
                className="rounded-ui-rect border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-gray-800"
              >
                공감 {likeCount}
              </button>
              {me?.id && me.id !== post.author_id ? <NeighborFollowButton targetUserId={post.author_id} /> : null}
              {me?.id && me.id !== post.author_id ? <UserBlockButton targetUserId={post.author_id} /> : null}
              {me?.id && me.id !== post.author_id ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportErr("");
                    setReportOpen(true);
                  }}
                  className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-medium text-red-800"
                >
                  신고
                </button>
              ) : null}
              <Link href={philifeAppPaths.home} className="rounded-ui-rect border border-gray-200 px-4 py-2 text-[13px] text-gray-600">
                목록
              </Link>
              {me?.id && me.id === post.author_id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeletePost()}
                  className="rounded-ui-rect border border-gray-300 bg-gray-100 px-4 py-2 text-[13px] font-medium text-gray-800"
                >
                  삭제
                </button>
              ) : null}
            </div>
          )}
          {meeting && me?.id && me.id === post.author_id ? (
            <div className="border-t border-gray-100 px-4 pb-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDeletePost()}
                className="rounded-ui-rect border border-gray-300 bg-gray-100 px-4 py-2 text-[13px] font-medium text-gray-800"
              >
                삭제
              </button>
            </div>
          ) : null}
          {deleteErr ? <p className="px-4 pb-2 text-[12px] text-red-600">{deleteErr}</p> : null}

          {/* 내 글일 때: 광고 신청 버튼 */}
          {me?.id && me.id === post.author_id && (
            <div className="border-t border-gray-100 px-4 py-4">
              <p className="mb-2 text-[12px] font-semibold text-gray-500">내 게시글 광고</p>
              <AdApplyButton
                postId={post.id}
                postTitle={post.title}
                boardKey="plife"
              />
            </div>
          )}
        </div>

        {reportOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog">
            <div className="w-full max-w-md rounded-ui-rect bg-white p-4 shadow-xl">
              <p className="text-[15px] font-semibold text-gray-900">게시글 신고</p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={4}
                className="mt-3 w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
              />
              {reportErr ? <p className="mt-1 text-[12px] text-red-600">{reportErr}</p> : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="flex-1 rounded-ui-rect border border-gray-200 py-2.5 text-[14px]"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={busy || !reportText.trim()}
                  onClick={() => void onReport()}
                  className="flex-1 rounded-ui-rect bg-gray-900 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
                >
                  접수
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="mt-4 rounded-ui-rect border border-gray-100 bg-white p-4 shadow-sm" id="comments">
          <h2 className="text-[15px] font-semibold text-gray-900">댓글</h2>
          {commentsLocked ? (
            <div className="mt-3 flex min-h-[88px] items-center justify-center gap-2 rounded-ui-rect bg-gray-100 px-4 py-4 text-[13px] text-gray-500">
              <CommentLockIcon className="h-5 w-5 shrink-0 text-gray-400" />
              <span>
                {!me?.id
                  ? "로그인 후 모임에 참여하면 댓글을 작성할 수 있어요."
                  : "모임 참여 후 댓글을 작성할 수 있어요."}
              </span>
            </div>
          ) : (
            <>
              {parentId ? (
                <p className="mt-1 text-[12px] text-gray-500">
                  대댓글 작성 중 ·{" "}
                  <button type="button" className="text-sky-700 underline" onClick={() => setParentId(null)}>
                    취소
                  </button>
                </p>
              ) : null}
              <div className="max-h-[420px] overflow-y-auto pr-1">
                {commentsLoading ? (
                  <div className="py-6 text-center text-[13px] text-gray-400">댓글 불러오는 중…</div>
                ) : (
                  <CommentList
                    roots={comments}
                    scrollToBottomSignal={scrollSig}
                    onReply={(id) => setParentId(id)}
                  />
                )}
              </div>

              <form onSubmit={onSubmitComment} className="mt-4 border-t border-gray-100 pt-4">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={me?.id ? "댓글을 입력하세요" : "로그인 후 댓글을 작성할 수 있어요"}
                  disabled={!me?.id || busy}
                  rows={3}
                  className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px] outline-none"
                />
                {me?.id ? (
                  <p className="mt-1 text-[11px] text-gray-500">
                    특정 댓글에 답장하려면 아래 댓글의「답글」을 누르세요.
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={!me?.id || busy || !commentText.trim()}
                  className="mt-2 w-full rounded-ui-rect bg-gray-900 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
                >
                  등록
                </button>
              </form>
            </>
          )}
        </section>
      </article>
    </div>
  );
}
