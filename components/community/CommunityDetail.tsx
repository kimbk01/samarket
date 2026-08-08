"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrentUser, getHydrationSafeCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { createCommunityFeedPostReport } from "@/lib/reports/createCommunityFeedPostReport";
import { NeighborFollowButton } from "./NeighborFollowButton";
import {
  philifeNeighborhoodPostUrl,
  philifePostLikeUrl,
  philifePostViewUrl,
} from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import { MemberPostPromoteSheet } from "@/components/post/MemberPostPromoteSheet";
import { usePhilifePostComments } from "@/hooks/use-philife-post-comments";
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
import { CommunityShareSheet } from "./share/CommunityShareSheet";
import { useCommunityPostShare } from "@/lib/community/share/use-community-post-share";
import {
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  COMMUNITY_MODAL_PANEL_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { CommunityCard } from "./ui/CommunityCard";
import { CommunityNeighborPrompt } from "./ui/CommunityNeighborPrompt";
import { CM_INPUT_CLASS, CM_BTN_PRIMARY_CLASS } from "@/lib/community/community-ui-classes";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCommunityTopicUILabel } from "@/lib/i18n/use-community-topic-ui-label";
import { formatAppNumber } from "@/lib/i18n/locale-for-app-language";
import { postNotificationThreadRead } from "@/lib/notifications/client/notification-event-read-client";

const meetingToolbarBtn =
  "sam-btn sam-btn--outline sam-btn--block px-1 py-2 text-center disabled:opacity-50";
const meetingToolbarWrap =
  "min-w-0 [&>button]:flex [&>button]:min-h-[44px] [&>button]:w-full [&>button]:items-center [&>button]:justify-center [&>button]:rounded-sam-md [&>button]:border [&>button]:border-sam-border [&>button]:bg-sam-surface [&>button]:px-1 [&>button]:py-2 [&>button]:text-center [&>button]:text-[length:var(--sam-text-body-size)] [&>button]:font-medium [&>button]:leading-[var(--sam-font-body-line)] [&>button]:text-sam-fg";
