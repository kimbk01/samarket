import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

type OpenChatRoomRow = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  visibility: "public" | "private";
  requires_approval: boolean;
  max_members: number;
  allow_search: boolean;
  invite_code: string | null;
  entry_question: string | null;
  status: "active" | "hidden" | "suspended" | "archived";
  owner_user_id: string;
  created_by: string;
  linked_chat_room_id: string;
  joined_count: number;
  pending_count: number;
  banned_count: number;
  notice_count: number;
  last_notice_at: string | null;
  created_at: string;
  updated_at: string;
};

type OpenChatMemberRow = {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  role: "owner" | "moderator" | "member";
  status: "joined" | "pending" | "left" | "kicked" | "rejected";
  requested_at: string | null;
  approved_at: string | null;
  joined_at: string | null;
  left_at: string | null;
  last_read_at: string | null;
  is_muted: boolean;
  is_message_blinded: boolean;
  message_blinded_at: string | null;
  message_blinded_by: string | null;
  message_blind_reason: string | null;
};

type OpenChatNoticeRow = {
  id: string;
  title: string;
  body: string;
  visibility: "members" | "public";
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
};

type OpenChatJoinRequestRow = {
  user_id: string;
  nickname: string;
  request_message: string;
  requested_at: string;
};

type OpenChatBanRow = {
  id: string;
  user_id: string;
  reason: string;
  created_at: string;
};

export type OpenChatListSort = "popular" | "latest";

export type OpenChatMembership = {
  nickname: string;
  role: "owner" | "moderator" | "member";
  status: "joined" | "pending" | "left" | "kicked" | "rejected";
  joinedAt: string | null;
  lastReadAt: string | null;
  isMuted: boolean;
};

export type OpenChatNotice = {
  id: string;
  title: string;
  body: string;
  visibility: "members" | "public";
  isPinned: boolean;
  createdAt: string;
};

export type OpenChatManageMember = {
  userId: string;
  nickname: string;
  role: "owner" | "moderator" | "member";
  status: "joined" | "pending" | "left" | "kicked" | "rejected";
  joinedAt: string | null;
  isMessageBlinded: boolean;
  messageBlindedAt: string | null;
  messageBlindReason: string | null;
};

export type OpenChatBlindedMember = {
  userId: string;
  nickname: string;
  role: "owner" | "moderator" | "member";
  blindedAt: string;
  blindReason: string;
};

export type OpenChatJoinRequestSummary = {
  userId: string;
  nickname: string;
  requestMessage: string;
  requestedAt: string;
};

export type OpenChatBanSummary = {
  id: string;
  userId: string;
  nickname: string;
  reason: string;
  createdAt: string;
};

export type OpenChatRoomSummary = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  visibility: "public" | "private";
  requiresApproval: boolean;
  maxMembers: number;
  allowSearch: boolean;
  inviteCode: string | null;
  entryQuestion: string | null;
  status: "active" | "hidden" | "suspended" | "archived";
  ownerUserId: string;
  createdBy: string;
  linkedChatRoomId: string;
  joinedCount: number;
  pendingCount: number;
  bannedCount: number;
  noticeCount: number;
  lastNoticeAt: string | null;
  createdAt: string;
  updatedAt: string;
  membership: OpenChatMembership | null;
};

export type OpenChatRoomDetail = OpenChatRoomSummary & {
  canManage: boolean;
  canAssignModerators: boolean;
  canJoin: boolean;
  activeNotice: OpenChatNotice | null;
  joinRequestStatus: "pending" | "approved" | "rejected" | "cancelled" | "expired" | null;
  isBanned: boolean;
  members?: OpenChatManageMember[];
  blindedMembers?: OpenChatBlindedMember[];
  pendingRequests?: OpenChatJoinRequestSummary[];
  bans?: OpenChatBanSummary[];
};

export type OpenChatErrorCode =
  | "not_found"
  | "forbidden"
  | "bad_request"
  | "already_joined"
  | "already_pending"
  | "banned"
  | "room_unavailable"
  | "owner_cannot_leave"
  | "db_error";

type OpenChatManagerRole = "owner" | "moderator" | "member" | "none";

const OPEN_CHAT_MEMBER_BLIND_REASON_PREFIX = "open_chat_member_blind:";

type OpenChatResult<T> = { ok: true; data: T } | { ok: false; error: OpenChatErrorCode; message?: string };

function trimText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeSort(value: unknown): OpenChatListSort {
  return value === "latest" ? "latest" : "popular";
}

