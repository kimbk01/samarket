"use client";

import Link from "next/link";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { MeetingJoinButton } from "./MeetingJoinButton";
import { philifeAppPaths } from "@domain/philife/paths";

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

function entryPolicyHeadline(policy: NeighborhoodMeetingDetailDTO["entry_policy"]): string {
  if (policy === "approve") return "승인제 모임";
  if (policy === "invite_only") return "초대·승인제 모임";
  if (policy === "password") return "비밀번호 모임";
  return "바로 참여 모임";
}

function joinMethodLabel(policy: NeighborhoodMeetingDetailDTO["entry_policy"]): string {
  if (policy === "approve") return "승인 필요";
  if (policy === "invite_only") return "승인·초대 필요";
  if (policy === "password") return "비밀번호";
  return "바로 참여";
}

/** toLocaleString 대신 수동 포맷 — 서버/클라이언트 hydration 불일치 방지 */
function formatMeetingDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "일정 미정";
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
  const when =
    meeting.tenure_type === "long" ? "일정 미정" : formatMeetingDate(meeting.meeting_date);
  const joined = meeting.joined_count || meeting.member_count;
  const pendingNote =
    meeting.pending_count > 0 ? ` · 승인 대기 ${meeting.pending_count}명` : "";
  const closedNote = meeting.is_closed ? " · 마감" : "";

  const hostLabel =
    (hostDisplayName && hostDisplayName.trim()) ||
    (meeting.host_user_id ? meeting.host_user_id.slice(0, 8) : "—");

  const joinButton = (
    <MeetingJoinButton
      meetingId={meeting.id}
      chatRoomId={meeting.chat_room_id}
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
      <div className="rounded-[4px] border-2 border-[#10a37f]/80 bg-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100/80 pb-2.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[#0d8f6a]">
            <LockIcon className="h-4 w-4 shrink-0 text-[#10a37f]" />
            <span>{entryPolicyHeadline(meeting.entry_policy)}</span>
          </div>
          <Link
            href={philifeAppPaths.meeting(meeting.id)}
            className="shrink-0 text-[12px] font-medium text-[#0d8f6a] underline underline-offset-2"
          >
            자세히
          </Link>
        </div>
        <dl className="mt-3 space-y-2 text-[12px] leading-snug text-gray-800">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-gray-500">방장</dt>
            <dd className="min-w-0 break-all text-gray-900">{hostLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-gray-500">일시</dt>
            <dd className="min-w-0 text-gray-900">{when}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-gray-500">참여</dt>
            <dd className="min-w-0 text-gray-900">
              {joined}/{meeting.max_members}명{pendingNote}
              {closedNote}
            </dd>
          </div>
          {descLine ? (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-medium text-gray-500">소개</dt>
              <dd className="min-w-0 text-gray-900">{descLine}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-medium text-gray-500">참여방식</dt>
            <dd className="min-w-0 text-gray-900">{joinMethodLabel(meeting.entry_policy)}</dd>
          </div>
        </dl>
        <div className="mt-4">{joinButton}</div>
        <p className="mt-2 text-center text-[11px] text-gray-500">※ 모임 참여 후 상세 정보를 볼 수 있습니다</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-emerald-900">모임</p>
          <p className="mt-1 text-[15px] font-bold text-gray-900">{meeting.title}</p>
        </div>
        <Link
          href={philifeAppPaths.meeting(meeting.id)}
          className="shrink-0 text-[12px] font-medium text-emerald-800 underline"
        >
          자세히
        </Link>
      </div>
      <p className="mt-2 text-[13px] text-emerald-900/90">
        <span className="font-medium">일시</span> {when}
      </p>
      <p className="mt-2 text-[12px] text-emerald-800/80">
        참여 {joined}/{meeting.max_members}명{pendingNote}
        {closedNote}
      </p>
      <p className="mt-1 text-[12px] text-emerald-900/80">
        참여 방식{" "}
        {meeting.entry_policy === "approve"
          ? "승인제"
          : meeting.entry_policy === "invite_only"
            ? "초대/승인제"
            : meeting.entry_policy === "password"
              ? "비밀번호"
              : "바로 참여"}
        {meeting.notice_count > 0 ? ` · 공지 ${meeting.notice_count}개` : ""}
      </p>
      <div className="mt-3">{joinButton}</div>
    </div>
  );
}
