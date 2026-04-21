import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MeetingJoinButton } from "@/components/community/MeetingJoinButton";
import { AppTopHeader } from "@/components/app-shell";
import { MeetingPendingCard } from "@/components/meetings/MeetingPendingCard";
import { MeetingRestrictedCard } from "@/components/meetings/MeetingRestrictedCard";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { loadPhilifeMeetingHubData } from "@/lib/neighborhood/philife-meeting-hub-load";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

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
    <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
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
          <h1 className="sam-text-page-title font-bold leading-snug tracking-tight text-white drop-shadow-sm">
            {meeting.title}
          </h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded-full bg-sam-surface/20 px-2 py-0.5 sam-text-xxs font-semibold text-white backdrop-blur-sm">
              {entryLabel}
            </span>
            {!isOpen && statusLabel && (
              <span className="rounded-full bg-black/30 px-2 py-0.5 sam-text-xxs font-semibold text-white">
                {statusLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="divide-x divide-sam-border-soft flex">
        <div className="flex flex-1 flex-col items-center py-3">
          <span className="sam-text-page-title">👥</span>
          <span className="mt-1 sam-text-body-secondary font-bold text-sam-fg">
            {joinedCount}
            <span className="font-normal text-sam-meta">/{maxMembers}</span>
          </span>
          <span className="sam-text-xxs text-sam-meta">참여</span>
        </div>
        {meeting.tenure_type !== "long" &&
          meeting.meeting_date &&
          !Number.isNaN(Date.parse(meeting.meeting_date)) && (
            <div className="flex flex-1 flex-col items-center py-3 px-1">
              <span className="sam-text-page-title">📅</span>
              <span className="mt-1 text-center sam-text-body-secondary font-bold leading-tight text-sam-fg">
                {new Date(meeting.meeting_date).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="mt-0.5 text-center sam-text-xxs font-semibold tabular-nums text-sam-fg">
                {new Date(meeting.meeting_date).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className="sam-text-xxs text-sam-meta">일정</span>
            </div>
          )}
        {pendingCount > 0 && (
          <div className="flex flex-1 flex-col items-center py-3">
            <span className="sam-text-page-title">⏳</span>
            <span className="mt-1 sam-text-body-secondary font-bold text-amber-600">{pendingCount}</span>
            <span className="sam-text-xxs text-sam-meta">대기</span>
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
export default function PhilifeMeetingPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifeMeetingPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PhilifeMeetingPageBody({ params, searchParams }: Props) {
  const { meetingId } = await params;
  await searchParams;
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
    openChatAnyPassword,
    openChatAnyApproval,
    hostUserIdForProps,
    myMembershipCreatedAt,
  } = hub;

  return (
    <div className="min-h-screen bg-sam-app pb-28">
      <AppTopHeader
        title={meeting.title}
        backButtonProps={{ backHref: `/philife/${meeting.post_id}`, ariaLabel: "게시글로" }}
        shellVariant="flat"
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
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
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
