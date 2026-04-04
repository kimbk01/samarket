import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { isSameUserId, normalizeUserIdForCompare } from "@/lib/auth/same-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getMeetingDetail } from "@/lib/neighborhood/queries";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";

export type PhilifeMeetingViewerStatus =
  | "joined"
  | "pending"
  | "left"
  | "kicked"
  | "banned"
  | "rejected"
  | null;

export type PhilifeMeetingHubData = {
  meeting: NeighborhoodMeetingDetailDTO;
  viewerStatus: PhilifeMeetingViewerStatus;
  isJoined: boolean;
  isPending: boolean;
  isRestricted: boolean;
  hasLeft: boolean;
  hostUserIdForProps: string;
  myMembershipCreatedAt: string | null;
  activeOpenChatRoomCount: number;
  defaultOpenChatRoomId: string | null;
  viewerIsDefaultOpenChatMember: boolean;
  openChatRoomHasPassword: boolean;
  openChatRoomNeedsApprovalIntro: boolean;
  openChatAnyPassword: boolean;
  openChatAnyApproval: boolean;
};

export async function loadPhilifeMeetingHubData(
  meetingId: string
): Promise<PhilifeMeetingHubData | null> {
  const id = meetingId?.trim();
  if (!id) return null;

  const viewerId = await getOptionalAuthenticatedUserId();
  const meeting = await getMeetingDetail(id);
  if (!meeting) return null;

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

  const memberRows = (members ?? []) as {
    user_id: string;
    status?: string;
    status_reason?: string | null;
    role?: "host" | "co_host" | "member";
    attendance_status?: string | null;
    created_at?: string | null;
  }[];

  const joinedRows = memberRows.filter((r) => r.status === "joined");
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

  const hostUserIdForProps =
    viewerIsOrganizer && viewerId
      ? String(viewerId).trim()
      : String(meeting.host_user_id || meeting.created_by || postAuthorUserId || "").trim();

  let viewerStatusRaw =
    (myMembership as { status?: string } | null)?.status ?? null;

  const selfJoinedRow = viewerNorm
    ? joinedRows.find((r) => normalizeUserIdForCompare(r.user_id) === viewerNorm)
    : undefined;
  if (selfJoinedRow) {
    viewerStatusRaw = "joined";
  }

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
    }
  }

  const viewerStatus: PhilifeMeetingViewerStatus =
    viewerStatusRaw === "joined" ||
    viewerStatusRaw === "pending" ||
    viewerStatusRaw === "left" ||
    viewerStatusRaw === "kicked" ||
    viewerStatusRaw === "banned" ||
    viewerStatusRaw === "rejected"
      ? viewerStatusRaw
      : null;

  const isJoined = viewerStatus === "joined";
  const isPending = viewerStatus === "pending";
  const isRestricted = viewerStatus === "kicked" || viewerStatus === "banned";
  const hasLeft = viewerStatus === "left";

  const myMembershipCreatedAt =
    (myMembership as { created_at?: string | null } | null)?.created_at ?? null;

  return {
    meeting,
    viewerStatus,
    isJoined,
    isPending,
    isRestricted,
    hasLeft,
    hostUserIdForProps,
    myMembershipCreatedAt,
    activeOpenChatRoomCount: 0,
    defaultOpenChatRoomId: null,
    viewerIsDefaultOpenChatMember: false,
    openChatRoomHasPassword: false,
    openChatRoomNeedsApprovalIntro: false,
    openChatAnyPassword: false,
    openChatAnyApproval: false,
  };
}
