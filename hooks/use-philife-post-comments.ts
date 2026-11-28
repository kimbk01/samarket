"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { findCommentById, updateCommentInTree } from "@/lib/neighborhood/comment-tree";
import { fetchPhilifePostCommentTree } from "@/lib/neighborhood/philife-post-comments.client";
import { handleProfileIncompleteApiResponse } from "@/lib/profile/handle-profile-incomplete-api-response";
import { resolveApiErrorText } from "@/lib/i18n/api-error-text";
import {
  COMMUNITY_COMMENT_ERROR_KEYS,
  communityRestrictionText,
} from "@/lib/community/community-api-error-text";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import {
  philifePostCommentLikeUrl,
  philifePostCommentPinUrl,
  philifePostCommentUrl,
  philifePostCommentsUrl,
} from "@domain/philife/api";

export type CommentReplyTarget = { id: string; name: string };

type CommentFallbackKey = "community_comment_action_failed" | "community_comment_like_failed" | "community_comment_pin_failed";

/**
 * 필라이프 글 상세 댓글 — 단일 소유권 (라운지 댓글 SSOT 설계 §6.1).
 * - 화면 = 새로고침 결과: 작성·답글·삭제·숨김·고정 성공 → 서버 목록 전체 다시 읽기 (감사 L3·L4)
 * - 공감 = 원하는 상태 저장(낙관 반영 → 서버 수로 확정, 실패는 되돌리고 안내 · 감사 L6·L7)
 * - 오류 문구는 코드 → 화면 언어 (활동 제한은 해제일까지 · 감사 L1)
 */
