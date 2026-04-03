import { notFound, redirect } from "next/navigation";
import { MeetingJoinButton } from "@/components/community/MeetingJoinButton";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { MeetingOpenChatListClient } from "@/components/meeting-open-chat/MeetingOpenChatListClient";
import { MeetingPendingCard } from "@/components/meetings/MeetingPendingCard";
import { MeetingRestrictedCard } from "@/components/meetings/MeetingRestrictedCard";
import { loadMeetingOpenChatListInitialData } from "@/lib/meeting-open-chat/meeting-open-chat-list-initial-data";
import { loadPhilifeMeetingHubData } from "@/lib/neighborhood/philife-meeting-hub-load";
import { philifeAppPaths } from "@/lib/philife/paths";
import { APP_MAIN_GUTTER_NEG_X_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

interface Props {
  params: Promise<{ meetingId: string }>;
}

/** 모임 = 오픈채팅 — 참여/채팅의 기본 진입 URL */
export default async function MeetingOpenChatHubPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim() ?? "";
  if (!id) notFound();

  const hub = await loadPhilifeMeetingHubData(id);
  if (!hub) notFound();

  const {
    meeting,
    viewerStatus,
    isJoined,
    isPending,
    isRestricted,
    hasLeft,
    hostUserIdForProps,
    myMembershipCreatedAt,
    activeOpenChatRoomCount,
    defaultOpenChatRoomId,
    openChatRoomHasPassword,
    openChatRoomNeedsApprovalIntro,
  } = hub;

  const postBack = `/philife/${meeting.post_id}`;

  if (isJoined && activeOpenChatRoomCount === 1 && defaultOpenChatRoomId) {
    redirect(philifeAppPaths.meetingOpenChatRoom(meeting.id, defaultOpenChatRoomId));
  }

  const initialListData = isJoined ? await loadMeetingOpenChatListInitialData(meeting.id) : null;

  return (
    <div
      className={`${isJoined ? "flex min-h-[100dvh] flex-col" : "min-h-screen pb-28"} bg-[#f0f2f5]`}
    >
      <TradePrimaryColumnStickyAppBar
        title={meeting.title}
        backButtonProps={{ backHref: postBack, ariaLabel: "게시글로" }}
      />

      <div
        className={`${APP_MAIN_GUTTER_X_CLASS} ${
          isJoined ? `${APP_MAIN_GUTTER_NEG_X_CLASS} flex flex-1 flex-col min-h-0 pt-1` : "pt-3"
        }`}
      >
        {isPending && (
          <MeetingPendingCard
            meetingId={meeting.id}
            hostUserId={hostUserIdForProps}
            requestedAt={myMembershipCreatedAt}
          />
        )}

        {isRestricted && (
          <MeetingRestrictedCard reason={viewerStatus as "kicked" | "banned"} />
        )}

        {!isPending && !isRestricted && (!viewerStatus || hasLeft) && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {hasLeft && (
              <p className="mb-3 text-[13px] text-gray-500">
                모임을 나가셨습니다. 다시 참여할 수 있어요.
              </p>
            )}
            <MeetingJoinButton
              meetingId={meeting.id}
              chatRoomId={meeting.chat_room_id}
              successSurface="chat"
              entryPolicy={meeting.entry_policy}
              hasMeetingPassword={meeting.has_password}
              requiresApproval={meeting.requires_approval}
              isClosed={meeting.is_closed}
              memberCount={meeting.joined_count || meeting.member_count}
              maxMembers={meeting.max_members}
              pendingCount={meeting.pending_count}
              viewerStatus={viewerStatus}
              defaultOpenChatRoomId={defaultOpenChatRoomId}
              openChatRoomHasPassword={openChatRoomHasPassword}
              openChatRoomNeedsApprovalIntro={openChatRoomNeedsApprovalIntro}
            />
          </div>
        )}

        {isJoined && (
          <div className="flex min-h-0 flex-1 flex-col">
            <MeetingOpenChatListClient
              meetingId={meeting.id}
              variant="embedded"
              postBackHref={postBack}
              initialData={initialListData}
            />
          </div>
        )}
      </div>
    </div>
  );
}
