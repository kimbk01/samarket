"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type CommentRow = {
  id: string;
  body: string;
  createdAt: string;
  mine?: boolean;
};

export function CustomerCenterCommentsPanel({
  contentId,
  enabled,
}: {
  contentId: string;
  enabled: boolean;
}) {
  const { safeT, language } = useI18n();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!enabled || !contentId.trim()) {
      setLoading(false);
      return;
    }
    try {
      const res = await runSingleFlight(`me:cc:comments:${contentId}`, () =>
        fetch(`/api/me/settings/notices/${encodeURIComponent(contentId)}/comments`, {
          credentials: "include",
          cache: "no-store",
        })
      );
      const json = (await res.clone().json().catch(() => ({}))) as {
        ok?: boolean;
        comments?: CommentRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(
          typeof json.error === "string"
            ? json.error
            : safeT("cc_comments_load_failed", {
                fallbackKo: "댓글을 불러오지 못했습니다",
                fallbackEn: "Could not load comments",
              })
        );
        return;
      }
      setComments(Array.isArray(json.comments) ? json.comments : []);
      setError(null);
    } catch {
      setError(
        safeT("cc_comments_load_failed", {
          fallbackKo: "댓글을 불러오지 못했습니다",
          fallbackEn: "Could not load comments",
        })
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on content/enabled only
  }, [contentId, enabled]);

  if (!enabled) return null;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(language === "ko" ? "ko-KR" : "en-US");
  };

  const onSubmit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/settings/notices/${encodeURIComponent(contentId)}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        comment?: CommentRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.comment) {
        setError(
          typeof json.error === "string"
            ? json.error
            : safeT("cc_comments_post_failed", {
                fallbackKo: "댓글 등록에 실패했습니다",
                fallbackEn: "Could not post comment",
              })
        );
        return;
      }
      setDraft("");
      setComments((prev) => [json.comment!, ...prev]);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (commentId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/me/settings/notices/${encodeURIComponent(contentId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-[rgba(14,92,58,0.1)] pt-4" data-testid="cc-comments">
      <h2 className="text-[14px] font-semibold text-[#1A2E24]">
        {safeT("cc_comments_title", { fallbackKo: "댓글", fallbackEn: "Comments" })}
        {` ${comments.length}`}
      </h2>

      <div className="flex items-end gap-2">
        <textarea
          className="min-h-[44px] flex-1 rounded-xl border border-[rgba(14,92,58,0.14)] bg-[#F5F7F6] px-3 py-2.5 text-[14px] text-[#1A2E24] outline-none ring-[#0E5C3A]/25 focus:ring-2"
          value={draft}
          maxLength={2000}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={safeT("cc_comments_placeholder", {
            fallbackKo: "의견을 남겨 주세요",
            fallbackEn: "Leave a comment",
          })}
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void onSubmit()}
          className="shrink-0 rounded-full bg-[#0E5C3A] px-3.5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-45"
        >
          {safeT("cc_comments_submit", { fallbackKo: "등록", fallbackEn: "Post" })}
        </button>
      </div>

      {loading ? (
        <p className="text-[13px] text-[#8F9D95]">
          {safeT("settings_notices_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : error ? (
        <p className="text-[13px] text-red-600">{error}</p>
      ) : comments.length === 0 ? (
        <p className="text-[13px] text-[#8F9D95]">
          {safeT("cc_comments_empty", { fallbackKo: "아직 댓글이 없습니다", fallbackEn: "No comments yet" })}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-[rgba(14,92,58,0.08)] bg-[#F5F7F6] px-3 py-2.5"
            >
              <p className="whitespace-pre-wrap break-words text-[14px] text-[#1A2E24]">{c.body}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-[#8F9D95]">
                <span>{formatDate(c.createdAt)}</span>
                {c.mine ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="font-medium text-red-600 disabled:opacity-50"
                    onClick={() => void onDelete(c.id)}
                  >
                    {safeT("common_delete", { fallbackKo: "삭제", fallbackEn: "Delete" })}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
