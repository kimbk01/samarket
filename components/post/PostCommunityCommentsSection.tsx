"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimeAgo } from "@/lib/utils/format";
import { createCommunityCommentReport } from "@/lib/reports/createCommunityCommentReport";

type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  authorNickname?: string;
};

const LOGIN_REDIRECT = "/mypage/account";

export function PostCommunityCommentsSection({
  postId,
  currentUserId,
  showCommentReport = true,
}: {
  postId: string;
  currentUserId: string | null;
  showCommentReport?: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!postId.trim()) return;
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { comments?: CommentRow[] };
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      if (!opts?.silent) setComments([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roots = useMemo(() => {
    return comments
      .filter((c) => !(c.parent_id ?? "").trim())
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [comments]);

  const repliesOf = useCallback(
    (parentId: string) =>
      comments
        .filter((c) => (c.parent_id ?? "").trim() === parentId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [comments]
  );

  const onSubmitComment = async () => {
    if (!currentUserId) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    setError("");
    const tempId = `temp-${Date.now()}`;
    const optimisticComment: CommentRow = {
      id: tempId,
      user_id: currentUserId,
      content: text,
      created_at: new Date().toISOString(),
      parent_id: replyParentId?.trim() || null,
      authorNickname: "나",
    };
    try {
      const body: { content: string; parentId?: string } = { content: text };
      if (replyParentId?.trim()) body.parentId = replyParentId.trim();

      setComments((prev) => [...prev, optimisticComment]);
      setDraft("");
      setReplyParentId(null);

      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setComments((prev) => prev.filter((comment) => comment.id !== tempId));
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      void load({ silent: true });
    } catch {
      setComments((prev) => prev.filter((comment) => comment.id !== tempId));
      setError("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const onReportComment = async (commentId: string) => {
    if (!currentUserId) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    const reason = window.prompt("댓글 신고 사유를 짧게 입력해 주세요.");
    if (reason == null) return;
    const text = reason.trim();
    if (!text) return;
    setReportBusyId(commentId);
    setError("");
    const res = await createCommunityCommentReport(commentId, text);
    setReportBusyId(null);
    if (res.ok) alert("신고가 접수되었습니다.");
    else setError(res.error);
  };

  const renderCommentRow = (c: CommentRow, opts: { isChild: boolean; allowReply: boolean }) => {
    const uid = c.user_id?.trim() ?? "";
    const label = c.authorNickname?.trim() || uid.slice(0, 8) || "사용자";
    const isCommentMine = !!currentUserId && uid === currentUserId;
    const showReportBtn = showCommentReport && !!currentUserId && !isCommentMine;

    return (
      <div
        className={
          opts.isChild
            ? "mt-2 ml-4 border-l-2 border-sky-100 pl-3"
            : "rounded-ui-rect border border-gray-100 bg-gray-50/80 px-3 py-2.5"
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-gray-900">
              {label}
              {opts.isChild ? <span className="ml-1 text-[11px] font-normal text-sky-700">답글</span> : null}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] text-gray-800">{c.content}</p>
            <p className="mt-1 text-[11px] text-gray-400">{formatTimeAgo(c.created_at)}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            {showReportBtn && (
              <button
                type="button"
                disabled={reportBusyId === c.id}
                onClick={() => void onReportComment(c.id)}
                className="rounded-ui-rect border border-red-100 bg-white px-2 py-1 text-[11px] font-medium text-red-700 disabled:opacity-50"
              >
                {reportBusyId === c.id ? "…" : "신고"}
              </button>
            )}
            {opts.allowReply && currentUserId && (
              <button
                type="button"
                onClick={() => setReplyParentId(c.id)}
                className="rounded-ui-rect border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700"
              >
                답글
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="community-post-comments" className="mt-4 border-t border-gray-100 bg-white px-4 py-4">
      <h3 className="text-[15px] font-semibold text-gray-900">댓글</h3>
      {loading ? (
        <p className="mt-3 text-[13px] text-gray-500">불러오는 중...</p>
      ) : roots.length === 0 ? (
        <p className="mt-3 text-[13px] text-gray-500">첫 댓글을 남겨 보세요.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {roots.map((root) => (
            <li key={root.id} className="space-y-0">
              {renderCommentRow(root, { isChild: false, allowReply: true })}
              {repliesOf(root.id).map((reply) => (
                <div key={reply.id}>{renderCommentRow(reply, { isChild: true, allowReply: false })}</div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {replyParentId ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
            <span>이 댓글에 답글 작성 중</span>
            <button
              type="button"
              className="font-medium text-sky-800 underline"
              onClick={() => setReplyParentId(null)}
            >
              취소
            </button>
          </div>
        ) : null}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            currentUserId
              ? replyParentId
                ? "답글을 입력하세요"
                : "댓글을 입력하세요"
              : "로그인 후 댓글을 작성할 수 있어요"
          }
          disabled={!currentUserId || submitting}
          rows={3}
          className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px] text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={() => (currentUserId ? void onSubmitComment() : router.push(LOGIN_REDIRECT))}
          disabled={!!currentUserId && (submitting || !draft.trim())}
          className="mt-2 w-full rounded-ui-rect bg-gray-900 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {currentUserId
            ? submitting
              ? "등록 중..."
              : replyParentId
                ? "답글 등록"
                : "댓글 등록"
            : "로그인하고 댓글 쓰기"}
        </button>
        {error ? <p className="mt-2 text-[13px] text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
