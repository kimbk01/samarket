"use client";

import Link from "next/link";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { MeetingJoinButton } from "./MeetingJoinButton";
import { philifeAppPaths } from "@domain/philife/paths";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

/** toLocaleString 대신 수동 포맷 — 서버/클라이언트 hydration 불일치 방지 */
function formatMeetingDate(iso: string | null | undefined, scheduleTbd: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return scheduleTbd;
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

type MeetingViewerStatus = "joined" | "pending" | "left" | "kicked" | "banned" | null;

export function MeetingCard({
  meeting,
  /** 글 상세 등: 위에서 제목·본문을 이미 보여줬을 때 중복 카드 느낌 제거 */
  variant = "default",
  /** postEmbed: 방장 표시명(글 작성자=호스트면 닉네임 등) */
  hostDisplayName,
  /** 서버에서 알려 주는 참여 상태 — 없으면 클라이언트만 보고 가입 요청 UI가 뜸 */
  viewerStatus = null,
}: {
  meeting: NeighborhoodMeetingDetailDTO;
  variant?: "default" | "postEmbed";
  hostDisplayName?: string;
  viewerStatus?: MeetingViewerStatus;
}) {
  const { t } = useI18n();
  const when =
    meeting.tenure_type === "long"
      ? t("community_meeting_schedule_tbd")
      : formatMeetingDate(meeting.meeting_date, t("community_meeting_schedule_tbd"));
  const joined = meeting.joined_count || meeting.member_count;
  const pendingNote =
    meeting.pending_count > 0 ? t("community_meeting_pending_approval", { count: meeting.pending_count }) : "";
  const closedNote = meeting.is_closed ? t("community_meeting_closed_note") : "";
  const policyHeadline =
    meeting.entry_policy === "approve"
      ? t("community_meeting_card_policy_approve")
      : meeting.entry_policy === "invite_only"
        ? t("community_meeting_card_policy_invite")
        : meeting.entry_policy === "password"
          ? t("community_meeting_card_policy_password")
          : t("community_meeting_card_policy_open");
  const joinMethod =
    meeting.entry_policy === "approve"
      ? t("community_meeting_card_policy_short_approve")
      : meeting.entry_policy === "invite_only"
        ? t("community_meeting_card_policy_short_invite")
        : meeting.entry_policy === "password"
          ? t("community_meeting_card_policy_short_password")
          : t("community_meeting_card_policy_short_open");

  const hostLabel =
    (hostDisplayName && hostDisplayName.trim()) ||
    (meeting.host_user_id ? meeting.host_user_id.slice(0, 8) : "—");

  const joinButton = (
    <MeetingJoinButton
      meetingId={meeting.id}
      chatRoomId={meeting.community_messenger_room_id}
      successSurface="meeting"
      entryPolicy={meeting.entry_policy}
      hasMeetingPassword={meeting.has_password}
      requiresApproval={meeting.requires_approval}
      isClosed={meeting.is_closed}
      memberCount={joined}
      maxMembers={meeting.max_members}
      pendingCount={meeting.pending_count}
      viewerStatus={viewerStatus ?? null}
      embedChrome={variant === "postEmbed"}
    />
  );

  if (variant === "postEmbed") {
    const descLine = meeting.description.replace(/\s+/g, " ").trim();
    return (
      <div className="rounded-ui-rect border-2 border-[#10a37f]/80 bg-sam-surface px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100/80 pb-2.5">
          <div className="flex min-w-0 items-center gap-1.5 sam-text-body-secondary font-semibold text-[#0d8f6a]">
            <LockIcon className="h-4 w-4 shrink-0 text-[#10a37f]" />
            <span>{policyHeadline}</span>
          </div>
          <Link
            href={philifeAppPaths.meeting(meeting.id)}
            className="shrink-0 sam-text-helper font-medium text-[#0d8f6a] underline underline-offset-2"
          >
            {t("community_meeting_detail_btn")}
          </Link>
        </div>
        <dl className="mt-3 space-y-2 sam-text-helper leading-snug text-sam-fg">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-sam-muted">{t("community_meeting_host")}</dt>
            <dd className="min-w-0 break-all text-sam-fg">{hostLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-sam-muted">{t("community_meeting_when")}</dt>
            <dd className="min-w-0 text-sam-fg">{when}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-sam-muted">{t("community_meeting_participants")}</dt>
            <dd className="min-w-0 text-sam-fg">
              {t("community_meeting_participants_ratio", { joined, max: meeting.max_members })}
              {pendingNote}
              {closedNote}
            </dd>
          </div>
          {descLine ? (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-medium text-sam-muted">{t("community_meeting_intro")}</dt>
              <dd className="min-w-0 text-sam-fg">{descLine}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-sam-muted">{t("community_meeting_join_policy")}</dt>
            <dd className="min-w-0 text-sam-fg">{joinMethod}</dd>
          </div>
        </dl>
        <div className="mt-4">{joinButton}</div>
        <p className="mt-2 text-center sam-text-xxs text-sam-muted">{t("community_meeting_detail_after_join")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="sam-text-body-secondary font-semibold text-emerald-900">{t("community_badge_meeting")}</p>
          <p className="mt-1 sam-text-body font-bold text-sam-fg">{meeting.title}</p>
        </div>
        <Link
          href={philifeAppPaths.meeting(meeting.id)}
          className="shrink-0 sam-text-helper font-medium text-emerald-800 underline"
        >
          {t("community_meeting_detail_btn")}
        </Link>
      </div>
      <p className="mt-2 sam-text-body-secondary text-emerald-900/90">
        <span className="font-medium">{t("community_meeting_when_inline")}</span> {when}
      </p>
      <p className="mt-2 sam-text-helper text-emerald-800/80">
        {t("community_meeting_participants")} {joined}/{meeting.max_members}
        {pendingNote}
        {closedNote}
      </p>
      <p className="mt-1 sam-text-helper text-emerald-900/80">
        {t("community_meeting_join_policy")} {joinMethod}
        {meeting.notice_count > 0 ? t("community_meeting_notice_count_inline", { count: meeting.notice_count }) : ""}
      </p>
      <div className="mt-3">{joinButton}</div>
    </div>
  );
}