function buildInviteCode() {
  return `oc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasInviteAccess(room: Pick<OpenChatRoomRow, "invite_code" | "status">, inviteCode?: string | null) {
  const code = trimText(inviteCode ?? "", 120);
  return room.status === "active" && !!room.invite_code && code.length > 0 && room.invite_code === code;
}

function mapMembership(row: OpenChatMemberRow | null): OpenChatMembership | null {
  if (!row) return null;
  return {
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    lastReadAt: row.last_read_at,
    isMuted: !!row.is_muted,
  };
}

function mapNotice(row: OpenChatNoticeRow | null): OpenChatNotice | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    isPinned: !!row.is_pinned,
    createdAt: row.created_at,
  };
}

function mapManageMember(row: OpenChatMemberRow): OpenChatManageMember {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    isMessageBlinded: row.is_message_blinded === true,
    messageBlindedAt: row.message_blinded_at,
    messageBlindReason: row.message_blind_reason ?? null,
  };
}

function mapBlindedMember(row: OpenChatMemberRow): OpenChatBlindedMember | null {
  if (row.is_message_blinded !== true || !row.message_blinded_at) return null;
  return {
    userId: row.user_id,
    nickname: row.nickname,
    role: row.role,
    blindedAt: row.message_blinded_at,
    blindReason: row.message_blind_reason ?? "",
  };
}

function mapJoinRequest(row: OpenChatJoinRequestRow): OpenChatJoinRequestSummary {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    requestMessage: row.request_message,
    requestedAt: row.requested_at,
  };
}

function mapBan(row: OpenChatBanRow, nicknameMap: Map<string, string>): OpenChatBanSummary {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: nicknameMap.get(row.user_id)?.trim() || row.user_id.slice(0, 8),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapRoomSummary(row: OpenChatRoomRow, membership: OpenChatMemberRow | null): OpenChatRoomSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    thumbnailUrl: row.thumbnail_url ?? null,
    visibility: row.visibility,
    requiresApproval: !!row.requires_approval,
    maxMembers: Number(row.max_members ?? 0),
    allowSearch: !!row.allow_search,
    inviteCode: row.invite_code ?? null,
    entryQuestion: row.entry_question ?? null,
    status: row.status,
    ownerUserId: row.owner_user_id,
    createdBy: row.created_by,
    linkedChatRoomId: row.linked_chat_room_id,
    joinedCount: Number(row.joined_count ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    bannedCount: Number(row.banned_count ?? 0),
    noticeCount: Number(row.notice_count ?? 0),
    lastNoticeAt: row.last_notice_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    membership: mapMembership(membership),
  };
}

async function resolveUserDisplayNickname(sb: SupabaseClient<any>, userId: string) {
  const { data: profile } = await sb.from("profiles").select("nickname, username").eq("id", userId).maybeSingle();
  const nick =
    (profile as { nickname?: string | null; username?: string | null } | null)?.nickname ??
    (profile as { nickname?: string | null; username?: string | null } | null)?.username ??
    "";
  if (typeof nick === "string" && nick.trim()) return nick.trim().slice(0, 24);

  const { data: testUser } = await sb
    .from("test_users")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();
  const testNick =
    (testUser as { display_name?: string | null; username?: string | null } | null)?.display_name ??
    (testUser as { display_name?: string | null; username?: string | null } | null)?.username ??
    "";
  if (typeof testNick === "string" && testNick.trim()) return testNick.trim().slice(0, 24);

  return userId.slice(0, 8);
}

async function getViewerMembership(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string,
): Promise<OpenChatMemberRow | null> {
  const { data } = await sb
    .from("open_chat_members")
    .select("id, room_id, user_id, nickname, role, status, requested_at, approved_at, joined_at, left_at, last_read_at, is_muted, is_message_blinded, message_blinded_at, message_blinded_by, message_blind_reason")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as OpenChatMemberRow | null) ?? null;
}

function getManagerRole(
  room: Pick<OpenChatRoomRow, "owner_user_id">,
  membership: OpenChatMemberRow | null,
  userId: string
): OpenChatManagerRole {
  if (room.owner_user_id === userId) return "owner";
  if (!membership?.id) return "none";
  if (membership.role === "owner") return "owner";
  if (membership.role === "moderator" && membership.status === "joined") return "moderator";
  return "member";
}

function canManageTarget(actorRole: OpenChatManagerRole, targetRole: OpenChatManagerRole): boolean {
  if (actorRole === "owner") return targetRole !== "owner" && targetRole !== "none";
  if (actorRole === "moderator") return targetRole === "member";
  return false;
}

function memberBlindReason(roomId: string, targetUserId: string, reason?: string | null): string {
  const note = trimText(reason ?? "", 400);
  return note
    ? `${OPEN_CHAT_MEMBER_BLIND_REASON_PREFIX}${roomId}:${targetUserId}:${note}`
    : `${OPEN_CHAT_MEMBER_BLIND_REASON_PREFIX}${roomId}:${targetUserId}`;
}

function isOpenChatBlindReasonForUser(hiddenReason: unknown, roomId: string, userId: string): boolean {
  if (typeof hiddenReason !== "string") return false;
  return hiddenReason.startsWith(`${OPEN_CHAT_MEMBER_BLIND_REASON_PREFIX}${roomId}:${userId}`);
}

async function getActiveNotice(
  sb: SupabaseClient<any>,
  roomId: string,
  allowMembersOnlyNotice: boolean,
): Promise<OpenChatNoticeRow | null> {
  let query = sb
    .from("open_chat_notices")
    .select("id, title, body, visibility, is_pinned, is_active, created_at")
    .eq("room_id", roomId)
    .eq("is_active", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!allowMembersOnlyNotice) {
    query = query.eq("visibility", "public");
  }

  const { data } = await query.maybeSingle();
  return (data as OpenChatNoticeRow | null) ?? null;
}

async function isUserBanned(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("open_chat_bans")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("released_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1)
    .maybeSingle();

  return !!(data as { id?: string } | null)?.id;
}

async function getPendingJoinRequestStatus(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string,
): Promise<OpenChatRoomDetail["joinRequestStatus"]> {
  const { data } = await sb
    .from("open_chat_join_requests")
    .select("status")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { status?: OpenChatRoomDetail["joinRequestStatus"] } | null)?.status ?? null) as OpenChatRoomDetail["joinRequestStatus"];
}

async function getManageCollections(
  sb: SupabaseClient<any>,
  roomId: string,
): Promise<{
  members: OpenChatManageMember[];
  blindedMembers: OpenChatBlindedMember[];
  pendingRequests: OpenChatJoinRequestSummary[];
  bans: OpenChatBanSummary[];
}> {
  const [{ data: memberRows }, { data: requestRows }, { data: banRows }] = await Promise.all([
    sb
      .from("open_chat_members")
      .select("id, room_id, user_id, nickname, role, status, requested_at, approved_at, joined_at, left_at, last_read_at, is_muted, is_message_blinded, message_blinded_at, message_blinded_by, message_blind_reason")
      .eq("room_id", roomId)
      .in("status", ["joined", "pending"])
      .order("joined_at", { ascending: true }),
    sb
      .from("open_chat_join_requests")
      .select("user_id, nickname, request_message, requested_at")
      .eq("room_id", roomId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),
    sb
      .from("open_chat_bans")
      .select("id, user_id, reason, created_at")
      .eq("room_id", roomId)
      .is("released_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const banUserIds = [...new Set(((banRows ?? []) as OpenChatBanRow[]).map((row) => row.user_id))];
  const { data: bannedMemberRows } = banUserIds.length
    ? await sb
        .from("open_chat_members")
        .select("user_id, nickname")
        .eq("room_id", roomId)
        .in("user_id", banUserIds)
    : { data: [] as Array<{ user_id: string; nickname: string }> };
  const nicknameMap = new Map(
    ((bannedMemberRows ?? []) as Array<{ user_id: string; nickname: string }>).map((row) => [row.user_id, row.nickname]),
  );

  return {
    members: ((memberRows ?? []) as OpenChatMemberRow[]).map(mapManageMember),
    blindedMembers: ((memberRows ?? []) as OpenChatMemberRow[])
      .map(mapBlindedMember)
      .filter((row): row is OpenChatBlindedMember => row != null)
      .sort((a, b) => (a.blindedAt < b.blindedAt ? 1 : -1)),
    pendingRequests: ((requestRows ?? []) as OpenChatJoinRequestRow[]).map(mapJoinRequest),
    bans: ((banRows ?? []) as OpenChatBanRow[]).map((row) => mapBan(row, nicknameMap)),
  };
}

async function getJoinedMemberList(
  sb: SupabaseClient<any>,
  roomId: string,
): Promise<OpenChatManageMember[]> {
  const { data } = await sb
    .from("open_chat_members")
    .select(
      "id, room_id, user_id, nickname, role, status, requested_at, approved_at, joined_at, left_at, last_read_at, is_muted, is_message_blinded, message_blinded_at, message_blinded_by, message_blind_reason",
    )
    .eq("room_id", roomId)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });

  return ((data ?? []) as OpenChatMemberRow[]).map(mapManageMember);
}

async function getManagedMemberActionContext(
  sb: SupabaseClient<any>,
  roomId: string,
  actorUserId: string,
  targetUserId: string
): Promise<
  | { ok: false; error: OpenChatErrorCode; message?: string }
  | {
      ok: true;
      detail: OpenChatRoomDetail;
      actorMembership: OpenChatMemberRow | null;
      targetMembership: OpenChatMemberRow | null;
      actorRole: OpenChatManagerRole;
      targetRole: OpenChatManagerRole;
    }
> {
  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const [actorMembership, targetMembership] = await Promise.all([
    getViewerMembership(sb, roomId, actorUserId),
    getViewerMembership(sb, roomId, targetUserId),
  ]);
  const roomRef = { owner_user_id: detail.data.ownerUserId };
  const actorRole = getManagerRole(roomRef, actorMembership, actorUserId);
  const targetRole = getManagerRole(roomRef, targetMembership, targetUserId);
  if (!canManageTarget(actorRole, targetRole)) {
    return { ok: false, error: "forbidden", message: "cannot_manage_target" };
  }

  return {
    ok: true,
    detail: detail.data,
    actorMembership,
    targetMembership,
    actorRole,
    targetRole,
  };
}

export async function listOpenChatRooms(
  sb: SupabaseClient<any>,
  viewerUserId: string,
  opts?: {
    query?: string;
    sort?: OpenChatListSort;
    limit?: number;
    mineOnly?: boolean;
  },
): Promise<OpenChatRoomSummary[]> {
  const query = trimText(opts?.query, 100);
  const sort = normalizeSort(opts?.sort);
  const limit = Math.min(Math.max(Number(opts?.limit ?? 20) || 20, 1), 50);
  const mineOnly = opts?.mineOnly === true;

  const { data: membershipRows, error: memberListError } = await sb
    .from("open_chat_members")
    .select("id, room_id, user_id, nickname, role, status, requested_at, approved_at, joined_at, left_at, last_read_at, is_muted")
    .eq("user_id", viewerUserId.trim())
    .in("status", ["joined", "pending"]);

  if (memberListError) {
    throw new Error(`open_chat_members list: ${memberListError.message}`);
  }

  const membershipMap = new Map<string, OpenChatMemberRow>();
  const myRoomIds: string[] = [];
  const seenRoom = new Set<string>();
  for (const row of (membershipRows ?? []) as OpenChatMemberRow[]) {
    const rid = typeof row.room_id === "string" ? row.room_id.trim() : "";
    if (!rid || seenRoom.has(rid)) continue;
    seenRoom.add(rid);
    membershipMap.set(rid, row);
    myRoomIds.push(rid);
  }

  let roomQuery = sb
    .from("open_chat_rooms")
    .select(
      "id, title, description, thumbnail_url, visibility, requires_approval, max_members, allow_search, invite_code, entry_question, status, owner_user_id, created_by, linked_chat_room_id, joined_count, pending_count, banned_count, notice_count, last_notice_at, created_at, updated_at",
    );

  if (mineOnly) {
    if (!myRoomIds.length) return [];
    roomQuery = roomQuery.in("id", myRoomIds);
  } else {
    roomQuery = roomQuery.eq("status", "active").eq("visibility", "public");
    /** 브라우징(검색어 없음): 공개 활성 방 전부. 검색어 있을 때만 검색 비노출 방 제외. */
    if (query) {
      roomQuery = roomQuery.eq("allow_search", true);
    }
  }

  /** 내 방 목록은 검색어와 무관하게 전부 표시. 탐색만 q로 제목·소개 필터. */
  if (query && !mineOnly) {
    roomQuery = roomQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  }

  roomQuery =
    sort === "latest"
      ? roomQuery.order("created_at", { ascending: false })
      : roomQuery.order("joined_count", { ascending: false }).order("created_at", { ascending: false });

  const { data: rows } = await roomQuery.limit(limit);
  const roomRows = ((rows ?? []) as OpenChatRoomRow[]).filter(Boolean);

  return roomRows.map((row) => mapRoomSummary(row, membershipMap.get(row.id) ?? null));
}

export async function getOpenChatRoomDetail(
  sb: SupabaseClient<any>,
  roomId: string,
  viewerUserId: string,
  opts?: {
    inviteCode?: string | null;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const { data: roomData } = await sb
    .from("open_chat_rooms")
    .select(
      "id, title, description, thumbnail_url, visibility, requires_approval, max_members, allow_search, invite_code, entry_question, status, owner_user_id, created_by, linked_chat_room_id, joined_count, pending_count, banned_count, notice_count, last_notice_at, created_at, updated_at",
    )
    .eq("id", roomId)
    .maybeSingle();

  const room = (roomData as OpenChatRoomRow | null) ?? null;
  if (!room) return { ok: false, error: "not_found" };

  const membership = await getViewerMembership(sb, roomId, viewerUserId);
  const managerRole = getManagerRole(room, membership, viewerUserId);
  const canManage = managerRole === "owner" || managerRole === "moderator";
  const canAssignModerators = managerRole === "owner";
  const joined = membership?.status === "joined";
  const joinRequestStatus = await getPendingJoinRequestStatus(sb, roomId, viewerUserId);
  const isBanned = await isUserBanned(sb, roomId, viewerUserId);
  const inviteAccess = hasInviteAccess(room, opts?.inviteCode);

  const canView =
    canManage ||
    joined ||
    inviteAccess ||
    (room.status === "active" && room.visibility === "public") ||
    joinRequestStatus === "pending";

  if (!canView) {
    return { ok: false, error: "forbidden" };
  }

  const [activeNotice, joinedMembers, manageCollections] = await Promise.all([
    getActiveNotice(sb, roomId, canManage || joined),
    joined && !canManage ? getJoinedMemberList(sb, roomId) : Promise.resolve(null),
    canManage ? getManageCollections(sb, roomId) : Promise.resolve(null),
  ]);
  const summary = mapRoomSummary(room, membership);

  return {
    ok: true,
    data: {
      ...summary,
      canManage,
      canAssignModerators,
      canJoin:
        room.status === "active" &&
        !joined &&
        !isBanned &&
        (room.visibility === "public" || inviteAccess || joinRequestStatus === "pending"),
      activeNotice: mapNotice(activeNotice),
      joinRequestStatus,
      isBanned,
      ...(joined ? { members: canManage ? (manageCollections?.members ?? []) : (joinedMembers ?? []) } : {}),
      ...(canManage
        ? {
            blindedMembers: manageCollections?.blindedMembers ?? [],
            pendingRequests: manageCollections?.pendingRequests ?? [],
            bans: manageCollections?.bans ?? [],
          }
        : {}),
    },
  };
}

export async function createOpenChatRoom(
  sb: SupabaseClient<any>,
  input: {
    creatorUserId: string;
    title: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    visibility?: "public" | "private";
    requiresApproval?: boolean;
    maxMembers?: number;
    allowSearch?: boolean;
    entryQuestion?: string | null;
    ownerNickname?: string | null;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const creatorUserId = input.creatorUserId.trim();
  const title = trimText(input.title, 80);
  const description = trimText(input.description ?? "", 1000);
  const thumbnailUrl = trimText(input.thumbnailUrl ?? "", 1000) || null;
  const visibility = input.visibility === "private" ? "private" : "public";
  const requiresApproval = input.requiresApproval === true;
  const maxMembers = Math.min(Math.max(Number(input.maxMembers ?? 300) || 300, 2), 2000);
  const allowSearch = visibility === "public" ? input.allowSearch !== false : false;
  const entryQuestion = trimText(input.entryQuestion ?? "", 500) || null;
  const ownerNickname = trimText(input.ownerNickname ?? "", 24) || (await resolveUserDisplayNickname(sb, creatorUserId));

  if (!creatorUserId || !title || !ownerNickname) {
    return { ok: false, error: "bad_request", message: "title_or_owner_required" };
  }

  const preview = `${title.slice(0, 36)} · 오픈채팅`;
  const now = new Date().toISOString();

  const { data: chatRoomData, error: chatRoomError } = await sb
    .from("chat_rooms")
    .insert({
      room_type: "general_chat",
      context_type: "etc",
      initiator_id: creatorUserId,
      peer_id: creatorUserId,
      request_status: "approved",
      participants_count: 1,
      last_message_preview: preview,
    })
    .select("id")
    .single();

  const linkedChatRoomId =
    (chatRoomData as { id?: string } | null)?.id && typeof (chatRoomData as { id?: string }).id === "string"
      ? String((chatRoomData as { id: string }).id)
      : null;

  if (chatRoomError || !linkedChatRoomId) {
    return { ok: false, error: "db_error", message: chatRoomError?.message };
  }

  const { error: participantError } = await sb.from("chat_room_participants").insert({
    room_id: linkedChatRoomId,
    user_id: creatorUserId,
    role_in_room: "member",
    is_active: true,
    hidden: false,
    joined_at: now,
    unread_count: 0,
  });

  if (participantError) {
    await sb.from("chat_rooms").delete().eq("id", linkedChatRoomId);
    return { ok: false, error: "db_error", message: participantError.message };
  }

  const { data: roomData, error: roomError } = await sb
    .from("open_chat_rooms")
    .insert({
      title,
      description,
      thumbnail_url: thumbnailUrl,
      visibility,
      requires_approval: requiresApproval,
      max_members: maxMembers,
      allow_search: allowSearch,
      invite_code: buildInviteCode(),
      entry_question: entryQuestion,
      status: "active",
      owner_user_id: creatorUserId,
      created_by: creatorUserId,
      linked_chat_room_id: linkedChatRoomId,
    })
    .select("id")
    .single();

  const roomId =
    (roomData as { id?: string } | null)?.id && typeof (roomData as { id?: string }).id === "string"
      ? String((roomData as { id: string }).id)
      : null;

  if (roomError || !roomId) {
    await sb.from("chat_room_participants").delete().eq("room_id", linkedChatRoomId);
    await sb.from("chat_rooms").delete().eq("id", linkedChatRoomId);
    return { ok: false, error: "db_error", message: roomError?.message };
  }

  const { error: roomBackfillError } = await sb
    .from("chat_rooms")
    .update({ related_group_id: roomId })
    .eq("id", linkedChatRoomId);

  if (roomBackfillError) {
    await sb.from("open_chat_rooms").delete().eq("id", roomId);
    await sb.from("chat_room_participants").delete().eq("room_id", linkedChatRoomId);
    await sb.from("chat_rooms").delete().eq("id", linkedChatRoomId);
    return { ok: false, error: "db_error", message: roomBackfillError.message };
  }

  const { error: memberError } = await sb.from("open_chat_members").insert({
    room_id: roomId,
    user_id: creatorUserId,
    nickname: ownerNickname,
    role: "owner",
    status: "joined",
    requested_at: now,
    approved_at: now,
    approved_by: creatorUserId,
    joined_at: now,
  });

  if (memberError) {
    await sb.from("open_chat_rooms").delete().eq("id", roomId);
    await sb.from("chat_room_participants").delete().eq("room_id", linkedChatRoomId);
    await sb.from("chat_rooms").delete().eq("id", linkedChatRoomId);
    return { ok: false, error: "db_error", message: memberError.message };
  }

  await sb.from("chat_messages").insert({
    room_id: linkedChatRoomId,
    sender_id: null,
    message_type: "system",
    body: "오픈채팅방이 생성되었습니다.",
  });

  const detail = await getOpenChatRoomDetail(sb, roomId, creatorUserId);
  if (!detail.ok) return detail;
  return { ok: true, data: detail.data };
}

export async function updateOpenChatRoom(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    title?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    visibility?: "public" | "private";
    requiresApproval?: boolean;
    maxMembers?: number;
    allowSearch?: boolean;
    entryQuestion?: string | null;
    status?: "active" | "hidden" | "suspended" | "archived";
    regenerateInviteCode?: boolean;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  if (!roomId || !actorUserId) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const patch: Record<string, unknown> = {};
  if (input.title != null) {
    const title = trimText(input.title, 80);
    if (!title) return { ok: false, error: "bad_request", message: "title_required" };
    patch.title = title;
  }
  if (input.description !== undefined) patch.description = trimText(input.description ?? "", 1000);
  if (input.thumbnailUrl !== undefined) patch.thumbnail_url = trimText(input.thumbnailUrl ?? "", 1000) || null;
  if (input.visibility != null) patch.visibility = input.visibility === "private" ? "private" : "public";
  if (typeof input.requiresApproval === "boolean") patch.requires_approval = input.requiresApproval;
  if (input.maxMembers != null) {
    const maxMembers = Math.min(Math.max(Number(input.maxMembers) || 0, 2), 2000);
    if (maxMembers < detail.data.joinedCount) {
      return { ok: false, error: "bad_request", message: "max_members_too_small" };
    }
    patch.max_members = maxMembers;
  }
  if (typeof input.allowSearch === "boolean") {
    const nextVisibility = (patch.visibility as "public" | "private" | undefined) ?? detail.data.visibility;
    patch.allow_search = nextVisibility === "public" ? input.allowSearch : false;
  }
  if (input.entryQuestion !== undefined) patch.entry_question = trimText(input.entryQuestion ?? "", 500) || null;
  if (input.status != null) patch.status = input.status;
  if (input.regenerateInviteCode === true) patch.invite_code = buildInviteCode();

  if (!Object.keys(patch).length) return { ok: false, error: "bad_request", message: "empty_patch" };

  const { error } = await sb.from("open_chat_rooms").update(patch).eq("id", roomId);
  if (error) return { ok: false, error: "db_error", message: error.message };

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function joinOpenChatRoom(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    userId: string;
    nickname?: string | null;
    requestMessage?: string | null;
    inviteCode?: string | null;
  },
): Promise<OpenChatResult<{ room: OpenChatRoomDetail; pending: boolean; already: boolean }>> {
  const roomId = input.roomId.trim();
  const userId = input.userId.trim();
  if (!roomId || !userId) return { ok: false, error: "bad_request" };

  const { data: roomData } = await sb
    .from("open_chat_rooms")
    .select(
      "id, title, description, thumbnail_url, visibility, requires_approval, max_members, allow_search, invite_code, entry_question, status, owner_user_id, created_by, linked_chat_room_id, joined_count, pending_count, banned_count, notice_count, last_notice_at, created_at, updated_at",
    )
    .eq("id", roomId)
    .maybeSingle();
  const room = (roomData as OpenChatRoomRow | null) ?? null;
  if (!room) return { ok: false, error: "not_found" };
  if (room.status !== "active") return { ok: false, error: "room_unavailable" };

  const isBanned = await isUserBanned(sb, roomId, userId);
  if (isBanned) return { ok: false, error: "banned" };
  const inviteAccess = hasInviteAccess(room, input.inviteCode);

  const existingMembership = await getViewerMembership(sb, roomId, userId);
  if (existingMembership?.status === "joined") {
    const detail = await getOpenChatRoomDetail(sb, roomId, userId, { inviteCode: input.inviteCode });
    if (!detail.ok) return detail;
    return { ok: true, data: { room: detail.data, pending: false, already: true } };
  }

  const nickname = trimText(input.nickname ?? "", 24) || (await resolveUserDisplayNickname(sb, userId));
  const requestMessage = trimText(input.requestMessage ?? "", 1000);
  const now = new Date().toISOString();
  if (room.visibility === "private" && !inviteAccess) {
    return { ok: false, error: "forbidden", message: "invite_code_required" };
  }
  const needsApproval = room.requires_approval === true;

  if (needsApproval) {
    if (existingMembership?.id) {
      const { error } = await sb
        .from("open_chat_members")
        .update({
          nickname,
          status: "pending",
          requested_at: now,
          approved_at: null,
          approved_by: null,
          rejected_at: null,
          rejected_by: null,
          kicked_at: null,
          kicked_by: null,
          left_at: null,
          status_reason: null,
        })
        .eq("id", existingMembership.id);
      if (error) return { ok: false, error: "db_error", message: error.message };
    } else {
      const { error } = await sb.from("open_chat_members").insert({
        room_id: roomId,
        user_id: userId,
        nickname,
        role: "member",
        status: "pending",
        requested_at: now,
      });
      if (error) return { ok: false, error: "db_error", message: error.message };
    }

    const { data: pendingRequest } = await sb
      .from("open_chat_join_requests")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if ((pendingRequest as { id?: string } | null)?.id) {
      const { error } = await sb
        .from("open_chat_join_requests")
        .update({ nickname, request_message: requestMessage, requested_at: now })
        .eq("id", String((pendingRequest as { id: string }).id));
      if (error) return { ok: false, error: "db_error", message: error.message };
    } else {
      const { error } = await sb.from("open_chat_join_requests").insert({
        room_id: roomId,
        user_id: userId,
        nickname,
        request_message: requestMessage,
        status: "pending",
        requested_at: now,
      });
      if (error) return { ok: false, error: "db_error", message: error.message };
    }

    if (room.owner_user_id && room.owner_user_id !== userId) {
      void appendUserNotification(sb, {
        user_id: room.owner_user_id,
        notification_type: "status",
        title: `${room.title} 가입 요청`,
        body: requestMessage || "새 오픈채팅 가입 요청이 도착했습니다.",
        link_url: `/philife/open-chat/${roomId}`,
      });
    }

    const detail = await getOpenChatRoomDetail(sb, roomId, userId, { inviteCode: input.inviteCode });
    if (!detail.ok) return detail;
    return { ok: true, data: { room: detail.data, pending: true, already: existingMembership?.status === "pending" } };
  }

  if (existingMembership?.id) {
    const { error } = await sb
      .from("open_chat_members")
      .update({
        nickname,
        status: "joined",
        approved_at: now,
        approved_by: userId,
        joined_at: now,
        left_at: null,
        rejected_at: null,
        rejected_by: null,
        kicked_at: null,
        kicked_by: null,
        status_reason: "self_joined",
      })
      .eq("id", existingMembership.id);
    if (error) return { ok: false, error: "db_error", message: error.message };
  } else {
    const { error } = await sb.from("open_chat_members").insert({
      room_id: roomId,
      user_id: userId,
      nickname,
      role: "member",
      status: "joined",
      requested_at: now,
      approved_at: now,
      approved_by: userId,
      joined_at: now,
    });
    if (error) return { ok: false, error: "db_error", message: error.message };
  }

  await sb
    .from("open_chat_join_requests")
    .update({
      status: "approved",
      reviewed_at: now,
      reviewed_by: userId,
      review_reason: "self_joined",
    })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("status", "pending");

  await sb.from("chat_messages").insert({
    room_id: room.linked_chat_room_id,
    sender_id: null,
    message_type: "system",
    body: `${nickname}님이 입장했습니다.`,
  });

  const detail = await getOpenChatRoomDetail(sb, roomId, userId, { inviteCode: input.inviteCode });
  if (!detail.ok) return detail;
  return { ok: true, data: { room: detail.data, pending: false, already: false } };
}

export async function leaveOpenChatRoom(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    userId: string;
  },
): Promise<OpenChatResult<{ roomId: string }>> {
  const roomId = input.roomId.trim();
  const userId = input.userId.trim();
  if (!roomId || !userId) return { ok: false, error: "bad_request" };

  const { data: roomData } = await sb
    .from("open_chat_rooms")
    .select("id, linked_chat_room_id")
    .eq("id", roomId)
    .maybeSingle();
  const room = (roomData as { id?: string; linked_chat_room_id?: string | null } | null) ?? null;
  if (!room?.id) return { ok: false, error: "not_found" };

  const membership = await getViewerMembership(sb, roomId, userId);
  if (!membership || membership.status !== "joined") {
    return { ok: false, error: "not_found", message: "membership_not_found" };
  }
  if (membership.role === "owner") {
    return { ok: false, error: "owner_cannot_leave" };
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("open_chat_members")
    .update({
      status: "left",
      left_at: now,
      status_reason: "self_left",
    })
    .eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (room.linked_chat_room_id) {
    await sb
      .from("chat_room_participants")
      .update({ hidden: true, left_at: now, is_active: false })
      .eq("room_id", String(room.linked_chat_room_id))
      .eq("user_id", userId);

    await sb.from("chat_messages").insert({
      room_id: String(room.linked_chat_room_id),
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님이 나갔습니다.`,
    });
  }

  return { ok: true, data: { roomId } };
}

