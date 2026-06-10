"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { formatTimeAgo } from "@/lib/utils/format";
import { createCommunityCommentReport } from "@/lib/reports/createCommunityCommentReport";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";

type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  authorNickname?: string;
  authorUsername?: string | null;
};

export function PostCommunityCommentsSection({
  postId,
  currentUserId,
  showCommentReport = true,
}: {
  postId: string;
  currentUserId: string | null;
  showCommentReport?: boolean;
}) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!postId.trim()) return;
    if (!opts?.silent) setLoading((prev) => (prev ? prev : true));
    try {
      const res = await runSingleFlight(`post:${postId}:comments-get`, () =>
        fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, { cache: "no-store" })
      );
      const data = (await res.clone().json().catch(() => ({}))) as { comments?: CommentRow[] };
      const nextComments = Array.isArray(data.comments) ? data.comments : [];
      setComments((prev) => {
        if (
          prev.length === nextComments.length &&
          prev.every(
            (c, idx) =>
              c.id === nextComments[idx]?.id &&
              c.content === nextComments[idx]?.content &&
              c.created_at === nextComments[idx]?.created_at &&
              (c.parent_id ?? null) === (nextComments[idx]?.parent_id ?? null)
          )
        ) {
          return prev;
        }
        return nextComments;
      });
    } catch {
      if (!opts?.silent) setComments((prev) => (prev.length === 0 ? prev : []));
    } finally {
      if (!opts?.silent) setLoading((prev) => (prev ? false : prev));
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { roots, repliesByParent } = useMemo(() => {
    const nextRoots: CommentRow[] = [];
    const nextRepliesByParent = new Map<string, CommentRow[]>();
    for (const c of comments) {
      const parentId = (c.parent_id ?? "").trim();
      if (!parentId) {
        nextRoots.push(c);
        continue;
      }
      const bucket = nextRepliesByParent.get(parentId);
      if (bucket) bucket.push(c);
      else nextRepliesByParent.set(parentId, [c]);
    }
    nextRoots.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const [, list] of nextRepliesByParent) {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return { roots: nextRoots, repliesByParent: nextRepliesByParent };
  }, [comments]);

  const onSubmitComment = async () => {
    const actorId = currentUserId ?? (await getCurrentUserIdForDb())?.trim() ?? null;
    if (!actorId) {
      await requireAction("community_comment", onSubmitComment);
      return;
    }
    const text = draft.trim();
    if (!text) return;
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === "" ? prev : ""));
    const tempId = `temp-${Date.now()}`;
    const optimisticComment: CommentRow = {
      id: tempId,
      user_id: actorId,
      content: text,
      created_at: new Date().toISOString(),
      parent_id: replyParentId?.trim() || null,
      authorNickname: "나",
    };
    try {
      const body: { content: string; parentId?: string } = { content: text };
      if (replyParentId?.trim()) body.parentId = replyParentId.trim();

      setComments((prev) => [...prev, optimisticComment]);
      setDraft((prev) => (prev === "" ? prev : ""));
      setReplyParentId((prev) => (prev === null ? prev : null));

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
      setSubmitting((prev) => (prev ? false : prev));
    }
  };

  const onReportComment = async (commentId: string) => {
    const actorId = currentUserId ?? (await getCurrentUserIdForDb())?.trim() ?? null;
    if (!actorId) {
      await requireAction("community_report", () => onReportComment(commentId));
      return;
    }
    const reason = window.prompt("댓글 신고 사유를 짧게 입력해 주세요.");
    if (reason == null) return;
    const text = reason.trim();
    if (!text) return;
    setReportBusyId(commentId);
    setError((prev) => (prev === "" ? prev : ""));
    const res = await createCommunityCommentReport(commentId, text);
    setReportBusyId((prev) => (prev === null ? prev : null));
    if (res.ok) alert(t("cm_ui_report_submitted"));
    else setError(res.error);
  };

  const renderCommentRow = (c: CommentRow, opts: { isChild: boolean; allowReply: boolean }) => {
    const uid = c.user_id?.trim() ?? "";
    const label = c.authorNickname?.trim() || uid.slice(0, 8) || "사용자";
    const atUsername = c.authorUsername ? `@${c.authorUsername}` : "";
    const isCommentMine = !!currentUserId && uid === currentUserId;
    const showReportBtn = showCommentReport && !!currentUserId && !isCommentMine;

    return (
      <div
        className={
          opts.isChild
            ? "mt-2 ml-4 border-l-2 border-sky-100 pl-3"
            : "rounded-ui-rect border border-sam-border-soft bg-sam-app/80 px-3 py-2.5"
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`font-medium text-sam-fg ${Sam.text.bodySecondary}`}>
              {label}
              {opts.isChild ? <span className={`ml-1 font-normal text-sky-700 ${Sam.text.xxs}`}>{t("community_comment_reply")}</span> : null}
            </p>
            {atUsername ? (
              <p className={`mt-0.5 truncate font-mono text-sam-muted tabular-nums ${Sam.text.xxs}`}>
                {atUsername}
              </p>
            ) : null}
            <p className={`mt-1 whitespace-pre-wrap text-sam-fg ${Sam.text.body}`}>{c.content}</p>
            <p className={`mt-1 text-sam-meta ${Sam.text.xxs}`}>{formatTimeAgo(c.created_at)}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            {showReportBtn && (
              <button
                type="button"
                disabled={reportBusyId === c.id}
                onClick={() => void onReportComment(c.id)}
                className={`rounded-ui-rect border border-red-100 bg-sam-surface px-2 py-1 font-medium text-red-700 disabled:opacity-50 ${Sam.text.xxs}`}
              >
                {reportBusyId === c.id ? "…" : t("common_report")}
              </button>
            )}
            {opts.allowReply && currentUserId && (
              <button
                type="button"
                onClick={() => setReplyParentId((prev) => (prev === c.id ? prev : c.id))}
                className={`rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 font-medium text-sam-fg ${Sam.text.xxs}`}
              >
                {t("community_comment_reply")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="community-post-comments" className="mt-4 border-t border-sam-border-soft bg-sam-surface px-4 py-4">
      <h3 className={`font-semibold text-sam-fg ${Sam.text.body}`}>{t("community_stat_comments_title")}</h3>
      {loading ? (
        <p className={`mt-3 text-sam-muted ${Sam.text.bodySecondary}`}>{t("common_loading")}</p>
      ) : roots.length === 0 ? (
        <p className={`mt-3 text-sam-muted ${Sam.text.bodySecondary}`}>{t("community_comment_first")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {roots.map((root) => (
            <li key={root.id} className="space-y-0">
              {renderCommentRow(root, { isChild: false, allowReply: true })}
              {(repliesByParent.get(root.id) ?? []).map((reply) => (
                <div key={reply.id}>{renderCommentRow(reply, { isChild: true, allowReply: false })}</div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {replyParentId ? (
          <div
            className={`mb-2 flex items-center justify-between gap-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900 ${Sam.text.bodySecondary}`}
          >
            <span>{t("ui_post_comment_replying")}</span>
            <button
              type="button"
              className="font-medium text-sky-800 underline"
              onClick={() => setReplyParentId((prev) => (prev === null ? prev : null))}
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
          className={`${Sam.input.textarea} disabled:bg-sam-app`}
        />
        <button
          type="button"
          onClick={() => void onSubmitComment()}
          disabled={!!currentUserId && (submitting || !draft.trim())}
          className={`mt-2 w-full rounded-ui-rect bg-sam-ink py-2.5 font-medium text-white disabled:opacity-50 ${Sam.text.body}`}
        >
          {currentUserId
            ? submitting
              ? "등록 중..."
              : replyParentId
                ? "답글 등록"
                : "댓글 등록"
            : "로그인하고 댓글 쓰기"}
        </button>
        {error ? <p className={`mt-2 text-red-600 ${Sam.text.bodySecondary}`}>{error}</p> : null}
      </div>
    </div>
  );
}
