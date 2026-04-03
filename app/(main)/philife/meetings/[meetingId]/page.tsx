import { notFound, redirect } from "next/navigation";
import { MeetingJoinButton } from "@/components/community/MeetingJoinButton";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { MeetingPendingCard } from "@/components/meetings/MeetingPendingCard";
import { MeetingRestrictedCard } from "@/components/meetings/MeetingRestrictedCard";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { loadPhilifeMeetingHubData } from "@/lib/neighborhood/philife-meeting-hub-load";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/* ─────────────────────────────────────────────────────────────
   공개 정보 헤더 (승인 대기·제한 시에만 이 URL에서 표시)
───────────────────────────────────────────────────────────── */
function MeetingInfoCard({
  meeting,
  pendingCount = 0,
  openChatAnyPassword = false,
  openChatAnyApproval = false,
}: {
  meeting: NeighborhoodMeetingDetailDTO;
  pendingCount?: number;
  openChatAnyPassword?: boolean;
  openChatAnyApproval?: boolean;
}) {
  const ocPwd = openChatAnyPassword;
  const ocAppr = openChatAnyApproval;
  const needPwd =
    meeting.entry_policy === "password" || meeting.has_password || ocPwd;
  const needAppr =
    meeting.entry_policy === "approve" ||
    meeting.entry_policy === "invite_only" ||
    meeting.requires_approval === true ||
    ocAppr;

  const entryLabel =
    needPwd && needAppr
      ? "비밀번호 · 승인"
      : needPwd
        ? "비밀번호"
        : meeting.entry_policy === "invite_only"
          ? "초대/승인제"
          : needAppr
            ? "승인제"
            : "바로 참여";

  const isOpen = meeting.status === "open" && !meeting.is_closed;
  const statusLabel = !isOpen ? (meeting.status === "cancelled" ? "취소됨" : "마감") : null;

  const joinedCount = meeting.joined_count ?? meeting.member_count ?? 0;
  const maxMembers = meeting.max_members ?? 0;

  const hasCover = !!(meeting as { cover_image_url?: string }).cover_image_url;

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div
        className={`relative flex h-28 items-end px-5 pb-4 ${
          hasCover
            ? "bg-cover bg-center"
            : "bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600"
        }`}
        style={
          hasCover
            ? { backgroundImage: `url(${(meeting as { cover_image_url?: string }).cover_image_url})` }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="relative z-10 min-w-0">
          <h1 className="text-[20px] font-bold leading-tight text-white drop-shadow-sm">
            {meeting.title}
          </h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              {entryLabel}
            </span>
            {!isOpen && statusLabel && (
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-semibold text-white">
                {statusLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="divide-x divide-gray-100 flex">
        <div className="flex flex-1 flex-col items-center py-3">
          <span className="text-[20px]">👥</span>
          <span className="mt-1 text-[13px] font-bold text-gray-900">
            {joinedCount}
            <span className="font-normal text-gray-400">/{maxMembers}</span>
          </span>
          <span className="text-[10px] text-gray-400">참여</span>
        </div>
        {meeting.tenure_type !== "long" &&
          meeting.meeting_date &&
          !Number.isNaN(Date.parse(meeting.meeting_date)) && (
            <div className="flex flex-1 flex-col items-center py-3 px-1">
              <span className="text-[20px]">📅</span>
              <span className="mt-1 text-center text-[13px] font-bold leading-tight text-gray-900">
                {new Date(meeting.meeting_date).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="mt-0.5 text-center text-[11px] font-semibold tabular-nums text-gray-700">
                {new Date(meeting.meeting_date).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className="text-[10px] text-gray-400">일정</span>
            </div>
          )}
        {pendingCount > 0 && (
          <div className="flex flex-1 flex-col items-center py-3">
            <span className="text-[20px]">⏳</span>
            <span className="mt-1 text-[13px] font-bold text-amber-600">{pendingCount}</span>
            <span className="text-[10px] text-gray-400">대기</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * `/philife/meetings/[id]` — 모임 단톡 직접 진입 전용.
 * - 참여자: 기본 방으로 즉시 보냄
 * - 미참여자: 여기서 참여/입장 CTA를 바로 보여줌
 */
export default async function PhilifeMeetingPage({ params, searchParams }: Props) {
  const { meetingId } = await params;
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const tab = typeof tabRaw === "string" ? tabRaw : Array.isArray(tabRaw) ? tabRaw[0] : undefined;
  const id = meetingId?.trim();
  if (!id) notFound();

  const hub = await loadPhilifeMeetingHubData(id);
  if (!hub) notFound();

  const {
    meeting,
    viewerStatus,
    isJoined,
    isPending,
    isRestricted,
    defaultOpenChatRoomId,
    viewerIsDefaultOpenChatMember,
    openChatAnyPassword,
    openChatAnyApproval,
    hostUserIdForProps,
    myMembershipCreatedAt,
  } = hub;

  if (tab === "chat" && isJoined) {
    redirect(
      defaultOpenChatRoomId
        ? philifeAppPaths.meetingOpenChatRoom(id, defaultOpenChatRoomId)
        : philifeAppPaths.meetingOpenChat(id)
    );
  }

  if (isJoined) {
    redirect(
      defaultOpenChatRoomId
        ? philifeAppPaths.meetingOpenChatRoom(id, defaultOpenChatRoomId)
        : philifeAppPaths.meetingOpenChat(id)
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] pb-28">
      <TradePrimaryColumnStickyAppBar
        title={meeting.title}
        backButtonProps={{ backHref: `/philife/${meeting.post_id}`, ariaLabel: "게시글로" }}
      />

      <div className={`${APP_MAIN_GUTTER_X_CLASS} pt-3`}>
        {!isJoined ? (
          <div className="space-y-3">
            <MeetingInfoCard
              meeting={meeting}
              pendingCount={meeting.pending_count}
              openChatAnyPassword={openChatAnyPassword}
              openChatAnyApproval={openChatAnyApproval}
            />
            {!isPending && !isRestricted ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
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
                  viewerStatus={viewerStatus}
                  defaultOpenChatRoomId={defaultOpenChatRoomId}
                  openChatRoomHasPassword={openChatAnyPassword}
                  openChatRoomNeedsApprovalIntro={openChatAnyApproval}
                />
              </div>
            ) : null}
          </div>
        ) : null}

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
      </div>
    </div>
  );
}
