"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useState, useTransition, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MeetingFeedPostDTO } from "@/lib/neighborhood/types";
import { MeetingReportModal } from "@/components/meetings/MeetingReportModal";
import { formatKorDateTime } from "@/lib/ui/format-meeting-date";

function formatTime(iso: string | null | undefined): string {
  return formatKorDateTime(iso);
}

interface MeetingFeedTabProps {
  feedPosts: MeetingFeedPostDTO[];
  meetingId: string;
  currentUserId?: string;
  /** 운영 권한(모임장·공동운영자) */
  isHost?: boolean;
  /** false면 일반 멤버는 글 작성 불가 — API와 동일 */
  allowFeed?: boolean;
}

export function MeetingFeedTab({
  feedPosts,
  meetingId,
  currentUserId,
  isHost,
  allowFeed = true,
}: MeetingFeedTabProps) {
  const { t } = useI18n();
  const router = useRouter();

  const postTypeLabels = useMemo(
    (): Record<string, string> => ({
      notice: t("meeting_feed_type_notice"),
      intro: t("meeting_feed_type_intro"),
      attendance: t("meeting_feed_type_attendance"),
      review: t("meeting_feed_type_review"),
      normal: "",
    }),
    [t],
  );

  const writableTypes = useMemo(
    (): { value: MeetingFeedPostDTO["post_type"]; label: string }[] => [
      { value: "normal", label: t("meeting_feed_type_normal") },
      { value: "intro", label: t("meeting_feed_type_intro") },
      { value: "attendance", label: t("meeting_feed_type_attendance") },
      { value: "review", label: t("meeting_feed_type_review") },
    ],
    [t],
  );

  const hostTypes = useMemo(
    (): { value: MeetingFeedPostDTO["post_type"]; label: string }[] => [
      ...writableTypes,
      { value: "notice", label: t("meeting_feed_type_notice") },
    ],
    [t, writableTypes],
  );
  const pathname = usePathname() ?? "";
  const [isPending, startTransition] = useTransition();
  const canWrite = Boolean(isHost) || allowFeed !== false;

  const [localPosts, setLocalPosts] = useState<MeetingFeedPostDTO[]>(feedPosts);
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<MeetingFeedPostDTO["post_type"]>("normal");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 백업 폴링 — 포그라운드에서만 타이머, 복귀 시 1회 동기화, 요청 중복 방지 */
  useEffect(() => {
    let inFlight = false;
    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/philife/meetings/${meetingId}/feed`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as { ok: boolean; posts?: MeetingFeedPostDTO[] };
        if (j.ok && Array.isArray(j.posts) && j.posts.length > 0) {
          setLocalPosts(j.posts);
        }
      } catch {
        // 무시
      } finally {
        inFlight = false;
      }
    };
    let intervalId: number | null = null;
    const stopPoll = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const startPoll = () => {
      stopPoll();
      intervalId = window.setInterval(() => {
        void poll();
      }, 30_000);
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        void poll();
        startPoll();
      } else {
        stopPoll();
      }
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      void poll();
      startPoll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [meetingId]);

  const visible = localPosts.filter((p) => !p.is_hidden);
  const sorted = [...visible].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    const ta = Number.isNaN(Date.parse(a.created_at)) ? 0 : Date.parse(a.created_at);
    const tb = Number.isNaN(Date.parse(b.created_at)) ? 0 : Date.parse(b.created_at);
    return tb - ta;
  });

  const typeOptions = isHost ? hostTypes : writableTypes;

  const handleDelete = async (postId: string) => {
    if (!(await dibayConfirm({ title: t("meeting_feed_confirm_delete"), cancelLabel: t("common_cancel"), confirmLabel: t("common_confirm"), confirmTone: "destructive" }))) return;
    setDeletingId(postId);
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/feed/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok: boolean };
      if (j.ok) {
        setLocalPosts((prev) => prev.filter((p) => p.id !== postId));
        startTransition(() => router.refresh());
      }
    } catch {
      // 무시
    } finally {
      setDeletingId(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/feed`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, post_type: postType }),
      });
      const j = (await res.json()) as { ok: boolean; post?: MeetingFeedPostDTO; error?: string };
      if (!j.ok) {
        if (redirectForBlockedAction(router, j.error, pathname)) return;
        const code = (j as { error?: string }).error;
        setErr(
          code === "too_long"
            ? t("meeting_feed_err_too_long")
            : code === "feed_disabled"
              ? t("meeting_feed_err_disabled")
              : t("meeting_feed_err_submit_failed"),
        );
        return;
      }
      if (j.post) {
        setLocalPosts((prev) => [j.post!, ...prev]);
      }
      setContent("");
      setPostType("normal");
      setShowForm(false);
      startTransition(() => router.refresh());
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3.5 py-3 shadow-sm">
        <p className="sam-text-helper font-semibold text-sam-fg">{t("meeting_sync_status_title")}</p>
        <ul className="mt-2 space-y-1 sam-text-helper text-sam-muted">
          <li className="flex justify-between gap-2">
            <span>{t("meeting_feed_posts_visible")}</span>
            <span className="font-medium text-sam-fg">{t("meeting_count_unit", { count: sorted.length })}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>{t("meeting_feed_member_write")}</span>
            <span className={allowFeed !== false ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
              {allowFeed !== false ? t("meeting_feed_allow_all") : t("meeting_feed_restrict_host")}
            </span>
          </li>
        </ul>
        {!canWrite ? (
          <p className="mt-2 rounded-ui-rect bg-amber-50 px-2.5 py-2 sam-text-xxs leading-relaxed text-amber-900">
            {t("meeting_feed_disabled_hint")}
          </p>
        ) : null}
      </div>

      {/* 신고 모달 */}
      {reportTarget && (
        <MeetingReportModal
          meetingId={meetingId}
          targetType="feed_post"
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* 글쓰기 입력창 스타일 CTA */}
      {canWrite && showForm ? (
        <form onSubmit={(e) => void onSubmit(e)} className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          {/* 유형 선택 탭 */}
          <div className="flex gap-1 border-b border-sam-border-soft px-3 pt-3 pb-2">
            {typeOptions.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setPostType(t.value)}
                className={`rounded-full px-3 py-1 sam-text-xxs font-semibold transition-colors ${
                  postType === t.value
                    ? "bg-emerald-500 text-white"
                    : "bg-sam-app text-sam-muted hover:bg-sam-surface-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder={t("meeting_feed_placeholder")}
            className="w-full resize-none px-4 py-3 sam-text-body leading-relaxed text-sam-fg placeholder-sam-meta outline-none"
          />

          <div className="flex items-center justify-between border-t border-sam-border-soft px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="sam-text-xxs text-sam-meta">{content.length}/2000</span>
              {err && <span className="sam-text-xxs text-red-500">{err}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setContent(""); setErr(""); }}
                className="rounded-ui-rect px-3 py-1.5 sam-text-helper font-medium text-sam-muted hover:bg-sam-surface-muted"
              >
                {t("common_cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="rounded-ui-rect bg-emerald-500 px-4 py-1.5 sam-text-body-secondary font-semibold text-white disabled:opacity-40"
              >
                {submitting ? t("meeting_feed_posting") : t("meeting_feed_post_submit")}
              </button>
            </div>
          </div>
        </form>
      ) : canWrite ? (
        /* 입력창처럼 생긴 CTA */
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3.5 text-left shadow-sm hover:border-emerald-300"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted sam-text-body font-semibold text-sam-muted">
            +
          </div>
          <span className="flex-1 sam-text-body text-sam-meta">{t("meeting_feed_compose_cta")}</span>
        </button>
      ) : null}

      {/* 피드 목록 */}
      {sorted.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-14 text-center">
          <p className="sam-text-hero">📝</p>
          <p className="mt-2 sam-text-body text-sam-meta">{t("meeting_feed_empty")}</p>
          <p className="mt-1 sam-text-helper text-sam-meta">{t("meeting_feed_empty_hint")}</p>
        </div>
      ) : (
        sorted.map((post) => {
          const typeLabel = postTypeLabels[post.post_type] ?? "";
          const isMine = post.author_user_id === currentUserId;
          const authorIsHost = isHost && post.author_user_id === currentUserId;
          return (
            <div
              key={post.id}
              className={`rounded-ui-rect border bg-sam-surface p-4 shadow-sm ${
                post.is_pinned ? "border-amber-200 bg-amber-50/40" : "border-sam-border-soft"
              }`}
            >
              {(post.is_pinned || typeLabel) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {post.is_pinned && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 sam-text-xxs font-semibold text-amber-800">
                      {t("meeting_feed_pinned")}
                    </span>
                  )}
                  {typeLabel && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 sam-text-xxs font-semibold text-emerald-800">
                      {typeLabel}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted sam-text-helper font-semibold text-sam-muted">
                  {(post.author_name || "?").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="sam-text-body-secondary font-medium text-sam-fg">
                      {post.author_name || t("meeting_unknown_member")}
                    </span>
                    {isMine && (
                      <span className="rounded-full bg-sky-50 px-1.5 py-0 sam-text-xxs text-sky-600">{t("community_me")}</span>
                    )}
                    {authorIsHost && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0 sam-text-xxs text-amber-700">{t("community_role_owner")}</span>
                    )}
                  </div>
                  <p className="sam-text-xxs text-sam-meta">{formatTime(post.created_at)}</p>
                </div>
                {/* 액션 버튼 */}
                <div className="flex shrink-0 items-center gap-1">
                  {isMine && (
                    <button
                      type="button"
                      disabled={deletingId === post.id}
                      onClick={() => void handleDelete(post.id)}
                      className="rounded-full p-1.5 sam-text-helper text-sam-meta hover:bg-red-50 hover:text-red-500"
                      title={t("common_delete")}
                    >
                      🗑
                    </button>
                  )}
                  {isHost && !isMine && (
                    <button
                      type="button"
                      disabled={deletingId === post.id}
                      onClick={() => void handleDelete(post.id)}
                      className="rounded-full p-1.5 sam-text-helper text-sam-meta hover:bg-red-50 hover:text-red-500"
                      title={t("meeting_feed_delete_host_title")}
                    >
                      🗑
                    </button>
                  )}
                  {!isMine && (
                    <button
                      type="button"
                      onClick={() => setReportTarget({ id: post.id })}
                      className="rounded-full p-1.5 sam-text-body text-sam-meta hover:bg-sam-surface-muted hover:text-sam-muted"
                      title={t("community_report")}
                    >
                      ···
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">
                {post.content}
              </p>
            </div>
          );
        })
      )}

      {isPending && (
        <p className="text-center sam-text-helper text-sam-meta">{t("meeting_refreshing")}</p>
      )}
    </div>
  );
}
