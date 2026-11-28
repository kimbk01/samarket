"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isAdminUser } from "@/lib/auth/get-current-user";
import { useClientProfile } from "@/lib/auth/use-client-profile";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { createCommunityFeedPostReport } from "@/lib/reports/createCommunityFeedPostReport";
import { createCommunityFeedCommentReport } from "@/lib/reports/createCommunityFeedCommentReport";
import { requestUserBlock } from "@/lib/reports/request-user-block";
import { reportErrorText, userBlockErrorText } from "@/lib/reports/report-block-error-text";
import { resolveApiErrorText } from "@/lib/i18n/api-error-text";
import { COMMUNITY_POST_DELETE_ERROR_KEYS } from "@/lib/community/community-api-error-text";
import { communityAuthorNameText, communityRegionLabelText } from "@/lib/community/community-display-fallbacks";
import { invalidateCommunityUserRelationSnapshot } from "@/lib/community/user-relation-client";
import { applyBlockToNeighborRelation } from "@/lib/community/neighbor-follow-store";
import { isCommunityImportedOrigin } from "@/lib/community/community-post-origin";
import { communityPostPublicDisplayClock } from "@/lib/community/community-publication-time";
import { invalidateCommunityFeedCachesAfterPostModeration } from "@/lib/community/invalidate-community-author-posts-client";
import {
  philifeNeighborhoodPostUrl,
  philifePostLikeUrl,
  philifePostViewUrl,
} from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import {
  peekCommunityPostEntryOrigin,
  resolveCommunityDetailBackHref,
} from "@/lib/community/community-post-entry-nav";
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
import {
  CommunityCommentComposerBar,
  CommunityCommentKeyboardKeeper,
} from "./post-detail/CommunityCommentComposerForm";
import { CommunityReportSheet } from "./post-detail/CommunityReportSheet";
import type { CommunityReportReasonCode } from "@/lib/reports/community-report-reasons";
import { COMMUNITY_COMMENT_QUERY_KEY } from "@/lib/community/share/community-share-url";
import { CommunityRelatedAlertTags } from "./post-detail/CommunityRelatedAlertTags";
import { CommunityInlineAdCard } from "./post-detail/CommunityInlineAdCard";
import { CommunitySimilarPostsSection } from "./post-detail/CommunitySimilarPostsSection";
import { useCommunityPostShare } from "@/lib/community/share/use-community-post-share";
import { CommunityCard } from "./ui/CommunityCard";
import { CommunityNeighborPrompt } from "./ui/CommunityNeighborPrompt";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCommunityTopicUILabel } from "@/lib/i18n/use-community-topic-ui-label";
import { postNotificationThreadRead } from "@/lib/notifications/client/notification-event-read-client";

