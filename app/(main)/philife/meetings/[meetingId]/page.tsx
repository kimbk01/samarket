import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { isSameUserId, normalizeUserIdForCompare } from "@/lib/auth/same-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getMeetingDetail } from "@/lib/neighborhood/queries";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { APP_MAIN_GUTTER_NEG_X_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { MeetingJoinButton } from "@/components/community/MeetingJoinButton";
import { MeetingPendingCard } from "@/components/meetings/MeetingPendingCard";
import { MeetingChatTab } from "@/components/meetings/MeetingChatTab";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";

interface Props {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ViewerStatus = "joined" | "pending" | "left" | "kicked" | "banned" | null;

/* ─────────────────────────────────────────────────────────────
   공개 정보 헤더 (미참여·대기 등)
───────────────────────────────────────────────────────────── */
function MeetingInfoCard({
  meeting,
  pendingCount = 0,
}: {
  meeting: NeighborhoodMeetingDetailDTO;
  pendingCount?: number;
}) {
  const entryLabel =
    meeting.entry_policy === "approve"
      ? "승인제"
      : meeting.entry_policy === "invite_only"
        ? "초대/승인제"
        : meeting.entry_policy === "password"
          ? "비밀번호"
          : "바로 참여";

  const isOpen = meeting.status === "open" && !meeting.is_closed;
  const statusLabel = !isOpen
    ? (meeting.status === "cancelled" ? "취소됨" : "마감")
    : null;

  const joinedCount = meeting.joined_count ?? meeting.member_count ?? 0;
  const maxMembers = meeting.max_members ?? 0;

  /* 커버 배경: 이미지 있으면 이미지, 없으면 그라디언트 */
  const hasCover = !!(meeting as { cover_image_url?: string }).cover_image_url;

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      {/* 커버 영역 */}
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
        {/* 반투명 그라디언트 오버레이 */}
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

      {/* 인포 바 */}
      <div className="divide-x divide-gray-100 flex">
        <div className="flex flex-1 flex-col items-center py-3">
          <span className="text-[20px]">👥</span>
          <span className="mt-1 text-[13px] font-bold text-gray-900">
            {joinedCount}<span className="font-normal text-gray-400">/{maxMembers}</span>
          </span>
          <span className="text-[10px] text-gray-400">참여</span>
        </div>
        {meeting.tenure_type !== "long" &&
        meeting.meeting_date &&
        !Number.isNaN(Date.parse(meeting.meeting_date)) && (
          <div className="flex flex-1 flex-col items-center py-3 px-1">
            <span className="text-[20px]">📅</span>
            <span className="mt-1 text-center text-[13px] font-bold leading-tight text-gray-900">
              {new Date(meeting.meeting_date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
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
        {meeting.location_text && (
          <div className="flex flex-1 flex-col items-center py-3 px-2">
            <span className="text-[20px]">📍</span>
            <span className="mt-1 line-clamp-1 text-center text-[13px] font-bold text-gray-900">
              {meeting.location_text}
            </span>
            <span className="text-[10px] text-gray-400">장소</span>
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

/* ─────────────────────────────────────────────────────────────
   비참여자 소개 카드
───────────────────────────────────────────────────────────── */
function MeetingDescriptionCard({ description }: { description: string }) {
  if (!description) return null;
  return (
    <div className="mt-3 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
      <h2 className="text-[14px] font-semibold text-gray-700">오픈채팅 소개</h2>
      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800">
        {description}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   강퇴/차단 메시지 카드
───────────────────────────────────────────────────────────── */
function MeetingRestrictedCard({ reason }: { reason: "kicked" | "banned" }) {
  return (
    <div className="mt-3 overflow-hidden rounded-3xl border border-red-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 bg-red-50 px-5 py-4">
        <span className="text-[24px]">🚫</span>
        <div>
          <p className="text-[15px] font-bold text-red-900">접근이 제한된 오픈채팅입니다</p>
          <p className="text-[12px] text-red-600">
            {reason === "kicked" ? "채팅방에서 강퇴되었습니다." : "이 오픈채팅에서 차단되었습니다."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   메인 페이지
───────────────────────────────────────────────────────────── */
export default async function PhilifeMeetingPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim();
  if (!id) notFound();

  const viewerId = await getOptionalAuthenticatedUserId();

  const meeting = await getMeetingDetail(id);
  if (!meeting) {
    notFound();
  }

  /* ─────────────────────────────────────────────────────────────
     DB 데이터
  ───────────────────────────────────────────────────────────── */
  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    sb = null;
  }

  const [{ data: members }, { data: myMembership }, { data: bans }, { data: postAuthorRow }] =
    await Promise.all([
      sb
        ? sb
            .from("meeting_members")
            .select("user_id, status, status_reason, created_at, role, attendance_status")
            .eq("meeting_id", id)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: null }),
      sb && viewerId
        ? sb
            .from("meeting_members")
            .select("status, role, created_at")
            .eq("meeting_id", id)
            .eq("user_id", viewerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        ? sb
            .from("meeting_member_bans")
            .select("user_id, reason")
            .eq("meeting_id", id)
            .is("released_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: null }),
      sb && meeting.post_id
        ? sb.from("community_posts").select("user_id").eq("id", meeting.post_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const rows = (members ?? []) as {
    user_id: string;
    status?: string;
    status_reason?: string | null;
    role?: "host" | "co_host" | "member";
    attendance_status?: string | null;
    created_at?: string | null;
  }[];

  const joinedRows = rows.filter((r) => r.status === "joined");
  const bannedRows = (bans ?? []) as { user_id: string; reason?: string | null }[];

  const postAuthorUserId = String(
    (postAuthorRow as { user_id?: string } | null)?.user_id ?? ""
  ).trim();

  const organizerIds = new Set<string>();
  for (const raw of [meeting.host_user_id, meeting.created_by, postAuthorUserId]) {
    const n = normalizeUserIdForCompare(raw);
    if (n) organizerIds.add(n);
  }
  const viewerNorm = normalizeUserIdForCompare(viewerId);
  const viewerIsOrganizer = viewerNorm.length > 0 && organizerIds.has(viewerNorm);

  /** 클라이언트 MeetingHostControls 의 isHost(me.id===createdBy) — DB created_by 가 글 작성자와 다를 때 보정 */
  const hostUserIdForProps =
    viewerIsOrganizer && viewerId
      ? String(viewerId).trim()
      : String(meeting.host_user_id || meeting.created_by || postAuthorUserId || "").trim();

  const uids = [
    ...new Set([...rows.map((r) => r.user_id), ...bannedRows.map((r) => r.user_id)]),
  ];
  const nickMap = sb
    ? await fetchNicknamesForUserIds(sb as never, uids)
    : new Map<string, string>();

  let viewerStatusRaw =
    (myMembership as { status?: string } | null)?.status ?? null;
  let viewerRole =
    (myMembership as { role?: "host" | "co_host" | "member" } | null)?.role ?? null;

  /** 멤버 목록에 joined 로 있으면 최우선 (중복 행·조회 불일치 시에도 모임장/멤버가 가입 요청 UI를 보지 않도록) */
  const selfJoinedRow = viewerNorm
    ? joinedRows.find((r) => normalizeUserIdForCompare(r.user_id) === viewerNorm)
    : undefined;
  if (selfJoinedRow) {
    viewerStatusRaw = "joined";
    viewerRole = selfJoinedRow.role ?? "member";
  }

  /**
   * 개설자 행이 meeting_members에 아직 없거나 조회 누락이어도 본인 모임에는 가입 요청 UI를 보이지 않음.
   * (나감/강퇴/차단은 그대로 둠)
   */
  const membershipStatus = (myMembership as { status?: string } | null)?.status;
  if (
    viewerIsOrganizer &&
    !bannedRows.some((b) => isSameUserId(b.user_id, viewerId))
  ) {
    if (
      membershipStatus !== "left" &&
      membershipStatus !== "kicked" &&
      membershipStatus !== "banned"
    ) {
      viewerStatusRaw = "joined";
      viewerRole = "host";
    }
  }

  const viewerStatus: ViewerStatus =
    viewerStatusRaw === "joined" ||
    viewerStatusRaw === "pending" ||
    viewerStatusRaw === "left" ||
    viewerStatusRaw === "kicked" ||
    viewerStatusRaw === "banned"
      ? viewerStatusRaw
      : null;
  const canManage =
    viewerNorm.length > 0 &&
    (viewerIsOrganizer || (viewerStatus === "joined" && viewerRole === "co_host"));

  const isJoined = viewerStatus === "joined";
  const isPending = viewerStatus === "pending";
  const isRestricted = viewerStatus === "kicked" || viewerStatus === "banned";
  const hasLeft = viewerStatus === "left";

  const joinedMembers = joinedRows.map((r) => ({
    userId: r.user_id,
    name: nickMap.get(r.user_id) ?? r.user_id.slice(0, 8),
    role: r.role ?? ("member" as const),
    status: "joined" as const,
    joinedAt: r.created_at ?? null,
  }));

  const myMembershipCreatedAt =
    (myMembership as { created_at?: string | null } | null)?.created_at ?? null;

  return (
    <div
      className={`${isJoined ? "flex min-h-[100dvh] flex-col" : "min-h-screen pb-28"} bg-[#f0f2f5]`}
    >
      <TradePrimaryColumnStickyAppBar
        title={meeting.title}
        backButtonProps={{ backHref: `/philife/${meeting.post_id}`, ariaLabel: "게시글로" }}
      />

      <div
        className={`${APP_MAIN_GUTTER_X_CLASS} ${isJoined ? `${APP_MAIN_GUTTER_NEG_X_CLASS} flex flex-1 flex-col min-h-0 pt-1` : "pt-3"}`}
      >
        {/* 공개 정보 헤더 — 비참여·대기·제한 시 */}
        {!isJoined ? <MeetingInfoCard meeting={meeting} pendingCount={meeting.pending_count} /> : null}

        {/* 비참여자 또는 나간 사람 */}
        {(!viewerStatus || hasLeft) && (
          <>
            <MeetingDescriptionCard description={meeting.description} />
            <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              {hasLeft && (
                <p className="mb-3 text-[13px] text-gray-500">
                  모임을 나가셨습니다. 다시 참여할 수 있어요.
                </p>
              )}
              <MeetingJoinButton
                meetingId={meeting.id}
                chatRoomId={meeting.chat_room_id}
                successSurface="meeting"
                entryPolicy={meeting.entry_policy}
                requiresApproval={meeting.requires_approval}
                isClosed={meeting.is_closed}
                memberCount={meeting.joined_count || meeting.member_count}
                maxMembers={meeting.max_members}
                pendingCount={meeting.pending_count}
                viewerStatus={viewerStatus}
              />
            </div>
          </>
        )}

        {/* 승인 대기 */}
        {isPending && (
          <MeetingPendingCard
            meetingId={meeting.id}
            hostUserId={hostUserIdForProps}
            requestedAt={myMembershipCreatedAt}
          />
        )}

        {/* 강퇴/차단 */}
        {isRestricted && (
          <MeetingRestrictedCard reason={viewerStatus as "kicked" | "banned"} />
        )}

        {/* 승인 완료 — 시스템 오픈채팅(필라이프 채팅) */}
        {isJoined && (
          <MeetingChatTab
            meetingId={meeting.id}
            chatRoomId={meeting.chat_room_id}
            viewerStatus="joined"
            isHost={canManage}
            joinedPickMembers={joinedMembers.map((m) => ({
              userId: m.userId,
              name: m.name,
            }))}
            embedMode="full"
          />
        )}
      </div>
    </div>
  );
}
