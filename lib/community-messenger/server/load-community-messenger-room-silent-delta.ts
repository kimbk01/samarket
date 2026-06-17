/**
 * `snapshotTier=silent_delta` — 방 메타 1행 + 내 참가자 1행만.
 * 메시지·프로필·presence·통화·trade·reactions·hides 조회 없음.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type {
  CommunityMessengerMessageType,
  CommunityMessengerRoomIdentityPolicy,
  CommunityMessengerRoomJoinPolicy,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
  CommunityMessengerRoomVisibility,
} from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  return t || "";
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRoomStatus(value: unknown): CommunityMessengerRoomStatus {
  return value === "blocked" || value === "archived" ? value : "active";
}

function normalizeRoomVisibility(value: unknown, roomType: CommunityMessengerRoomType): CommunityMessengerRoomVisibility {
  if (value === "public") return "public";
  return roomType === "open_group" ? "public" : "private";
}

function normalizeRoomJoinPolicy(value: unknown, roomType: CommunityMessengerRoomType): CommunityMessengerRoomJoinPolicy {
  if (value === "free") return "free";
  if (value === "password") return "password";
  return roomType === "open_group" ? "password" : "invite_only";
}

function normalizeRoomIdentityPolicy(
  value: unknown,
  roomType: CommunityMessengerRoomType
): CommunityMessengerRoomIdentityPolicy {
  if (value === "alias_allowed") return "alias_allowed";
  return roomType === "open_group" ? "alias_allowed" : "real_name";
}

function mapParticipantRole(role: unknown): "owner" | "admin" | "member" {
  const r = trimText(role);
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  return "member";
}

type SilentDeltaRoomRow = {
  id: string;
  room_type: CommunityMessengerRoomType;
  room_status?: CommunityMessengerRoomStatus | null;
  visibility?: CommunityMessengerRoomVisibility | null;
  join_policy?: CommunityMessengerRoomJoinPolicy | null;
  identity_policy?: CommunityMessengerRoomIdentityPolicy | null;
  is_readonly?: boolean | null;
  title: string | null;
  summary: string | null;
  avatar_url: string | null;
  created_by: string | null;
  owner_user_id?: string | null;
  member_limit?: number | null;
  is_discoverable?: boolean | null;
  allow_member_invite?: boolean | null;
  password_hash?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
  direct_key?: string | null;
};

type SilentDeltaParticipantRow = {
  unread_count: number | null;
  is_muted: boolean | null;
  is_pinned: boolean | null;
  is_archived?: boolean | null;
  role: string | null;
};

function buildSilentDeltaRoomSummary(
  viewerUserId: string,
  room: SilentDeltaRoomRow,
  me: SilentDeltaParticipantRow
): CommunityMessengerRoomSummary {
  const roomId = trimText(room.id);
  const roomType = room.room_type;
  const roomStatus = normalizeRoomStatus(room.room_status);
  const visibility = normalizeRoomVisibility(room.visibility, roomType);
  const joinPolicy = normalizeRoomJoinPolicy(room.join_policy, roomType);
  const identityPolicy = normalizeRoomIdentityPolicy(room.identity_policy, roomType);
  const isReadonly = room.is_readonly === true;
  const roomTitle = trimText(room.title);
  const roomSummary = trimText(room.summary);
  const contextMeta = parseCommunityMessengerRoomContextMeta(roomSummary);
  const roomAvatar = trimText(room.avatar_url) || null;
  const roomLastMessage = trimText(room.last_message);
  const roomLastMessageTypeRaw = trimText(room.last_message_type);
  const roomLastMessageType: CommunityMessengerMessageType =
    roomLastMessageTypeRaw === "image" ||
    roomLastMessageTypeRaw === "file" ||
    roomLastMessageTypeRaw === "system" ||
    roomLastMessageTypeRaw === "call_stub" ||
    roomLastMessageTypeRaw === "voice" ||
    roomLastMessageTypeRaw === "sticker" ||
    roomLastMessageTypeRaw === "community_post_share"
      ? roomLastMessageTypeRaw
      : "text";
  const roomLastAt = trimText(room.last_message_at) || nowIso();
  const ownerUserId = trimText(room.owner_user_id) || trimText(room.created_by) || null;
  const memberLimitRaw = room.member_limit;
  const memberLimit = typeof memberLimitRaw === "number" && Number.isFinite(memberLimitRaw) ? memberLimitRaw : null;
  const isDiscoverable = room.is_discoverable === true;
  const allowMemberInvite = room.allow_member_invite !== false;
  const requiresPassword = joinPolicy === "password" && trimText(room.password_hash).length > 0;
  const unreadCount = Math.max(0, Math.floor(Number(me.unread_count) || 0));
  const isMuted = me.is_muted === true;
  const isPinned = me.is_pinned === true;
  const isArchivedByViewer = me.is_archived === true;
  const messengerDirectKey = roomType === "direct" ? trimText(room.direct_key ?? "") || null : null;

  const effectiveMemberCount = roomType === "direct" ? 2 : 2;
  const title =
    roomType === "direct"
      ? roomTitle || "대화"
      : roomTitle || (roomType === "open_group" ? "공개 그룹방" : `그룹`);
  const subtitle =
    roomType === "direct"
      ? "친구와 나누는 대화"
      : roomType === "open_group"
        ? `공개 그룹`
        : `${effectiveMemberCount}명 참여 중`;

  return {
    id: roomId,
    roomType,
    roomStatus,
    visibility,
    joinPolicy,
    identityPolicy,
    isReadonly,
    title,
    subtitle,
    summary: roomSummary,
    avatarUrl: roomAvatar,
    unreadCount,
    isMuted,
    isPinned,
    lastMessage:
      roomLastMessage || (roomType === "direct" ? "메시지를 보내 보세요." : "그룹 대화를 시작해 보세요."),
    lastMessageType: roomLastMessageType,
    lastMessageAt: roomLastAt,
    memberCount: effectiveMemberCount,
    ownerUserId,
    ownerLabel: "-",
    memberLimit,
    isDiscoverable,
    requiresPassword,
    allowMemberInvite,
    peerUserId: roomType === "direct" ? null : null,
    isArchivedByViewer,
    messengerDirectKey,
    contextMeta: contextMeta ?? null,
  };
}

const ROOM_SELECT =
  "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, password_hash, last_message, last_message_at, last_message_type, direct_key";

const ME_SELECT = "unread_count, is_muted, is_pinned, is_archived, role";

export async function loadCommunityMessengerRoomSilentDeltaSnapshot(
  viewerUserId: string,
  roomId: string
): Promise<CommunityMessengerRoomSnapshot | null> {
  const uid = trimText(viewerUserId);
  const rid = trimText(roomId);
  if (!uid || !rid) return null;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  const [{ data: roomData, error: roomErr }, { data: meData, error: meErr }] = await Promise.all([
    sb.from("community_messenger_rooms").select(ROOM_SELECT).eq("id", rid).maybeSingle(),
    sb.from("community_messenger_participants").select(ME_SELECT).eq("room_id", rid).eq("user_id", uid).maybeSingle(),
  ]);

  if (roomErr || !roomData || meErr || !meData) return null;

  const room = roomData as SilentDeltaRoomRow;
  const me = meData as SilentDeltaParticipantRow;
  const summary = buildSilentDeltaRoomSummary(uid, room, me);
  const description =
    summary.roomType === "direct"
      ? "친구와 1:1로 대화하는 메신저 방"
      : summary.summary ||
        `${summary.memberCount}명이 함께 있는 ${summary.roomType === "open_group" ? "공개" : "비공개"} 그룹 채팅`;

  const snap: CommunityMessengerRoomSnapshot = {
    viewerUserId: uid,
    room: { ...summary, description },
    members: [],
    membersDeferred: true,
    messages: [],
    bootstrapInitialMessageLimit: 0,
    hasMoreOlderMessages: false,
    myRole: mapParticipantRole(me.role),
    activeCall: null,
  };

  return snap;
}
