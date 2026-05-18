"use client";

import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MeetingJoinButton } from "./MeetingJoinButton";
import { MeetingStatusBadge } from "./MeetingStatusBadge";

export function MeetingDetail({ meeting }: { meeting: NeighborhoodMeetingDetailDTO }) {
  const { t } = useI18n();
  const joined = meeting.joined_count || meeting.member_count;
  const joinMethod =
    meeting.entry_policy === "approve"
      ? t("community_meeting_policy_approve")
      : meeting.entry_policy === "invite_only"
        ? t("community_meeting_policy_invite")
        : meeting.entry_policy === "password"
          ? t("community_meeting_policy_password")
          : t("community_meeting_policy_open");

  return (
    <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="sam-text-body-lg font-semibold text-sam-fg">{meeting.title}</h3>
        <MeetingStatusBadge status={meeting.status} />
      </div>
      <p className="mt-2 sam-text-body text-sam-muted">
        {meeting.description || t("community_meeting_no_intro")}
      </p>
      <p className="mt-2 sam-text-body-secondary text-sam-fg">
        {t("community_meeting_join_line", { joined, max: meeting.max_members })}
        {meeting.pending_count > 0
          ? t("community_meeting_pending_approval", { count: meeting.pending_count })
          : ""}
      </p>
      <p className="mt-1 sam-text-helper text-sam-muted">
        {t("community_meeting_join_policy_label")} {joinMethod}
        {meeting.notice_count > 0
          ? t("community_meeting_notice_count_inline", { count: meeting.notice_count })
          : ""}
      </p>
      <div className="mt-3">
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
        />
      </div>
    </div>
  );
}
