"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { NeighborhoodMeetingNoticeDTO, MeetingFeedPostDTO } from "@/lib/neighborhood/types";
import { formatKorDateTime } from "@/lib/ui/format-meeting-date";

function formatDate(iso: string | null | undefined): string {
  return formatKorDateTime(iso);
}

interface UnifiedNotice {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  source: "notice" | "feed";
}

function toUnified(
  notices: NeighborhoodMeetingNoticeDTO[],
  feedPosts: MeetingFeedPostDTO[],
  noticeFallback: string,
  feedNoticeTitle: string,
): UnifiedNotice[] {
  const fromNotices: UnifiedNotice[] = notices.map((n) => ({
    id: n.id,
    title: n.title || noticeFallback,
    body: n.body,
    is_pinned: n.is_pinned,
    created_at: n.created_at,
    source: "notice",
  }));

  const fromFeed: UnifiedNotice[] = feedPosts
    .filter((p) => p.post_type === "notice")
    .map((p) => ({
      id: p.id,
      title: feedNoticeTitle,
      body: p.content,
      is_pinned: false,
      created_at: p.created_at,
      source: "feed",
    }));

  return [...fromNotices, ...fromFeed].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    const ta = Number.isNaN(Date.parse(a.created_at)) ? 0 : Date.parse(a.created_at);
    const tb = Number.isNaN(Date.parse(b.created_at)) ? 0 : Date.parse(b.created_at);
    return tb - ta;
  });
}

interface MeetingNoticesTabProps {
  notices: NeighborhoodMeetingNoticeDTO[];
  feedPosts?: MeetingFeedPostDTO[];
  currentUserId?: string;
  isHost?: boolean;
  meetingId?: string;
  /** 모임 메타 — 공지 DB·피드 연동 표시 */
  noticeCount?: number;
  lastNoticeAt?: string | null;
  /** 피드에서 유형이 공지인 글 수 */
  feedNoticeCount?: number;
  /** false면 회원 피드 글 작성 제한(운영자만) */
  allowFeed?: boolean;
  /** 피드 탭으로 이동 (공지 유형 미리 선택) */
  onGoFeed?: () => void;
}

export function MeetingNoticesTab({
  notices,
  feedPosts = [],
  isHost,
  noticeCount = 0,
  lastNoticeAt = null,
  feedNoticeCount = 0,
  allowFeed = true,
  onGoFeed,
}: MeetingNoticesTabProps) {
  const { t } = useI18n();
  const [showHint, setShowHint] = useState(false);
  const unified = toUnified(
    notices,
    feedPosts,
    t("community_notice_fallback"),
    t("meeting_notices_feed_badge"),
  );
  const dbNoticeTotal = typeof noticeCount === "number" ? noticeCount : notices.length;
  const lastAtLabel =
    lastNoticeAt && !Number.isNaN(Date.parse(lastNoticeAt))
      ? formatDate(lastNoticeAt)
      : "—";

  return (
    <div className="space-y-3">
      {/* 공지 ↔ 피드 연동 상태 */}
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3.5 py-3 shadow-sm">
        <p className="sam-text-helper font-semibold text-sam-fg">{t("meeting_sync_status_title")}</p>
        <ul className="mt-2 space-y-1.5 sam-text-helper text-sam-muted">
          <li className="flex justify-between gap-2">
            <span>{t("meeting_notices_db")}</span>
            <span className="shrink-0 font-medium text-sam-fg">
              {t("meeting_notices_db_meta", { count: dbNoticeTotal, last: lastAtLabel })}
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span>{t("meeting_notices_feed_type")}</span>
            <span className="shrink-0 font-medium text-sam-fg">{t("meeting_count_unit", { count: feedNoticeCount })}</span>
          </li>
          <li className="flex justify-between gap-2 border-t border-sam-border-soft pt-1.5">
            <span>{t("meeting_notices_unified_list")}</span>
            <span className="shrink-0 font-semibold text-[#2d7a5e]">{t("meeting_count_unit", { count: unified.length })}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>{t("meeting_notices_feed_member")}</span>
            <span
              className={`shrink-0 font-medium ${allowFeed ? "text-emerald-700" : "text-amber-700"}`}
            >
              {allowFeed ? t("meeting_notices_member_write_allow") : t("meeting_notices_member_write_restrict")}
            </span>
          </li>
        </ul>
        <p className="mt-2 sam-text-xxs leading-relaxed text-sam-meta">{t("meeting_notices_sync_hint")}</p>
      </div>

      {/* 운영진 전용 — 공지 작성 안내 */}
      {isHost && (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex items-center justify-between">
            <p className="sam-text-body-secondary font-semibold text-emerald-800">{t("meeting_notices_write_title")}</p>
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="sam-text-helper text-emerald-600"
            >
              {showHint ? t("common_close") : t("meeting_notices_howto_btn")}
            </button>
          </div>
          {showHint && (
            <p className="mt-1 sam-text-helper leading-relaxed text-emerald-700">{t("meeting_notices_howto_body")}</p>
          )}
          {onGoFeed && (
            <button
              type="button"
              onClick={onGoFeed}
              className="mt-2 w-full rounded-ui-rect bg-emerald-600 py-2 sam-text-body-secondary font-semibold text-white hover:bg-emerald-700"
            >
              {t("meeting_notices_go_feed")}
            </button>
          )}
        </div>
      )}

      {unified.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-16 text-center">
          <p className="sam-text-hero">📢</p>
          <p className="mt-3 sam-text-body text-sam-meta">{t("meeting_notices_empty")}</p>
          {isHost && <p className="mt-1 sam-text-helper text-sam-meta">{t("meeting_notices_empty_host")}</p>}
        </div>
      ) : (
        unified.map((notice) => (
          <div
            key={notice.id}
            className={`rounded-ui-rect border bg-sam-surface p-4 shadow-sm ${
              notice.is_pinned ? "border-amber-200 bg-amber-50/30" : "border-sam-border-soft"
            }`}
          >
            <div className="flex items-start gap-2">
              {notice.is_pinned && <span className="mt-0.5 shrink-0 sam-text-body-lg">📌</span>}
              <div className="min-w-0 flex-1">
                <p className="sam-text-body font-semibold text-sam-fg">{notice.title}</p>
                <p className="mt-1 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">
                  {notice.body}
                </p>
                <p className="mt-2 sam-text-xxs text-sam-meta">{formatDate(notice.created_at)}</p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
