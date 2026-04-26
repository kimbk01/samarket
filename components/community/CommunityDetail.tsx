"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodCommentNode, NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { createCommunityFeedPostReport } from "@/lib/reports/createCommunityFeedPostReport";
import {
  fetchCommunityPostCommentsDeduped,
  invalidateCommunityPostCommentsDeduped,
} from "@/lib/community/fetch-community-post-comments-deduped";
import { NeighborFollowButton } from "./NeighborFollowButton";
import { UserBlockButton } from "./UserBlockButton";
import {
  philifeNeighborhoodPostUrl,
  philifePostCommentLikeUrl,
  philifePostCommentUrl,
  philifePostCommentsUrl,
  philifePostLikeUrl,
  philifePostViewUrl,
} from "@domain/philife/api";
import { updateCommentInTree } from "@/lib/neighborhood/comment-tree";
import { philifeAppPaths } from "@domain/philife/paths";
import { AdApplyButton } from "@/components/ads/AdApplyButton";
import { logClientPerf, perfNow } from "@/lib/performance/samarket-perf";
import {
  recordRouteEntryFetchNetworkFromResources,
  recordRouteEntryFirstContentRender,
  recordRouteEntryFirstInteractive,
  recordRouteEntryFullRender,
  recordRouteEntryJsonParseComplete,
  recordRouteEntryRouteTotalMs,
  scheduleRouteEntryToPaint,
} from "@/lib/runtime/samarket-runtime-debug";
import { extractPostDetailHashtagsForDisplay } from "./post-detail/post-detail-utils";
import { CommunityPostDetailHeader } from "./post-detail/CommunityPostDetailHeader";
import { CommunityPostCategoryRow } from "./post-detail/CommunityPostCategoryRow";
import { CommunityPostDetailAuthorRow } from "./post-detail/CommunityPostDetailAuthorRow";
import { CommunityPostDetailBody } from "./post-detail/CommunityPostDetailBody";
import { CommunityPostDetailTags } from "./post-detail/CommunityPostDetailTags";
import {
  CommunityPostDetailStatsActions,
} from "./post-detail/CommunityPostDetailStatsActions";
import { CommunityCommentSection } from "./post-detail/CommunityCommentSection";
import { CommunityRelatedAlertTags } from "./post-detail/CommunityRelatedAlertTags";
import { CommunityInlineAdCard } from "./post-detail/CommunityInlineAdCard";
import { CommunitySimilarPostsSection } from "./post-detail/CommunitySimilarPostsSection";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  COMMUNITY_MODAL_PANEL_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
  PHILIFE_DETAIL_PAGE_ROOT_CLASS,
  PHILIFE_DETAIL_POST_SLAB_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

function countNeighborhoodCommentNodesFlat(nodes: NeighborhoodCommentNode[]): number {
  let n = 0;
  const walk = (arr: NeighborhoodCommentNode[]) => {
    for (const x of arr) {
      n += 1;
      if (x.children.length) walk(x.children);
    }
  };
  walk(nodes);
  return n;
}

const meetingToolbarBtn =
  "sam-btn sam-btn--outline sam-btn--block px-1 py-2 text-center disabled:opacity-50";
const meetingToolbarWrap =
  "min-w-0 [&>button]:flex [&>button]:min-h-[44px] [&>button]:w-full [&>button]:items-center [&>button]:justify-center [&>button]:rounded-sam-md [&>button]:border [&>button]:border-sam-border [&>button]:bg-sam-surface [&>button]:px-1 [&>button]:py-2 [&>button]:text-center [&>button]:text-[length:var(--sam-text-body-size)] [&>button]:font-medium [&>button]:leading-[var(--sam-font-body-line)] [&>button]:text-sam-fg";

