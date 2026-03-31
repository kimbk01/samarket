"use client";

import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { MeetingJoinButton } from "./MeetingJoinButton";
import { MeetingStatusBadge } from "./MeetingStatusBadge";

export function MeetingDetail({ meeting }: { meeting: NeighborhoodMeetingDetailDTO }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[16px] font-semibold text-gray-900">{meeting.title}</h3>
        <MeetingStatusBadge status={meeting.status} />
      </div>
      <p className="mt-2 text-[14px] text-gray-600">{meeting.description || "소개 없음"}</p>
      <p className="mt-2 text-[13px] text-gray-700">
        참여 {meeting.joined_count || meeting.member_count}/{meeting.max_members}명
        {meeting.pending_count > 0 ? ` · 승인 대기 ${meeting.pending_count}명` : ""}
      </p>
      <p className="mt-1 text-[12px] text-gray-500">
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
      <div className="mt-3">
        <MeetingJoinButton
          meetingId={meeting.id}
          chatRoomId={meeting.chat_room_id}
          successSurface="meeting"
          entryPolicy={meeting.entry_policy}
          hasMeetingPassword={meeting.has_password}
          requiresApproval={meeting.requires_approval}
          isClosed={meeting.is_closed}
          memberCount={meeting.joined_count || meeting.member_count}
          maxMembers={meeting.max_members}
          pendingCount={meeting.pending_count}
        />
      </div>
    </div>
  );
}
