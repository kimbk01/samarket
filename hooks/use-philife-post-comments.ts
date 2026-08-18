"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
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
        const data = (await res.json()) as { ok?: boolean; error?: string; code?: string; id?: string };
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
      } finally {
        setActionBusy(false);
      }
    },
    [postId, reloadComments, resolveSubmitError]
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

  const submitReply = useCallback(
    async (parentId: string, content: string) => {
      const next =
        typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
      await requireAction(
        "community_comment",
        async () => {
          const createdId = await postComment(content, parentId);
          if (createdId === false) return;
          if (createdId) setFocusCommentId(createdId);
        },
        { next }
      );
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

  const editComment = useCallback(
    async (commentId: string, nextContent: string) => {
      const text = nextContent.trim();
      if (!text) return;
      setActionBusy(true);
      try {
        const res = await fetch(philifePostCommentUrl(postId, commentId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (res.ok && data.ok) {
          const now = new Date().toISOString();
          setComments((cur) =>
            updateCommentInTree(cur, commentId, { content: text, is_edited: true, updated_at: now })
          );
        } else {
          await reloadComments();
        }
      } finally {
        setActionBusy(false);
      }
    },
    [postId, reloadComments]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!(await dibayConfirm({ title: t("community_confirm_delete_comment"), confirmTone: "destructive" }))) return;
      setActionBusy(true);
      try {
        const res = await fetch(philifePostCommentUrl(postId, commentId), { method: "DELETE" });
        const data = (await res.json()) as { ok?: boolean };
        if (res.ok && data.ok) {
          setComments((cur) =>
            updateCommentInTree(cur, commentId, {
              content: t("community_comment_deleted"),
              is_edited: false,
              like_count: 0,
              liked_by_viewer: false,
            })
          );
        }
      } finally {
        setActionBusy(false);
      }
    },
    [postId, t]
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