export function CommunityDetail({
  post,
  meeting,
  viewerJoinedMeeting = false,
  initialRouteTotalMs,
  similarPosts = [],
}: {
  post: NeighborhoodFeedPostDTO;
  meeting: NeighborhoodMeetingDetailDTO | null;
  viewerJoinedMeeting?: boolean;
  initialRouteTotalMs?: number;
  similarPosts?: NeighborhoodFeedPostDTO[];
}) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
  const communityPostNotificationReadOnceRef = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const viewerIsAdmin = !!me && isAdminUser(me);

  useEffect(() => {
    const postId = post.id?.trim();
    if (!postId) return;
    if (communityPostNotificationReadOnceRef.current === postId) return;
    communityPostNotificationReadOnceRef.current = postId;
    void postNotificationThreadRead(postId, {
      threadType: "community_post",
      readReason: "community_post_opened",
      categories: ["community_activity"],
    });
  }, [post.id]);

  const {
    comments,
    loading: commentsLoading,
    actionBusy: commentActionBusy,
    submitError: commentSubmitErr,
    likeError: commentLikeErr,
    commentText,
    setCommentText,
    focusCommentId,
    scrollSig,
    displayCommentCount,
    submitRootComment,
    submitReply,
    likeComment,
    editComment,
    deleteComment,
    clearSubmitError,
  } = usePhilifePostComments(post.id);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [likedByViewer, setLikedByViewer] = useState(post.viewer?.liked_by_viewer ?? false);
  const [savedByViewer, setSavedByViewer] = useState(post.viewer?.saved_by_viewer ?? false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [busy, setBusy] = useState(false);
  const [likeActionErr, setLikeActionErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportErr, setReportErr] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !post.id) return;
    void fetch("/api/me/notification-targets/clear", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "community_post", targetId: post.id }),
    }).catch(() => {});
  }, [mounted, post.id]);

  useEffect(() => {
    setLikeCount(post.like_count);
    setViewCount(post.view_count);
    setLikedByViewer(post.viewer?.liked_by_viewer ?? false);
    setSavedByViewer(post.viewer?.saved_by_viewer ?? false);
  }, [post.id, post.like_count, post.view_count, post.viewer?.liked_by_viewer, post.viewer?.saved_by_viewer]);

  const postCategoryLabel = useCommunityTopicUILabel(
    language,
    post.category_label,
    post.category_name_en,
    post.category
  );
  const tier1Title = meeting
    ? t("community_meeting_label")
    : postCategoryLabel.trim() || t("community_community_label");
  const backToFeedHref =
    !meeting && !post.is_meetup && post.category?.trim()
      ? `${philifeAppPaths.home}?category=${encodeURIComponent(post.category.trim())}`
      : philifeAppPaths.home;
  const hashtags = useMemo(
    () => extractPostDetailHashtagsForDisplay(post.title, post.content, Boolean(meeting) || post.is_meetup),
    [post.title, post.content, meeting, post.is_meetup]
  );
  const communityShare = useCommunityPostShare(post, postCategoryLabel);

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

  const meForComposer = useMemo(
    () => (me ? { name: me.nickname || t("community_me"), avatarUrl: me.avatar_url ?? null } : null),
    [me, t]
  );

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

  const resolveLikeBlockedError = useCallback(
    (res: Response, data: { ok?: boolean; error?: string; code?: string }) => {
      if (data.code === "community_like_blocked_relation" || res.status === 403) {
        return t("community_like_blocked_relation");
      }
      return "";
    },
    [t]
  );

  const onLike = async () => {
    if (!me?.id) {
      const n = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      void requireAction("community_like", () => undefined, { next: n });
      return;
    }
    if (busy) return;
    const prevLikeCount = likeCount;
    const prevLiked = likedByViewer;
    const nextLiked = !prevLiked;
    setBusy(true);
    setLikeActionErr("");
    setLikedByViewer(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    try {
      const res = await fetch(philifePostLikeUrl(post.id), { method: "POST", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; like_count?: number; liked?: boolean; code?: string };
      if (data.ok && typeof data.like_count === "number" && typeof data.liked === "boolean") {
        setLikeCount(data.like_count);
        setLikedByViewer(data.liked);
      } else {
        setLikeCount(prevLikeCount);
        setLikedByViewer(prevLiked);
        const err = resolveLikeBlockedError(res, data);
        if (err) setLikeActionErr(err);
      }
    } catch {
      setLikeCount(prevLikeCount);
      setLikedByViewer(prevLiked);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!me?.id) {
      const n = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      void requireAction("community_like", () => undefined, { next: n });
      return;
    }
    if (saveBusy) return;
    const prevSaved = savedByViewer;
    setSaveBusy(true);
    setSavedByViewer(!prevSaved);
    try {
      const res = await fetch(`/api/community/posts/${encodeURIComponent(post.id)}/save`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; saved?: boolean; error?: string };
      if (data.ok && typeof data.saved === "boolean") {
        setSavedByViewer(data.saved);
      } else {
        setSavedByViewer(prevSaved);
        setActionToast(
          safeT("community_engagement_action_failed", {
            fallbackKo: "잠시 후 다시 시도해 주세요.",
            fallbackEn: "Please try again in a moment.",
          })
        );
        window.setTimeout(() => setActionToast(null), 3200);
      }
    } catch {
      setSavedByViewer(prevSaved);
    } finally {
      setSaveBusy(false);
    }
  };

  const onCommentLike = useCallback(
    (commentId: string) => void likeComment(commentId, me?.id ?? null),
    [likeComment, me?.id]
  );

  const onCommentEdit = useCallback(
    (commentId: string, content: string) => {
      if (!me?.id) return;
      void editComment(commentId, content);
    },
    [editComment, me?.id]
  );

  const onCommentDelete = useCallback(
    (commentId: string) => {
      if (!me?.id) return;
      void deleteComment(commentId);
    },
    [deleteComment, me?.id]
  );

  const onDeletePost = async () => {
    if (!me?.id || me.id !== post.author_id) return;
    if (!window.confirm(t("community_confirm_delete_post"))) return;
    setBusy((prev) => (prev ? prev : true));
    setDeleteErr((prev) => (prev === "" ? prev : ""));
    try {
      const res = await fetch(philifeNeighborhoodPostUrl(post.id), { method: "DELETE" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.replace(philifeAppPaths.home);
      else setDeleteErr(j.error ?? t("community_delete_failed"));
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
        setActionToast(t("community_report_submitted"));
        window.setTimeout(() => setActionToast(null), 3200);
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
    ? t("community_detail_stats_line", {
        views: formatAppNumber(viewCount, language),
        comments: displayCommentCount,
      })
    : undefined;

  return (
    <div className="pb-[max(1rem,var(--safe-bottom))]">
      <CommunityPostDetailHeader titleText={tier1Title} backHref={backToFeedHref} />

      <article ref={articleRef} className="w-full min-w-0 px-4 pb-6">
        <div className="mx-auto max-w-3xl">
          <CommunityCard>
          <CommunityPostCategoryRow
            label={meeting ? t("community_meeting_label") : postCategoryLabel}
            isQuestion={post.is_question && !meeting}
          />
          <CommunityPostDetailAuthorRow
            authorName={post.author_name}
            authorAvatarUrl={post.author_avatar_url}
            locationLabel={post.location_label}
            createdAt={post.created_at}
            subline={authorSubline}
            showMoreMenu
            postId={post.id}
            targetUserId={post.author_id}
            canReport={!me?.id || me.id !== post.author_id}
            onReport={openReport}
            isOwnPost={!!me?.id && me.id === post.author_id}
            onOwnShare={() => communityShare.openSheet()}
            onOwnDelete={() => void onDeletePost()}
            ownDeleteBusy={busy}
          />
          <CommunityPostDetailBody
            post={post}
            meeting={meeting}
            meetingHostDisplay={meetingHostDisplay}
            viewerJoinedMeeting={viewerJoinedMeeting}
          />

          {!meeting ? <CommunityPostDetailTags tags={hashtags} /> : null}
          {!meeting ? (
            <>
              <CommunityPostDetailStatsActions
                postId={post.id}
                viewCount={viewCount}
                likeCount={likeCount}
                likedByViewer={likedByViewer}
                savedByViewer={savedByViewer}
                busy={busy}
                saveBusy={saveBusy}
                onLike={() => void onLike()}
                onSave={() => void onSave()}
                onShare={() => communityShare.openSheet()}
              />
              {me?.id && me.id !== post.author_id ? (
                <CommunityNeighborPrompt authorName={post.author_name} targetUserId={post.author_id} />
              ) : null}
            </>
          ) : null}
          {likeActionErr || commentLikeErr ? (
            <p className="mt-2 text-sm text-[var(--cm-danger)]" role="alert">
              {likeActionErr || commentLikeErr}
            </p>
          ) : null}

          {meeting ? (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--cm-border)] pt-4 sm:grid-cols-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onLike()}
                className={`${meetingToolbarBtn} ${likedByViewer ? "border-[var(--cm-primary)] bg-[var(--cm-primary)] text-white" : ""}`}
                aria-pressed={likedByViewer}
              >
                {t("community_stat_likes", { count: likeCount })}
              </button>
              {me?.id && me.id !== post.author_id ? (
                <div className={meetingToolbarWrap}>
                  <NeighborFollowButton targetUserId={post.author_id} />
                </div>
              ) : (
                <div className="min-h-[44px]" aria-hidden />
              )}
              {me?.id ? (
                <Link
                  href={philifeAppPaths.meeting(meeting.id)}
                  className={`${meetingToolbarBtn} border-[var(--cm-primary)] bg-[var(--cm-primary)] text-white hover:bg-[var(--cm-primary-hover)]`}
                >
                  {t("community_inquiry")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void requireAction("messenger_open", () => undefined, {
                      next: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
                    });
                  }}
                  className={meetingToolbarBtn}
                >
                  {t("community_inquiry")}
                </button>
              )}
              {me?.id && me.id !== post.author_id ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportErr("");
                    setReportOpen(true);
                  }}
                  className={`${meetingToolbarBtn} border-red-200 bg-red-50 text-[var(--cm-danger)]`}
                >
                  {t("community_report")}
                </button>
              ) : (
                <div className="min-h-[44px]" aria-hidden />
              )}
              <Link href={philifeAppPaths.home} className={`${meetingToolbarBtn} bg-white`}>
                {t("community_list")}
              </Link>
            </div>
          ) : null}
          {meeting && me?.id && me.id === post.author_id ? (
            <div className="mt-4 border-t border-[var(--cm-border)] pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDeletePost()}
                className={COMMUNITY_BUTTON_SECONDARY_CLASS}
              >
                {t("community_delete")}
              </button>
            </div>
          ) : null}

          {me?.id && me.id === post.author_id && (
            <div className="mt-4 border-t border-[var(--cm-border)] pt-4">
              <p className="mb-2 text-[12px] font-normal text-[var(--cm-text-muted)]">
                {safeT("community_my_post_ads", {
                  fallbackKo: "게시물 홍보",
                  fallbackEn: "Promote post",
                })}
              </p>
              <button
                type="button"
                onClick={() => setPromoteOpen(true)}
                className="w-full rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2.5 sam-text-body-secondary font-semibold text-amber-800 hover:bg-amber-100"
              >
                {safeT("community_top_pin_cta", {
                  fallbackKo: "게시물 홍보하기",
                  fallbackEn: "Promote this post",
                })}
              </button>
              <MemberPostPromoteSheet
                domain="community"
                postId={post.id}
                postTitle={post.title}
                open={promoteOpen}
                onClose={() => setPromoteOpen(false)}
              />
            </div>
          )}
          {deleteErr ? <p className="mt-2 text-[12px] text-[var(--cm-danger)]">{deleteErr}</p> : null}
          </CommunityCard>

            <CommunityCommentSection
            roots={comments}
            focusCommentId={focusCommentId}
            scrollToBottomSignal={scrollSig}
            commentsLoading={commentsLoading}
            locked={commentsLocked}
            lockMessage={
              !me?.id
                ? t("community_login_meeting_for_comments")
                : t("community_join_meeting_for_comments")
            }
            viewerUserId={me?.id ?? null}
            viewerIsAdmin={viewerIsAdmin}
            onCommentLike={onCommentLike}
            onCommentEdit={onCommentEdit}
            onCommentDelete={onCommentDelete}
            onSubmitReply={submitReply}
            commentBusy={commentActionBusy}
            composerError={commentSubmitErr}
            composer={
              !commentsLocked
                ? {
                    value: commentText,
                    onChange: (v) => {
                      setCommentText(v);
                      if (commentSubmitErr) clearSubmitError();
                    },
                    onSubmit: () => void submitRootComment(),
                    busy: commentActionBusy,
                    disabled: !me?.id || commentActionBusy,
                    isLoggedIn: !!me?.id,
                    placeholder: t("community_comment_placeholder_detail"),
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
            aria-label={t("common_close")}
            onClick={() => setReportOpen(false)}
          />
          <div className={`${COMMUNITY_MODAL_PANEL_CLASS} relative z-50`}>
            <p className="text-[16px] font-bold leading-[1.35] text-[var(--cm-text)]">{t("community_report_post")}</p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={4}
              className={`mt-3 min-h-[96px] w-full ${CM_INPUT_CLASS}`}
            />
            {reportErr ? <p className="mt-1 text-[12px] text-[var(--cm-danger)]">{reportErr}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className={`flex-1 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                disabled={busy || !reportText.trim()}
                onClick={() => void onReport()}
                className={`flex-1 ${CM_BTN_PRIMARY_CLASS}`}
              >
                {t("community_receive")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CommunityShareSheet {...communityShare} />
      {actionToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(5rem,var(--safe-bottom))] z-[1400] flex justify-center px-4">
          <p className="max-w-sm rounded-full bg-[#1f2937] px-4 py-2.5 text-center text-[14px] font-medium text-white shadow-lg">
            {actionToast}
          </p>
        </div>
      ) : null}
    </div>
  );
}