export async function updateOpenChatNickname(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    userId: string;
    nickname: string;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const userId = input.userId.trim();
  const nickname = trimText(input.nickname, 24);
  if (!roomId || !userId || !nickname) return { ok: false, error: "bad_request", message: "nickname_required" };

  const membership = await getViewerMembership(sb, roomId, userId);
  if (!membership || !["joined", "pending"].includes(membership.status)) {
    return { ok: false, error: "forbidden" };
  }

  const { error } = await sb.from("open_chat_members").update({ nickname }).eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  return getOpenChatRoomDetail(sb, roomId, userId);
}

export async function approveOpenChatJoinRequest(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  if (!roomId || !actorUserId || !targetUserId) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const membership = await getViewerMembership(sb, roomId, targetUserId);
  if (!membership?.id || membership.status !== "pending") {
    return { ok: false, error: "not_found", message: "pending_member_not_found" };
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("open_chat_members")
    .update({
      status: "joined",
      approved_at: now,
      approved_by: actorUserId,
      joined_at: now,
      status_reason: "manager_approved",
    })
    .eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  await sb
    .from("open_chat_join_requests")
    .update({
      status: "approved",
      reviewed_at: now,
      reviewed_by: actorUserId,
      review_reason: "manager_approved",
    })
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .eq("status", "pending");

  if (detail.data.linkedChatRoomId) {
    await sb.from("chat_messages").insert({
      room_id: detail.data.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님이 참여 승인되었습니다.`,
    });
  }

  void appendUserNotification(sb, {
    user_id: targetUserId,
    notification_type: "status",
    title: `${detail.data.title} 참여가 승인되었습니다`,
    body: "이제 오픈채팅에 입장할 수 있습니다.",
    link_url: `/philife/open-chat/${roomId}`,
  });

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function rejectOpenChatJoinRequest(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  if (!roomId || !actorUserId || !targetUserId) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const membership = await getViewerMembership(sb, roomId, targetUserId);
  if (!membership?.id || membership.status !== "pending") {
    return { ok: false, error: "not_found", message: "pending_member_not_found" };
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("open_chat_members")
    .update({
      status: "rejected",
      rejected_at: now,
      rejected_by: actorUserId,
      status_reason: "manager_rejected",
    })
    .eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  await sb
    .from("open_chat_join_requests")
    .update({
      status: "rejected",
      reviewed_at: now,
      reviewed_by: actorUserId,
      review_reason: "manager_rejected",
    })
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .eq("status", "pending");

  void appendUserNotification(sb, {
    user_id: targetUserId,
    notification_type: "status",
    title: `${detail.data.title} 참여 요청이 거절되었습니다`,
    body: "다른 방을 둘러보거나 다시 신청해 보세요.",
    link_url: "/philife/open-chat",
  });

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function createOpenChatNotice(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    title?: string;
    body?: string;
    visibility?: "members" | "public";
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const title = trimText(input.title ?? "", 120);
  const body = trimText(input.body ?? "", 2000);
  const visibility = input.visibility === "public" ? "public" : "members";
  if (!roomId || !actorUserId || (!title && !body)) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const { error } = await sb.from("open_chat_notices").insert({
    room_id: roomId,
    author_user_id: actorUserId,
    title,
    body,
    visibility,
    is_pinned: true,
    is_active: true,
  });
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (detail.data.linkedChatRoomId) {
    await sb.from("chat_messages").insert({
      room_id: detail.data.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: title ? `새 공지: ${title}` : "새 공지가 등록되었습니다.",
    });
  }

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function updateOpenChatNotice(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    noticeId: string;
    title?: string;
    body?: string;
    visibility?: "members" | "public";
    isPinned?: boolean;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const noticeId = input.noticeId.trim();
  if (!roomId || !actorUserId || !noticeId) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = trimText(input.title ?? "", 120);
  if (input.body !== undefined) patch.body = trimText(input.body ?? "", 2000);
  if (input.visibility !== undefined) patch.visibility = input.visibility === "public" ? "public" : "members";
  if (typeof input.isPinned === "boolean") patch.is_pinned = input.isPinned;
  if (!Object.keys(patch).length) return { ok: false, error: "bad_request", message: "empty_patch" };

  const { error } = await sb
    .from("open_chat_notices")
    .update(patch)
    .eq("room_id", roomId)
    .eq("id", noticeId)
    .eq("is_active", true);
  if (error) return { ok: false, error: "db_error", message: error.message };

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function deleteOpenChatNotice(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    noticeId: string;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const noticeId = input.noticeId.trim();
  if (!roomId || !actorUserId || !noticeId) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const { error } = await sb
    .from("open_chat_notices")
    .update({ is_active: false })
    .eq("room_id", roomId)
    .eq("id", noticeId)
    .eq("is_active", true);
  if (error) return { ok: false, error: "db_error", message: error.message };

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function kickOpenChatMember(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
    reason?: string | null;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  const reason = trimText(input.reason ?? "", 500);
  if (!roomId || !actorUserId || !targetUserId || targetUserId === actorUserId) {
    return { ok: false, error: "bad_request" };
  }

  const ctx = await getManagedMemberActionContext(sb, roomId, actorUserId, targetUserId);
  if (!ctx.ok) return ctx;

  const membership = ctx.targetMembership;
  if (!membership?.id || membership.status !== "joined") {
    return { ok: false, error: "not_found", message: "joined_member_not_found" };
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("open_chat_members")
    .update({
      status: "kicked",
      kicked_at: now,
      kicked_by: actorUserId,
      status_reason: reason || "manager_kicked",
      is_message_blinded: false,
      message_blinded_at: null,
      message_blinded_by: null,
      message_blind_reason: null,
    })
    .eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (ctx.detail.linkedChatRoomId) {
    await sb.from("chat_messages").insert({
      room_id: ctx.detail.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님이 강제 퇴장되었습니다.`,
    });
  }

  void appendUserNotification(sb, {
    user_id: targetUserId,
    notification_type: "status",
    title: `${ctx.detail.title}에서 강퇴되었습니다`,
    body: "운영자에 의해 채팅방에서 퇴장되었습니다.",
    link_url: "/philife/open-chat",
  });

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function banOpenChatMember(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
    reason?: string | null;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  const reason = trimText(input.reason ?? "", 500);
  if (!roomId || !actorUserId || !targetUserId || targetUserId === actorUserId) {
    return { ok: false, error: "bad_request" };
  }

  const ctx = await getManagedMemberActionContext(sb, roomId, actorUserId, targetUserId);
  if (!ctx.ok) return ctx;

  const { data: existingBan } = await sb
    .from("open_chat_bans")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .is("released_at", null)
    .maybeSingle();
  if ((existingBan as { id?: string } | null)?.id) {
    return getOpenChatRoomDetail(sb, roomId, actorUserId);
  }

  const { error: banError } = await sb.from("open_chat_bans").insert({
    room_id: roomId,
    user_id: targetUserId,
    banned_by: actorUserId,
    reason,
  });
  if (banError) return { ok: false, error: "db_error", message: banError.message };

  const membership = ctx.targetMembership;
  if (membership?.id) {
    await sb
      .from("open_chat_members")
      .update({
        status: "kicked",
        kicked_at: new Date().toISOString(),
        kicked_by: actorUserId,
        status_reason: reason || "manager_banned",
        is_message_blinded: false,
        message_blinded_at: null,
        message_blinded_by: null,
        message_blind_reason: null,
      })
      .eq("id", membership.id);
  }

  if (ctx.detail.linkedChatRoomId) {
    await sb.from("chat_messages").insert({
      room_id: ctx.detail.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: "운영자에 의해 차단된 사용자가 발생했습니다.",
    });
  }

  void appendUserNotification(sb, {
    user_id: targetUserId,
    notification_type: "status",
    title: `${ctx.detail.title} 접근이 차단되었습니다`,
    body: "운영자에 의해 이 오픈채팅에 다시 참여할 수 없습니다.",
    link_url: "/philife/open-chat",
  });

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function unbanOpenChatMember(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
  },
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  if (!roomId || !actorUserId || !targetUserId) return { ok: false, error: "bad_request" };

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canManage) return { ok: false, error: "forbidden" };

  const { error } = await sb
    .from("open_chat_bans")
    .update({ released_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .is("released_at", null);
  if (error) return { ok: false, error: "db_error", message: error.message };

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function assignOpenChatModerator(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
  }
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  if (!roomId || !actorUserId || !targetUserId || actorUserId === targetUserId) {
    return { ok: false, error: "bad_request" };
  }

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canAssignModerators) return { ok: false, error: "forbidden" };

  const membership = await getViewerMembership(sb, roomId, targetUserId);
  if (!membership?.id || membership.status !== "joined") {
    return { ok: false, error: "not_found", message: "joined_member_not_found" };
  }
  if (membership.role !== "member") {
    return { ok: false, error: "bad_request", message: "already_moderator" };
  }

  const { error } = await sb.from("open_chat_members").update({ role: "moderator" }).eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (detail.data.linkedChatRoomId) {
    await sb.from("chat_messages").insert({
      room_id: detail.data.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님이 부방장으로 지정되었습니다.`,
    });
  }

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function revokeOpenChatModerator(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
  }
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  if (!roomId || !actorUserId || !targetUserId || actorUserId === targetUserId) {
    return { ok: false, error: "bad_request" };
  }

  const detail = await getOpenChatRoomDetail(sb, roomId, actorUserId);
  if (!detail.ok) return detail;
  if (!detail.data.canAssignModerators) return { ok: false, error: "forbidden" };

  const membership = await getViewerMembership(sb, roomId, targetUserId);
  if (!membership?.id || membership.status !== "joined") {
    return { ok: false, error: "not_found", message: "joined_member_not_found" };
  }
  if (membership.role !== "moderator") {
    return { ok: false, error: "bad_request", message: "not_moderator" };
  }

  const { error } = await sb.from("open_chat_members").update({ role: "member" }).eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (detail.data.linkedChatRoomId) {
    await sb.from("chat_messages").insert({
      room_id: detail.data.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님의 부방장 권한이 해제되었습니다.`,
    });
  }

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function blindOpenChatMemberMessages(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
    reason?: string | null;
  }
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  const reason = trimText(input.reason ?? "", 500);
  if (!roomId || !actorUserId || !targetUserId || actorUserId === targetUserId) {
    return { ok: false, error: "bad_request" };
  }

  const ctx = await getManagedMemberActionContext(sb, roomId, actorUserId, targetUserId);
  if (!ctx.ok) return ctx;

  const membership = ctx.targetMembership;
  if (!membership?.id || membership.status !== "joined") {
    return { ok: false, error: "not_found", message: "joined_member_not_found" };
  }
  if (membership.is_message_blinded) {
    return getOpenChatRoomDetail(sb, roomId, actorUserId);
  }

  const blindReason = memberBlindReason(roomId, targetUserId, reason);
  const now = new Date().toISOString();
  const { error } = await sb
    .from("open_chat_members")
    .update({
      is_message_blinded: true,
      message_blinded_at: now,
      message_blinded_by: actorUserId,
      message_blind_reason: reason || "manager_blinded",
    })
    .eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (ctx.detail.linkedChatRoomId) {
    await sb
      .from("chat_messages")
      .update({ is_hidden_by_admin: true, hidden_reason: blindReason })
      .eq("room_id", ctx.detail.linkedChatRoomId)
      .eq("sender_id", targetUserId)
      .eq("is_hidden_by_admin", false)
      .neq("message_type", "system");

    await sb.from("chat_messages").insert({
      room_id: ctx.detail.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님의 메시지가 블라인드 처리되었습니다.`,
    });
  }

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}

export async function unblindOpenChatMemberMessages(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    userId: string;
  }
): Promise<OpenChatResult<OpenChatRoomDetail>> {
  const roomId = input.roomId.trim();
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.userId.trim();
  if (!roomId || !actorUserId || !targetUserId) return { ok: false, error: "bad_request" };

  const ctx = await getManagedMemberActionContext(sb, roomId, actorUserId, targetUserId);
  if (!ctx.ok) return ctx;

  const membership = ctx.targetMembership;
  if (!membership?.id) {
    return { ok: false, error: "not_found", message: "member_not_found" };
  }

  const { error } = await sb
    .from("open_chat_members")
    .update({
      is_message_blinded: false,
      message_blinded_at: null,
      message_blinded_by: null,
      message_blind_reason: null,
    })
    .eq("id", membership.id);
  if (error) return { ok: false, error: "db_error", message: error.message };

  if (ctx.detail.linkedChatRoomId) {
    await sb
      .from("chat_messages")
      .update({ is_hidden_by_admin: false, hidden_reason: null })
      .eq("room_id", ctx.detail.linkedChatRoomId)
      .eq("sender_id", targetUserId)
      .eq("is_hidden_by_admin", true)
      .filter("hidden_reason", "like", `${OPEN_CHAT_MEMBER_BLIND_REASON_PREFIX}${roomId}:${targetUserId}%`)
      .neq("message_type", "system");

    await sb.from("chat_messages").insert({
      room_id: ctx.detail.linkedChatRoomId,
      sender_id: null,
      message_type: "system",
      body: `${membership.nickname}님의 메시지 블라인드가 해제되었습니다.`,
    });
  }

  return getOpenChatRoomDetail(sb, roomId, actorUserId);
}