export function CommunityDetail({
  post,
  initialRouteTotalMs,
  similarPosts = [],
  isAd = false,
}: {
  post: NeighborhoodFeedPostDTO;
  initialRouteTotalMs?: number;
  similarPosts?: NeighborhoodFeedPostDTO[];
  /** Owner 결정 O-3: 지금 광고 중(유료 상위노출)인 글 */
  isAd?: boolean;
}) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
  const communityPostNotificationReadOnceRef = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  /** 로그인 정보 — 캐시가 늦게 차도(주소로 바로 연 상세) 다시 그린다. 한 번 읽기는 관심이웃 안내·입력줄 아바타를 빈 값으로 남겼다 */
  const me = useClientProfile();
  const viewerIsAdmin = !!me && isAdminUser(me);
  /** 글 작성자 = 댓글 고정 권한 (Owner 결정 1). 가져온 글은 작성자가 없다 */
  const viewerIsPostAuthor =
    !!me?.id && isSameUserId(post.author_id, me.id) && !isCommunityImportedOrigin(post.origin_kind);

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

  const [actionToast, setActionToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  /** 한 화면 안내 줄 — 댓글·신고·차단·링크 결과 (설계 §6.5 「오류 위치」) */
  const showToast = useCallback((message: string) => {
    setActionToast(message);
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setActionToast(null), DIBAY_TOAST_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  const {
    comments,
    count: commentCount,
    maxLength: commentMaxLength,
    loading: commentsLoading,
    loadError: commentsLoadError,
    actionBusy: commentActionBusy,
    submitError: commentSubmitErr,
    commentText,
    setCommentText,
    replyTarget,
    startReply,
    cancelReply,
    focusCommentId,
    submitComment,
    likeComment,
    editComment,
    deleteComment,
    moderateCommentAsAdmin,
    pinComment,
    retryComments,
    clearSubmitError,
  } = usePhilifePostComments(post.id, { onToast: showToast });

  /** 알림·링크(`?comment=<id>`)로 연 댓글 (감사 L8 · 설계 §6.5) */
  const [deepLinkCommentId, setDeepLinkCommentId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get(COMMUNITY_COMMENT_QUERY_KEY)?.trim() ?? "";
    setDeepLinkCommentId(id || null);
  }, [post.id]);
  const clearDeepLink = useCallback(() => setDeepLinkCommentId(null), []);
  /** 댓글 수정 중에는 하단 입력 바를 숨긴다 — 키보드 위 바가 수정칸 「저장」을 가리던 결함 (실기 결함 3) */
  const [commentEditing, setCommentEditing] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [likedByViewer, setLikedByViewer] = useState(post.viewer?.liked_by_viewer ?? false);
  const [savedByViewer, setSavedByViewer] = useState(post.viewer?.saved_by_viewer ?? false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [busy, setBusy] = useState(false);
  const [likeActionErr, setLikeActionErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportErr, setReportErr] = useState("");
  const [reportTarget, setReportTarget] = useState<
    { kind: "post" } | { kind: "comment"; commentId: string } | null
  >(null);
  const [deleteErr, setDeleteErr] = useState("");
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
  const tier1Title = postCategoryLabel.trim() || t("community_community_label");
  const [backToFeedHref, setBackToFeedHref] = useState<string>(philifeAppPaths.home);
  /** 이 글로 들어온 앱 내 진입 기록(같은 postId 출처)이 있는지 — Navigation API 없는 환경의 settle 판단용 */
  const [hasEntryOriginForPost, setHasEntryOriginForPost] = useState(false);
  useLayoutEffect(() => {
    setBackToFeedHref(resolveCommunityDetailBackHref({ postId: post.id }));
    setHasEntryOriginForPost(peekCommunityPostEntryOrigin()?.postId === post.id);
  }, [post.id]);
  const hashtags = useMemo(
    () => extractPostDetailHashtagsForDisplay(post.title, post.content),
    [post.title, post.content]
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
    const hasBodyText = post.content.trim().length > 0;
    if (root.querySelector("h1") && hasBodyText) {
      recordRouteEntryFirstContentRender("community_detail");
      scheduleRouteEntryToPaint("community_detail");
    }
    const interactiveTarget = root.querySelector("button, input, a[href]");
    if (interactiveTarget instanceof HTMLElement && !interactiveTarget.hasAttribute("disabled")) {
      recordRouteEntryFirstInteractive("community_detail");
    }
  }, [initialRouteTotalMs, post.content]);

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
    /** 로그인한 가입 진행 중 회원도 같은 행동 게이트 — 켤 때만(해제는 가입 없이, 재감사3 #3) */
    if (
      !likedByViewer &&
      !(await requireAction("community_like", () => undefined, { next: window.location.pathname + window.location.search }))
    ) {
      return;
    }
    const prevLikeCount = likeCount;
    const prevLiked = likedByViewer;
    const nextLiked = !prevLiked;
    setBusy(true);
    setLikeActionErr("");
    setLikedByViewer(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    try {
      const res = await fetch(philifePostLikeUrl(post.id), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: nextLiked }),
      });
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
    /** 로그인한 가입 진행 중 회원도 같은 행동 게이트 — 켤 때만(해제는 가입 없이, 재감사3 #3) */
    if (
      !savedByViewer &&
      !(await requireAction("community_bookmark", () => undefined, { next: window.location.pathname + window.location.search }))
    ) {
      return;
    }
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
          safeT("community_engagement_action_failed")
        );
        window.setTimeout(() => setActionToast(null), DIBAY_TOAST_MS);
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
    async (commentId: string, content: string): Promise<string | null> => {
      if (!me?.id) return null;
      return editComment(commentId, content);
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

  const onCommentReport = useCallback(
    (commentId: string) => {
      if (!me?.id) return;
      setReportTarget({ kind: "comment", commentId });
      setReportErr("");
      setReportOpen(true);
    },
    [me?.id]
  );

  const onCommentAuthorBlock = useCallback(
    async (authorUserId: string, authorLabel: string) => {
      if (!me?.id || isSameUserId(authorUserId, me.id)) return;
      const ok = await dibayConfirm({
        title: authorLabel ? t("popup_q_block_named", { name: authorLabel }) : t("popup_neighbor_block_title"),
        description: t("community_comment_block_desc"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_block"),
        confirmTone: "destructive",
      });
      if (!ok) return;
      const res = await requestUserBlock(authorUserId);
      invalidateCommunityUserRelationSnapshot(authorUserId);
      if (res.ok) {
        applyBlockToNeighborRelation(authorUserId, true);
        showToast(t("community_block_success_toast"));
        void retryComments();
      } else {
        showToast(userBlockErrorText(res, t));
      }
    },
    [me?.id, retryComments, showToast, t]
  );

  const onDeletePost = async () => {
    if (!me?.id || me.id !== post.author_id) return;
    if (isCommunityImportedOrigin(post.origin_kind)) return;
    if (!(await dibayConfirm({ title: t("popup_post_delete_title"), description: t("popup_note_cannot_restore"), cancelLabel: t("common_cancel"), confirmLabel: t("common_delete"), confirmTone: "destructive" }))) return;
    setBusy((prev) => (prev ? prev : true));
    setDeleteErr((prev) => (prev === "" ? prev : ""));
    try {
      const res = await fetch(philifeNeighborhoodPostUrl(post.id), { method: "DELETE", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (res.ok && j.ok) {
        invalidateCommunityFeedCachesAfterPostModeration(post.id);
        router.replace(philifeAppPaths.home);
      } else
        setDeleteErr(
          resolveApiErrorText({
            json: j,
            status: res.status,
            map: COMMUNITY_POST_DELETE_ERROR_KEYS,
            fallbackKey: "community_delete_failed",
            t,
          })
        );
    } catch {
      setDeleteErr(t("community_delete_failed"));
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  const canOwnEdit =
    !!me?.id &&
    me.id === post.author_id &&
    !isCommunityImportedOrigin(post.origin_kind);

  const onEditPost = useCallback(() => {
    if (!canOwnEdit) return;
    router.push(`${philifeAppPaths.write}?edit=${encodeURIComponent(post.id)}`);
  }, [canOwnEdit, post.id, router]);

  const authorDisplayClock = communityPostPublicDisplayClock({
    origin_kind: post.origin_kind,
    display_date: post.display_date,
    published_at: post.published_at,
    created_at: post.created_at,
  });

  const onReport = async (reasonCode: CommunityReportReasonCode, detail: string) => {
    if (!reportTarget) return;
    setReportErr("");
    setBusy(true);
    try {
      const res =
        reportTarget.kind === "post"
          ? await createCommunityFeedPostReport(post.id, reasonCode, detail)
          : await createCommunityFeedCommentReport(reportTarget.commentId, reasonCode, detail);
      if (res.ok) {
        setReportOpen(false);
        setReportTarget(null);
        showToast(t("community_report_submitted"));
      } else setReportErr(reportErrorText(res, t, "ui_report_failed"));
    } finally {
      setBusy(false);
    }
  };

  // Peer CTA authority = actual member target capability, not origin_kind product branch.
  const memberPeerUserId = post.member_peer_user_id?.trim() || null;
  /** 관심이웃·차단 시작 값 = 상세 첫 데이터(서버 계산) — 안내·⋯ 메뉴 별도 조회 없음 (설계 A · 감사 E11) */
  const neighborRelationSeed = useMemo(
    () =>
      post.viewer
        ? { following: post.viewer.following_author, blocked: post.viewer.blocked_author }
        : undefined,
    [post.viewer],
  );

  const openReport = useCallback(() => {
    if (me?.id && me.id === post.author_id) return;
    setReportTarget({ kind: "post" });
    setReportErr("");
    setReportOpen(true);
  }, [me, post.author_id]);

  return (
    <div className="community-post-detail-fade-in pb-[max(1rem,var(--safe-bottom))]">
      <CommunityPostDetailHeader
        titleText={tier1Title}
        backHref={backToFeedHref}
        hasEntryOriginForPost={hasEntryOriginForPost}
        onShare={communityShare.share}
      />

      <article ref={articleRef} className="w-full min-w-0 px-4 pb-6">
        <div className="mx-auto max-w-3xl">
          <CommunityCard>
          <CommunityPostCategoryRow
            label={postCategoryLabel}
            isQuestion={post.is_question}
            topBadge={post.is_notice ? "notice" : post.is_pinned ? "pinned" : null}
            isAd={isAd}
          />
          <CommunityPostDetailAuthorRow
            authorName={communityAuthorNameText(post.author_name, t)}
            authorAvatarUrl={post.author_avatar_url}
            locationLabel={communityRegionLabelText(post.location_label, t)}
            createdAt={authorDisplayClock}
            showMoreMenu
            postId={post.id}
            targetUserId={memberPeerUserId}
            relationSeed={neighborRelationSeed}
            canReport={!me?.id || me.id !== post.author_id}
            onReport={openReport}
            isOwnPost={!!me?.id && me.id === post.author_id && !isCommunityImportedOrigin(post.origin_kind)}
            onOwnDelete={() => void onDeletePost()}
            onOwnEdit={canOwnEdit ? onEditPost : undefined}
            ownDeleteBusy={busy}
          />
          <CommunityPostDetailBody post={post} />
          {post.source_attribution?.sourceName || post.source_attribution?.canonicalUrl ? (
            <div className="mt-4 rounded-ui-rect border border-[var(--cm-border)] bg-[var(--cm-page-bg)] px-3 py-3 sam-text-helper text-[var(--cm-muted)]" data-user-content="">
              <div className="font-medium text-[var(--cm-fg)]">{t("community_source_attribution_label")}</div>
              {post.source_attribution.sourceName ? <div className="mt-1">{post.source_attribution.sourceName}</div> : null}
              {post.source_attribution.canonicalUrl ? (
                <a
                  href={post.source_attribution.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block break-all text-[var(--cm-primary)]"
                >
                  {t("community_source_original_link")}
                </a>
              ) : null}
            </div>
          ) : null}

          <CommunityPostDetailTags tags={hashtags} />
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
          />
          {me?.id && memberPeerUserId && me.id !== memberPeerUserId ? (
            <CommunityNeighborPrompt
              authorName={communityAuthorNameText(post.author_name, t)}
              targetUserId={memberPeerUserId}
              seed={neighborRelationSeed}
            />
          ) : null}
          {likeActionErr ? (
            <p className="mt-2 text-sm text-[var(--cm-danger)]" role="alert">
              {likeActionErr}
            </p>
          ) : null}

          {me?.id && me.id === post.author_id && !isCommunityImportedOrigin(post.origin_kind) && (
            <div className="mt-4 border-t border-[var(--cm-border)] pt-4">
              <p className="mb-2 text-[12px] font-normal text-[var(--cm-text-muted)]">
                {safeT("community_my_post_ads")}
              </p>
              <button
                type="button"
                onClick={() => setPromoteOpen(true)}
                className="w-full rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2.5 sam-text-body-secondary font-semibold text-amber-800 hover:bg-amber-100"
              >
                {safeT("community_top_pin_cta")}
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
            postId={post.id}
            roots={comments}
            count={commentCount}
            focusCommentId={focusCommentId}
            deepLinkCommentId={deepLinkCommentId}
            onDeepLinkHandled={clearDeepLink}
            commentsLoading={commentsLoading}
            commentsLoadError={commentsLoadError}
            onRetryComments={() => void retryComments()}
            viewerUserId={me?.id ?? null}
            viewerIsAdmin={viewerIsAdmin}
            viewerIsPostAuthor={viewerIsPostAuthor}
            maxLength={commentMaxLength}
            replyTargetId={replyTarget?.id ?? null}
            onCommentLike={onCommentLike}
            onCommentEdit={onCommentEdit}
            onCommentDelete={onCommentDelete}
            onCommentAdminModerate={(id, status) => void moderateCommentAsAdmin(id, status)}
            onCommentPin={(id, pinned) => void pinComment(id, pinned)}
            onCommentReport={onCommentReport}
            onCommentAuthorBlock={onCommentAuthorBlock}
            onCommentReply={startReply}
            onToast={showToast}
            onEditingChange={setCommentEditing}
            commentBusy={commentActionBusy}
          />

            {hashtags.length > 0 ? <CommunityRelatedAlertTags tags={hashtags} /> : null}
            <CommunityInlineAdCard currentPostId={post.id} />
            <CommunitySimilarPostsSection currentPostId={post.id} posts={similarPosts} />
        </div>
      </article>

      {commentEditing ? <CommunityCommentKeyboardKeeper /> : (
      <CommunityCommentComposerBar
        value={commentText}
        onChange={(v) => {
          setCommentText(v);
          if (commentSubmitErr) clearSubmitError();
        }}
        onSubmit={() => void submitComment()}
        busy={commentActionBusy}
        isLoggedIn={!!me?.id}
        placeholder={t("community_comment_placeholder_detail")}
        me={meForComposer}
        replyTo={replyTarget}
        onCancelReply={cancelReply}
        maxLength={commentMaxLength}
        error={commentSubmitErr}
      />
      )}
      <CommunityReportSheet
        open={reportOpen}
        kind={reportTarget?.kind === "comment" ? "comment" : "post"}
        busy={busy}
        error={reportErr}
        onClose={() => {
          setReportOpen(false);
          setReportTarget(null);
        }}
        onSubmit={(code, detail) => void onReport(code, detail)}
      />
      {communityShare.shareSheet}
      {actionToast ? <DibayToast message={actionToast} /> : null}
    </div>
  );
}