export function usePhilifePostComments(postId: string, opts?: { onToast?: (message: string) => void }) {
  const { t, language } = useI18n();
  const requireAction = useRequireAuthAction();
  const onToastRef = useRef(opts?.onToast);
  onToastRef.current = opts?.onToast;
  const toast = useCallback((message: string) => onToastRef.current?.(message), []);

  const [comments, setComments] = useState<NeighborhoodCommentNode[]>([]);
  const [count, setCount] = useState(0);
  const [maxLength, setMaxLength] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadSeqRef = useRef(0);
  const likeInflightRef = useRef(new Set<string>());
  const commentsRef = useRef<NeighborhoodCommentNode[]>([]);
  commentsRef.current = comments;

  const applyFetchResult = useCallback(
    (seq: number, result: Awaited<ReturnType<typeof fetchPhilifePostCommentTree>>) => {
      if (seq !== loadSeqRef.current) return false;
      if (result.ok) {
        setComments(result.tree);
        setCount(result.count);
        if (result.maxLength != null) setMaxLength(result.maxLength);
        setLoadError(false);
        return true;
      }
      setLoadError(true);
      return false;
    },
    []
  );

  const reloadComments = useCallback(async (): Promise<boolean> => {
    const seq = ++loadSeqRef.current;
    const result = await fetchPhilifePostCommentTree(postId);
    return applyFetchResult(seq, result);
  }, [applyFetchResult, postId]);

  const retryComments = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const seq = ++loadSeqRef.current;
    const result = await fetchPhilifePostCommentTree(postId);
    applyFetchResult(seq, result);
    if (seq === loadSeqRef.current) setLoading(false);
  }, [applyFetchResult, postId]);

  useEffect(() => {
    let alive = true;
    const seq = ++loadSeqRef.current;
    setComments([]);
    setCount(0);
    setLoading(true);
    setLoadError(false);
    setSubmitError("");
    setCommentText("");
    setReplyTarget(null);
    setFocusCommentId(null);

    void fetchPhilifePostCommentTree(postId).then((result) => {
      if (!alive || seq !== loadSeqRef.current) return;
      applyFetchResult(seq, result);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [applyFetchResult, postId]);

  /** 서버 오류 → 화면 문구. 403 을 한 문구로 뭉치지 않는다 (감사 L1) */
  const errorText = useCallback(
    (res: Response | null, data: unknown, fallbackKey: CommentFallbackKey = "community_comment_action_failed") => {
      const restricted = communityRestrictionText(data, t, language);
      if (restricted) return restricted;
      return resolveApiErrorText({
        json: data,
        status: res?.status ?? null,
        map: COMMUNITY_COMMENT_ERROR_KEYS,
        fallbackKey,
        t,
      });
    },
    [language, t]
  );

  const postComment = useCallback(
    async (content: string, parentId: string | null): Promise<string | false> => {
      const trimmed = content.trim();
      if (!trimmed) return false;
      setActionBusy(true);
      setSubmitError("");
      try {
        const res = await fetch(philifePostCommentsUrl(postId), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parentId ? { content: trimmed, parentId } : { content: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
        if (!data.ok) {
          const profileHandled = handleProfileIncompleteApiResponse(data);
          setSubmitError(profileHandled.handled ? t("api_err_profile_incomplete") : errorText(res, data));
          return false;
        }
        const createdId = typeof data.id === "string" ? data.id.trim() : "";
        await reloadComments();
        return createdId;
      } catch {
        setSubmitError(t("community_comment_action_failed"));
        return false;
      } finally {
        setActionBusy(false);
      }
    },
    [errorText, postId, reloadComments, t]
  );

  /** 하단 입력 바 하나로 댓글·답글 (설계 §6.5) — 실패하면 입력·답글 대상 유지 (CM-P2-03) */
  const submitComment = useCallback(async () => {
    const next =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
    await requireAction(
      "community_comment",
      async () => {
        const createdId = await postComment(commentText, replyTarget?.id ?? null);
        if (createdId === false) return;
        setCommentText("");
        setReplyTarget(null);
        if (createdId) setFocusCommentId(createdId);
      },
      { next }
    );
  }, [commentText, postComment, replyTarget, requireAction]);

  const startReply = useCallback((target: CommentReplyTarget) => {
    setSubmitError("");
    setReplyTarget(target);
  }, []);

  const cancelReply = useCallback(() => setReplyTarget(null), []);

  const likeComment = useCallback(
    async (commentId: string, viewerUserId: string | null | undefined) => {
      if (!viewerUserId) {
        const n = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
        void requireAction("community_like", () => undefined, { next: n });
        return;
      }
      const cid = commentId.trim();
      if (!cid || likeInflightRef.current.has(cid)) return;
      const node = findCommentById(commentsRef.current, cid);
      if (!node || node.display_state !== "visible") return;
      likeInflightRef.current.add(cid);
      const snap = { liked_by_viewer: node.liked_by_viewer, like_count: node.like_count };
      const nextLiked = !node.liked_by_viewer;
      setComments((cur) =>
        updateCommentInTree(cur, cid, {
          liked_by_viewer: nextLiked,
          like_count: Math.max(0, node.like_count + (nextLiked ? 1 : -1)),
        })
      );
      const rollback = () =>
        setComments((cur) =>
          updateCommentInTree(cur, cid, { liked_by_viewer: snap.liked_by_viewer, like_count: snap.like_count })
        );
      try {
        const res = await fetch(philifePostCommentLikeUrl(postId, cid), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ liked: nextLiked }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; liked?: boolean; like_count?: number };
        if (data.ok && typeof data.like_count === "number" && typeof data.liked === "boolean") {
          setComments((cur) =>
            updateCommentInTree(cur, cid, { liked_by_viewer: data.liked, like_count: data.like_count })
          );
        } else {
          rollback();
          toast(errorText(res, data, "community_comment_like_failed"));
        }
      } catch {
        rollback();
        toast(t("community_comment_like_failed"));
      } finally {
        likeInflightRef.current.delete(cid);
      }
    },
    [errorText, postId, requireAction, t, toast]
  );

  /** 실패 시 오류 문구를 돌려준다 — 편집창·입력을 유지 (CM-R-05) */
  const editComment = useCallback(
    async (commentId: string, nextContent: string): Promise<string | null> => {
      const text = nextContent.trim();
      if (!text) return null;
      setActionBusy(true);
      try {
        const res = await fetch(philifePostCommentUrl(postId, commentId), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && data.ok) {
          setComments((cur) =>
            updateCommentInTree(cur, commentId, { content: text, is_edited: true, updated_at: new Date().toISOString() })
          );
          return null;
        }
        return errorText(res, data);
      } catch {
        return t("community_comment_action_failed");
      } finally {
        setActionBusy(false);
      }
    },
    [errorText, postId, t]
  );

  /** 관리자 숨김·삭제 — 콘솔과 같은 API·사유·CAS (CM-P2-02 · 설계 §6.7) */
  const moderateCommentAsAdmin = useCallback(
    async (commentId: string, nextStatus: "hidden" | "deleted") => {
      const reason = await dibayPrompt({
        title: nextStatus === "hidden" ? t("community_confirm_hide_comment") : t("community_confirm_delete_comment"),
        description:
          nextStatus === "hidden" ? t("community_comment_admin_hide_reason") : t("community_comment_admin_delete_reason"),
        confirmTone: "destructive",
        required: true,
        minLength: 2,
      });
      if (!reason?.trim()) return;
      setActionBusy(true);
      try {
        const res = await fetch(`/api/admin/community/engine/comments/${encodeURIComponent(commentId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, expectedStatus: "active", reason: reason.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!(res.ok && data.ok)) toast(errorText(res, data));
        await reloadComments();
      } catch {
        toast(t("community_comment_action_failed"));
      } finally {
        setActionBusy(false);
      }
    },
    [errorText, reloadComments, t, toast]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const ok = await dibayConfirm({
        title: t("community_confirm_delete_comment"),
        description: t("community_comment_delete_desc"),
        confirmLabel: t("community_delete"),
        cancelLabel: t("common_cancel"),
        confirmTone: "destructive",
      });
      if (!ok) return;
      setActionBusy(true);
      try {
        const res = await fetch(philifePostCommentUrl(postId, commentId), { method: "DELETE", credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!(res.ok && data.ok)) toast(errorText(res, data));
        setReplyTarget((cur) => (cur?.id === commentId ? null : cur));
        await reloadComments();
      } catch {
        toast(t("community_comment_action_failed"));
      } finally {
        setActionBusy(false);
      }
    },
    [errorText, postId, reloadComments, t, toast]
  );

  const pinComment = useCallback(
    async (commentId: string, pinned: boolean) => {
      setActionBusy(true);
      try {
        const res = await fetch(philifePostCommentPinUrl(postId, commentId), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!(res.ok && data.ok)) toast(errorText(res, data, "community_comment_pin_failed"));
        await reloadComments();
      } catch {
        toast(t("community_comment_pin_failed"));
      } finally {
        setActionBusy(false);
      }
    },
    [errorText, postId, reloadComments, t, toast]
  );

  return {
    comments,
    count,
    maxLength,
    loading,
    loadError,
    actionBusy,
    submitError,
    commentText,
    setCommentText,
    replyTarget,
    startReply,
    cancelReply,
    focusCommentId,
    setFocusCommentId,
    submitComment,
    likeComment,
    editComment,
    deleteComment,
    moderateCommentAsAdmin,
    pinComment,
    reloadComments,
    retryComments,
    clearSubmitError: () => setSubmitError(""),
  };
}
