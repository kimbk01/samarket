"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { findCommentById, updateCommentInTree } from "@/lib/neighborhood/comment-tree";
import { fetchPhilifePostCommentTree } from "@/lib/neighborhood/philife-post-comments.client";
import { handleProfileIncompleteApiResponse } from "@/lib/profile/handle-profile-incomplete-api-response";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import {
  philifePostCommentLikeUrl,
  philifePostCommentUrl,
  philifePostCommentsUrl,
} from "@domain/philife/api";

function countCommentNodesFlat(nodes: NeighborhoodCommentNode[]): number {
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

/**
 * 필라이프 글 상세 댓글 — 당근형 단일 소유권.
 * - postId 변경 시에만 초기화·최초 로드
 * - 작성/답글 성공 → 서버 목록 전체 교체
 * - 공감 → 낙관 토글 + 서버 확정
 */
export function usePhilifePostComments(postId: string) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();

  const [comments, setComments] = useState<NeighborhoodCommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [likeError, setLikeError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadSeqRef = useRef(0);
  const likeInflightRef = useRef(new Set<string>());

  const applyFetchResult = useCallback(
    (seq: number, result: Awaited<ReturnType<typeof fetchPhilifePostCommentTree>>) => {
      if (seq !== loadSeqRef.current) return false;
      if (result.ok) {
        setComments(result.tree);
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
    setLoading(true);
    setLoadError(false);
    setSubmitError("");
    setLikeError("");
    setCommentText("");
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

  const resolveSubmitError = useCallback(
    (res: Response, data: { ok?: boolean; error?: string; code?: string }) => {
      if (data.code === "community_comment_blocked_relation" || res.status === 403) {
        return t("community_comment_blocked_relation");
      }
      const msg = typeof data.error === "string" ? data.error.trim() : "";
      return msg || t("community_comment_locked");
    },
    [t]
  );

  const resolveLikeBlockedError = useCallback(
    (res: Response, data: { ok?: boolean; code?: string }) => {
      if (data.code === "community_like_blocked_relation" || res.status === 403) {
        return t("community_like_blocked_relation");
      }
      return "";
    },
    [t]
  );

  const postComment = useCallback(
    async (content: string, parentId?: string | null) => {
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
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          code?: string;
          id?: string;
        };
        if (!data.ok) {
          const profileHandled = handleProfileIncompleteApiResponse(data);
          setSubmitError(
            profileHandled.handled ? profileHandled.error : resolveSubmitError(res, data)
          );
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
    [postId, reloadComments, resolveSubmitError, t]
  );

  const submitRootComment = useCallback(async () => {
    const next =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
    await requireAction(
      "community_comment",
      async () => {
        const createdId = await postComment(commentText, null);
        if (createdId === false) return;
        setCommentText("");
        if (createdId) setFocusCommentId(createdId);
      },
      { next }
    );
  }, [commentText, postComment, requireAction]);

  /** 성공 여부를 돌려준다 — 실패 시 답글 입력을 유지하기 위해 (CM-P2-03) */
  const submitReply = useCallback(
    async (parentId: string, content: string): Promise<boolean> => {
      const next =
        typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
      let posted = false;
      await requireAction(
        "community_comment",
        async () => {
          const createdId = await postComment(content, parentId);
          if (createdId === false) return;
          posted = true;
          if (createdId) setFocusCommentId(createdId);
        },
        { next }
      );
      return posted;
    },
    [postComment, requireAction]
  );

  const likeComment = useCallback(
    async (commentId: string, viewerUserId: string | null | undefined) => {
      if (!viewerUserId) {
        const n = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
        void requireAction("community_like", () => undefined, { next: n });
        return;
      }
      const cid = commentId.trim();
      if (!cid || likeInflightRef.current.has(cid)) return;
      likeInflightRef.current.add(cid);

      let rollbackSnap: { liked_by_viewer: boolean; like_count: number } | undefined;
      setComments((cur) => {
        const node = findCommentById(cur, cid);
        if (!node) return cur;
        rollbackSnap = { liked_by_viewer: node.liked_by_viewer, like_count: node.like_count };
        const nextLiked = !node.liked_by_viewer;
        return updateCommentInTree(cur, cid, {
          liked_by_viewer: nextLiked,
          like_count: Math.max(0, node.like_count + (nextLiked ? 1 : -1)),
        });
      });

      try {
        const res = await fetch(philifePostCommentLikeUrl(postId, cid), {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json()) as { ok?: boolean; liked?: boolean; like_count?: number; code?: string };
        if (data.ok && typeof data.like_count === "number" && typeof data.liked === "boolean") {
          setComments((cur) =>
            updateCommentInTree(cur, cid, { liked_by_viewer: data.liked, like_count: data.like_count })
          );
          setLikeError("");
        } else {
          if (rollbackSnap) {
            const snap = rollbackSnap;
            setComments((cur) =>
              updateCommentInTree(cur, cid, {
                liked_by_viewer: snap.liked_by_viewer,
                like_count: snap.like_count,
              })
            );
          }
          const err = resolveLikeBlockedError(res, data);
          if (err) setLikeError(err);
        }
      } catch {
        if (rollbackSnap) {
          const snap = rollbackSnap;
          setComments((cur) =>
            updateCommentInTree(cur, cid, {
              liked_by_viewer: snap.liked_by_viewer,
              like_count: snap.like_count,
            })
          );
        }
      } finally {
        likeInflightRef.current.delete(cid);
      }
    },
    [postId, requireAction, resolveLikeBlockedError]
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
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && data.ok) {
          const now = new Date().toISOString();
          setComments((cur) =>
            updateCommentInTree(cur, commentId, { content: text, is_edited: true, updated_at: now })
          );
          return null;
        }
        return (typeof data.error === "string" && data.error.trim()) || t("community_comment_action_failed");
      } catch {
        return t("community_comment_action_failed");
      } finally {
        setActionBusy(false);
      }
    },
    [postId, t]
  );

  const deleteComment = useCallback(
    async (commentId: string, opts?: { asAdmin?: boolean }) => {
      /** 관리자 삭제는 사유 필수 + 현재 상태 CAS — 관리자 콘솔과 같은 계약 (CM-P2-02) */
      let adminReason: string | null = null;
      if (opts?.asAdmin) {
        adminReason = await dibayPrompt({
          title: t("community_confirm_delete_comment"),
          description: t("community_comment_admin_delete_reason"),
          confirmTone: "destructive",
          required: true,
          minLength: 2,
        });
        if (!adminReason?.trim()) return;
      } else if (
        !(await dibayConfirm({ title: t("community_confirm_delete_comment"), confirmTone: "destructive" }))
      ) {
        return;
      }
      setActionBusy(true);
      try {
        let res: Response;
        if (opts?.asAdmin) {
          res = await fetch(
            `/api/admin/community/engine/comments/${encodeURIComponent(commentId)}`,
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "deleted", expectedStatus: "active", reason: adminReason!.trim() }),
            }
          );
        } else {
          res = await fetch(philifePostCommentUrl(postId, commentId), { method: "DELETE", credentials: "include" });
        }
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!(res.ok && data.ok)) {
          await dibayAlert({
            title: (typeof data.error === "string" && data.error.trim()) || t("community_comment_action_failed"),
          });
          await reloadComments();
          return;
        }
        {
          setComments((cur) =>
            updateCommentInTree(cur, commentId, {
              content: t("community_comment_deleted"),
              is_edited: false,
              like_count: 0,
              liked_by_viewer: false,
            })
          );
        }
      } catch {
        await dibayAlert({ title: t("community_comment_action_failed") });
      } finally {
        setActionBusy(false);
      }
    },
    [postId, reloadComments, t]
  );

  const displayCommentCount = useMemo(() => countCommentNodesFlat(comments), [comments]);

  return {
    comments,
    loading,
    loadError,
    actionBusy,
    submitError,
    likeError,
    commentText,
    setCommentText,
    focusCommentId,
    displayCommentCount,
    submitRootComment,
    submitReply,
    likeComment,
    editComment,
    deleteComment,
    retryComments,
    clearSubmitError: () => setSubmitError(""),
  };
}