export function CommunityDetail({
  post,
  meeting,
  initialComments,
  initialCommentsLoaded = false,
  viewerJoinedMeeting = false,
  initialRouteTotalMs,
  similarPosts = [],
}: {
  post: NeighborhoodFeedPostDTO;
  meeting: NeighborhoodMeetingDetailDTO | null;
  initialComments: NeighborhoodCommentNode[];
  initialCommentsLoaded?: boolean;
  viewerJoinedMeeting?: boolean;
  initialRouteTotalMs?: number;
  similarPosts?: NeighborhoodFeedPostDTO[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [postUrl, setPostUrl] = useState("");
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [comments, setComments] = useState(initialComments);
  const [commentsLoading, setCommentsLoading] = useState(
    !initialCommentsLoaded && initialComments.length === 0
  );
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [scrollSig, setScrollSig] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportErr, setReportErr] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const mountedAtRef = useRef<number>(perfNow());
  const firstCommentsReadyLoggedRef = useRef(false);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPostUrl(`${window.location.origin}${pathname || ""}`);
  }, [pathname]);

  const tier1Title = meeting ? "모임" : post.category_label?.trim() || "커뮤니티";
  const hashtags = useMemo(
    () => extractPostDetailHashtagsForDisplay(post.title, post.content, Boolean(meeting) || post.is_meetup),
    [post.title, post.content, meeting, post.is_meetup]
  );

  useEffect(() => {
    setComments(initialComments);
    setCommentsLoading(!initialCommentsLoaded && initialComments.length === 0);
  }, [initialComments, initialCommentsLoaded, post.id]);

  useLayoutEffect(() => {
    recordRouteEntryRouteTotalMs("community_detail", initialRouteTotalMs);
    if (typeof window !== "undefined") {
      recordRouteEntryFetchNetworkFromResources("community_detail", [
        window.location.pathname,
        encodeURIComponent(window.location.pathname),
        "_rsc=",
      ]);
    }
    recordRouteEntryJsonParseComplete("community_detail");
    const root = articleRef.current;
    if (!root) return;
    const hasBodyText = (meeting ? stripMeetupPostMetaFromContent(post.content) : post.content).trim().length > 0;
    if (root.querySelector("h1") && hasBodyText) {
      recordRouteEntryFirstContentRender("community_detail");
      scheduleRouteEntryToPaint("community_detail");
    }
    const interactiveTarget = root.querySelector("button, input, a[href]");
    if (interactiveTarget instanceof HTMLElement && !interactiveTarget.hasAttribute("disabled")) {
      recordRouteEntryFirstInteractive("community_detail");
    }
  }, [initialRouteTotalMs, meeting, post.content]);

  useEffect(() => {
    const viewedKey = `community:viewed:${post.id}`;
    try {
      if (window.sessionStorage.getItem(viewedKey) === "1") return;
    } catch {
      /* ignore */
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
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
      })();
    };
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number })
      .requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(run, { timeout: 2200 });
      return () => {
        const c = (globalThis as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback;
        if (typeof c === "function") c(id);
      };
    }
    const t = window.setTimeout(run, 1);
    return () => window.clearTimeout(t);
  }, [post.id]);

  const displayCommentCount = useMemo(() => countNeighborhoodCommentNodesFlat(comments), [comments]);

  const meForComposer = useMemo(
    () => (me ? { name: me.nickname || "나", avatarUrl: me.avatar_url ?? null } : null),
    [me]
  );

  const refreshComments = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const startedAt = perfNow();
      const silent = opts?.silent === true;
      if (!silent) setCommentsLoading((prev) => (prev ? prev : true));
      try {
        const result = await fetchCommunityPostCommentsDeduped(post.id, { force: opts?.force === true });
        const data = result.json as {
          ok?: boolean;
          tree?: NeighborhoodCommentNode[];
          comments?: {
            id: string;
            post_id: string;
            user_id: string;
            parent_id: string | null;
            content: string;
            created_at: string;
            author_name: string;
            like_count?: number;
            liked_by_viewer?: boolean;
            updated_at?: string;
            is_edited?: boolean;
          }[];
        };
        if (result.status < 200 || result.status >= 300 || !data.ok) return;
        const roots = Array.isArray(data.tree)
          ? data.tree
          : Array.isArray(data.comments)
            ? (() => {
                const nodes: NeighborhoodCommentNode[] = data.comments!.map((r) => {
                  const created = r.created_at;
                  const upd = (r as { updated_at?: string }).updated_at ?? created;
                  const t0 = new Date(created).getTime();
                  const t1 = new Date(upd).getTime();
                  return {
                    id: r.id,
                    post_id: r.post_id,
                    user_id: r.user_id,
                    parent_id: r.parent_id,
                    content: r.content,
                    created_at: created,
                    updated_at: upd,
                    is_edited:
                      typeof r.is_edited === "boolean"
                        ? r.is_edited
                        : !Number.isNaN(t0) && !Number.isNaN(t1) && t1 - t0 > 2000,
                    author_name: r.author_name,
                    like_count: Math.max(0, Number(r.like_count ?? 0)),
                    liked_by_viewer: Boolean(r.liked_by_viewer),
                    children: [],
                  };
                });
                const byId = new Map(nodes.map((x) => [x.id, x]));
                const builtRoots: NeighborhoodCommentNode[] = [];
                for (const x of nodes) {
                  if (x.parent_id && byId.has(x.parent_id)) {
                    byId.get(x.parent_id)!.children.push(x);
                  } else {
                    builtRoots.push(x);
                  }
                }
                return builtRoots;
              })()
            : null;
        if (!roots) return;
        setComments(roots);
        logClientPerf("community-detail.comments", {
          postId: post.id,
          silent,
          count: roots.length,
          elapsedMs: Math.round(perfNow() - startedAt),
        });
      } finally {
        if (!silent) setCommentsLoading((prev) => (prev ? false : prev));
      }
    },
    [post.id]
  );

  useEffect(() => {
    if (initialCommentsLoaded || initialComments.length > 0) return;
    void refreshComments();
  }, [initialCommentsLoaded, initialComments.length, refreshComments]);

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

  useEffect(() => {
    const root = articleRef.current;
    if (!root || commentsLoading) return;
    const firstImage = root.querySelector("img");
    const imageReady =
      !firstImage || (firstImage instanceof HTMLImageElement && firstImage.complete && firstImage.naturalWidth > 0);
    if (imageReady) {
      recordRouteEntryFullRender("community_detail");
    }
    if (firstImage instanceof HTMLImageElement && !imageReady) {
      const onLoad = () => recordRouteEntryFullRender("community_detail");
      firstImage.addEventListener("load", onLoad, { once: true });
      return () => firstImage.removeEventListener("load", onLoad);
    }
  }, [commentsLoading, comments.length, post.images.length]);

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

  const onCommentLike = useCallback(
    async (commentId: string) => {
      if (!me?.id) {
        const n = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
        void router.push(`/login?next=${encodeURIComponent(n)}`);
        return;
      }
      try {
        const res = await fetch(philifePostCommentLikeUrl(post.id, commentId), { method: "POST" });
        const data = (await res.json()) as { ok?: boolean; liked?: boolean; like_count?: number };
        if (data.ok && typeof data.like_count === "number" && typeof data.liked === "boolean") {
          setComments((cur) => updateCommentInTree(cur, commentId, { liked_by_viewer: data.liked, like_count: data.like_count }));
        } else {
          invalidateCommunityPostCommentsDeduped(post.id);
          await refreshComments({ silent: true, force: true });
        }
      } catch {
        invalidateCommunityPostCommentsDeduped(post.id);
        await refreshComments({ silent: true, force: true });
      }
    },
    [me?.id, post.id, refreshComments, router]
  );

  const onCommentEdit = useCallback(
    async (commentId: string, nextContent: string) => {
      if (!me?.id) return;
      const t = nextContent.trim();
      if (!t) return;
      setBusy(true);
      try {
        const res = await fetch(philifePostCommentUrl(post.id, commentId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: t }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (res.ok && data.ok) {
          const now = new Date().toISOString();
          setComments((cur) => updateCommentInTree(cur, commentId, { content: t, is_edited: true, updated_at: now }));
        } else {
          invalidateCommunityPostCommentsDeduped(post.id);
          await refreshComments({ silent: true, force: true });
        }
      } finally {
        setBusy(false);
      }
    },
    [me?.id, post.id, refreshComments]
  );

  const onCommentDelete = useCallback(
    async (commentId: string) => {
      if (!me?.id) return;
      if (!window.confirm("이 댓글을 삭제할까요?")) return;
      setBusy(true);
      try {
        const res = await fetch(philifePostCommentUrl(post.id, commentId), { method: "DELETE" });
        const data = (await res.json()) as { ok?: boolean };
        if (res.ok && data.ok) {
          invalidateCommunityPostCommentsDeduped(post.id);
          await refreshComments({ silent: true, force: true });
        }
      } finally {
        setBusy(false);
      }
    },
    [me?.id, post.id, refreshComments]
  );

  const submitComment = useCallback(async () => {
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
        await refreshComments({ silent: true, force: true });
        setScrollSig((s) => s + 1);
      }
    } finally {
      setBusy(false);
    }
  }, [commentText, post.id, refreshComments]);

  const submitReplyComment = useCallback(
    async (parentId: string, content: string) => {
      const t = content.trim();
      if (!t) return;
      setBusy(true);
      try {
        const res = await fetch(philifePostCommentsUrl(post.id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: t, parentId }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (data.ok) {
          invalidateCommunityPostCommentsDeduped(post.id);
          await refreshComments({ silent: true, force: true });
          setScrollSig((s) => s + 1);
        }
      } finally {
        setBusy(false);
      }
    },
    [post.id, refreshComments]
  );

  const onDeletePost = async () => {
    if (!me?.id || me.id !== post.author_id) return;
    if (!window.confirm("이 글을 삭제할까요? (복구 불가)")) return;
    setBusy((prev) => (prev ? prev : true));
    setDeleteErr((prev) => (prev === "" ? prev : ""));
    try {
      const res = await fetch(philifeNeighborhoodPostUrl(post.id), { method: "DELETE" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.replace(philifeAppPaths.home);
      else setDeleteErr(j.error ?? "삭제에 실패했습니다.");
    } finally {
      setBusy((prev) => (prev ? false : prev));
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

  const meetingHostDisplay =
    meeting &&
    (isSameUserId(post.author_id, meeting.host_user_id) || isSameUserId(post.author_id, meeting.created_by))
      ? post.author_name
      : meeting
        ? meeting.host_user_id.slice(0, 8)
        : undefined;

  const commentsLocked = Boolean(meeting && !viewerJoinedMeeting);

  const openReport = useCallback(() => {
    if (me?.id && me.id === post.author_id) return;
    setReportErr("");
    setReportOpen(true);
  }, [me, post.author_id]);

  const authorSubline = meeting
    ? `조회 ${viewCount.toLocaleString("ko-KR")} · 댓글 ${displayCommentCount}`
    : undefined;

  return (
    <div className={`${PHILIFE_DETAIL_PAGE_ROOT_CLASS} ${MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS}`}>
      <CommunityPostDetailHeader
        titleText={tier1Title}
        onOpenReport={openReport}
        onDelete={onDeletePost}
        canDelete={!!me?.id && me.id === post.author_id}
        canReport={!me?.id || me.id !== post.author_id}
        postUrl={postUrl}
      />

      <article
        ref={articleRef}
        className={`w-full min-w-0 ${PHILIFE_DETAIL_POST_SLAB_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`}
      >
        <div className="max-w-3xl">
          <CommunityPostCategoryRow
            label={meeting ? "모임" : post.category_label}
            isQuestion={post.is_question && !meeting}
          />
          <CommunityPostDetailAuthorRow
            authorName={post.author_name}
            locationLabel={post.location_label}
            createdAt={post.created_at}
            subline={authorSubline}
          />
          <CommunityPostDetailBody
            post={post}
            meeting={meeting}
            meetingHostDisplay={meetingHostDisplay}
            viewerJoinedMeeting={viewerJoinedMeeting}
          />

          {!meeting ? <CommunityPostDetailTags tags={hashtags} /> : null}
          {!meeting ? (
            <CommunityPostDetailStatsActions
              postId={post.id}
              viewCount={viewCount}
              likeCount={likeCount}
              busy={busy}
              onLike={onLike}
              showSocialActions={!!me?.id && me.id !== post.author_id}
              socialTargetUserId={!meeting ? post.author_id : null}
            />
          ) : null}

          {meeting ? (
            <div className="grid grid-cols-3 gap-2 border-b border-[#E5E7EB] bg-[#F7F8FA] px-4 py-4 sm:grid-cols-6">
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
                  className={`${meetingToolbarBtn} border-[#7360F2] bg-[#7360F2] text-white hover:bg-[#5B46E8]`}
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
                  className={`${meetingToolbarBtn} border-red-200 bg-red-50 text-[#E25555]`}
                >
                  신고
                </button>
              ) : (
                <div className="min-h-[44px]" aria-hidden />
              )}
              <Link href={philifeAppPaths.home} className={`${meetingToolbarBtn} bg-white`}>
                목록
              </Link>
            </div>
          ) : null}
          {meeting && me?.id && me.id === post.author_id ? (
            <div className="border-b border-[#E5E7EB] px-4 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDeletePost()}
                className={COMMUNITY_BUTTON_SECONDARY_CLASS}
              >
                삭제
              </button>
            </div>
          ) : null}

          {me?.id && me.id === post.author_id && (
            <div className="border-b border-[#E5E7EB] px-4 py-4">
              <p className="mb-2 text-[12px] font-normal text-[#6B7280]">내 게시글 광고</p>
              <AdApplyButton postId={post.id} postTitle={post.title} boardKey="plife" />
            </div>
          )}
          {deleteErr ? <p className="px-4 pb-2 text-[12px] text-[#E25555]">{deleteErr}</p> : null}

          <CommunityCommentSection
            roots={comments}
            scrollToBottomSignal={scrollSig}
            commentsLoading={commentsLoading}
            locked={commentsLocked}
            lockMessage={
              !me?.id
                ? "로그인 후 모임에 참여하면 댓글을 작성할 수 있어요."
                : "모임 참여 후 댓글을 작성할 수 있어요."
            }
            viewerUserId={me?.id ?? null}
            onCommentLike={onCommentLike}
            onCommentEdit={onCommentEdit}
            onCommentDelete={onCommentDelete}
            onSubmitReply={submitReplyComment}
            commentBusy={busy}
            composer={
              !commentsLocked
                ? {
                    value: commentText,
                    onChange: setCommentText,
                    onSubmit: () => void submitComment(),
                    busy,
                    disabled: !me?.id || busy,
                    isLoggedIn: !!me?.id,
                    placeholder: "댓글을 남겨보세요…",
                    me: meForComposer,
                  }
                : null
            }
          />

          {!meeting && hashtags.length > 0 ? <CommunityRelatedAlertTags tags={hashtags} /> : null}
          {meeting && viewerJoinedMeeting && hashtags.length > 0 ? <CommunityRelatedAlertTags tags={hashtags} /> : null}
          <CommunityInlineAdCard />
          <CommunitySimilarPostsSection currentPostId={post.id} posts={similarPosts} />
        </div>
      </article>

      {reportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog">
          <button
            type="button"
            className={COMMUNITY_OVERLAY_BACKDROP_CLASS}
            aria-label="닫기"
            onClick={() => setReportOpen(false)}
          />
          <div className={`${COMMUNITY_MODAL_PANEL_CLASS} relative z-50`}>
            <p className="text-[16px] font-bold leading-[1.35] text-[#1F2430]">게시글 신고</p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={4}
              className="mt-3 min-h-[96px] w-full rounded-[4px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[14px] font-normal leading-[1.5] text-[#1F2430] placeholder:text-[13px] placeholder:font-normal placeholder:leading-[1.45] placeholder:text-[#9CA3AF] outline-none focus:border-[#7360F2] focus:ring-1 focus:ring-[#7360F2]/20"
            />
            {reportErr ? <p className="mt-1 text-[12px] text-[#E25555]">{reportErr}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className={`flex-1 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy || !reportText.trim()}
                onClick={() => void onReport()}
                className={`flex-1 ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
              >
                접수
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
