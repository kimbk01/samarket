import { randomUUID } from "crypto";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallKind,
  CommunityMessengerCallLog,
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionStatus,
  CommunityMessengerCallSignal,
  CommunityMessengerCallSignalType,
  CommunityMessengerCallStatus,
  CommunityMessengerFriendRequest,
  CommunityMessengerFriendRequestStatus,
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";

type SupabaseLike = ReturnType<typeof getSupabaseServer>;

type ProfileRow = {
  id: string;
  nickname?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type RequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: CommunityMessengerFriendRequestStatus;
  created_at: string;
};

type RoomRow = {
  id: string;
  room_type: CommunityMessengerRoomType;
  room_status?: CommunityMessengerRoomStatus | null;
  is_readonly?: boolean | null;
  title: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  unread_count: number | null;
  is_muted: boolean | null;
  is_pinned: boolean | null;
  joined_at: string | null;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  message_type: "text" | "image" | "system" | "call_stub";
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type CallRow = {
  id: string;
  session_id?: string | null;
  room_id: string | null;
  caller_user_id: string;
  peer_user_id: string | null;
  call_kind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  duration_seconds: number | null;
  started_at: string | null;
};

type CallSessionRow = {
  id: string;
  room_id: string;
  initiator_user_id: string;
  recipient_user_id: string;
  call_kind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string | null;
};

type CallSignalRow = {
  id: string;
  session_id: string;
  room_id: string;
  from_user_id: string;
  to_user_id: string;
  signal_type: CommunityMessengerCallSignalType;
  payload: Record<string, unknown> | null;
  created_at: string | null;
};

type DevRoom = {
  id: string;
  roomType: CommunityMessengerRoomType;
  roomStatus: CommunityMessengerRoomStatus;
  isReadonly: boolean;
  title: string;
  avatarUrl: string | null;
  createdBy: string;
  directKey: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType: "text" | "image" | "system" | "call_stub";
};

type DevParticipant = {
  id: string;
  roomId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  joinedAt: string;
};

type DevMessage = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "system" | "call_stub";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type DevCall = {
  id: string;
  sessionId?: string | null;
  roomId: string | null;
  callerUserId: string;
  peerUserId: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  durationSeconds: number;
  startedAt: string;
};

type DevCallSession = {
  id: string;
  roomId: string;
  initiatorUserId: string;
  recipientUserId: string;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

type DevCallSignal = {
  id: string;
  sessionId: string;
  roomId: string;
  fromUserId: string;
  toUserId: string;
  signalType: CommunityMessengerCallSignalType;
  payload: Record<string, unknown>;
  createdAt: string;
};

type DevState = {
  friendRequests: RequestRow[];
  favoriteFriends: Map<string, Set<string>>;
  rooms: DevRoom[];
  participants: DevParticipant[];
  messages: DevMessage[];
  calls: DevCall[];
  callSessions: DevCallSession[];
  callSignals: DevCallSignal[];
};

function nowIso() {
  return new Date().toISOString();
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /does not exist|relation .* does not exist|schema cache/i.test(message);
}

function getSupabaseOrNull(): SupabaseLike | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

function profileLabel(row: ProfileRow | null | undefined, fallbackId: string): string {
  return trimText(row?.nickname) || trimText(row?.username) || `회원 ${fallbackId.replace(/-/g, "").slice(0, 6)}`;
}

function directKeyFor(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

function dedupeIds(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => trimText(v)).filter(Boolean))];
}

function normalizeRoomStatus(value: unknown): CommunityMessengerRoomStatus {
  return value === "blocked" || value === "archived" ? value : "active";
}

function isTerminalCallSessionStatus(value: unknown): value is Exclude<CommunityMessengerCallSessionStatus, "ringing" | "active"> {
  return value === "ended" || value === "rejected" || value === "missed" || value === "cancelled";
}

function getDevState(): DevState {
  const scope = globalThis as {
    __samarketCommunityMessengerState?: DevState;
  };
  if (!scope.__samarketCommunityMessengerState) {
    scope.__samarketCommunityMessengerState = {
      friendRequests: [],
      favoriteFriends: new Map(),
      rooms: [],
      participants: [],
      messages: [],
      calls: [],
      callSessions: [],
      callSignals: [],
    };
  }
  return scope.__samarketCommunityMessengerState;
}

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = dedupeIds(ids);
  if (!unique.length) return new Map();
  const sb = getSupabaseOrNull();
  if (!sb) return new Map();
  const { data } = await (sb as any)
    .from("profiles")
    .select("id, nickname, username, avatar_url")
    .in("id", unique);
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
}

async function getViewerRelationSets(
  userId: string,
  targetIds: string[]
): Promise<{
  following: Set<string>;
  blocked: Set<string>;
  friendIds: Set<string>;
  favoriteFriendIds: Set<string>;
}> {
  const following = new Set<string>();
  const blocked = new Set<string>();
  const friendIds = new Set<string>();
  const favoriteFriendIds = new Set<string>();
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id !== userId));
  if (!uniqueTargets.length) {
    return { following, blocked, friendIds, favoriteFriendIds };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: relationRows }, { data: requestRows }, { data: favoriteRows }] = await Promise.all([
      (sb as any)
        .from("user_relationships")
        .select("target_user_id, relation_type, type")
        .eq("user_id", userId)
        .in("target_user_id", uniqueTargets),
      (sb as any)
        .from("community_friend_requests")
        .select("requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      (sb as any)
        .from("community_friend_favorites")
        .select("target_user_id")
        .eq("user_id", userId)
        .in("target_user_id", uniqueTargets),
    ]);

    for (const row of (relationRows ?? []) as Array<{
      target_user_id?: string;
      relation_type?: string | null;
      type?: string | null;
    }>) {
      const target = trimText(row.target_user_id);
      const relationType = trimText(row.relation_type || row.type);
      if (!target) continue;
      if (relationType === "neighbor_follow") following.add(target);
      if (relationType === "blocked") blocked.add(target);
    }

    for (const row of (requestRows ?? []) as Array<{
      requester_id?: string;
      addressee_id?: string;
      status?: string | null;
    }>) {
      if (row.status !== "accepted") continue;
      const requesterId = trimText(row.requester_id);
      const addresseeId = trimText(row.addressee_id);
      const peerId = requesterId === userId ? addresseeId : requesterId;
      if (uniqueTargets.includes(peerId)) friendIds.add(peerId);
    }

    for (const row of (favoriteRows ?? []) as Array<{ target_user_id?: string }>) {
      const target = trimText(row.target_user_id);
      if (target) favoriteFriendIds.add(target);
    }
  } else {
    const dev = getDevState();
    const favorites = dev.favoriteFriends.get(userId);
    if (favorites) {
      for (const target of favorites) favoriteFriendIds.add(target);
    }
  }

  if (!friendIds.size || !favoriteFriendIds.size) {
    const dev = getDevState();
    for (const row of dev.friendRequests) {
      if (row.status !== "accepted") continue;
      const peerId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      if (uniqueTargets.includes(peerId)) friendIds.add(peerId);
    }
    const favorites = dev.favoriteFriends.get(userId);
    if (favorites) {
      for (const target of favorites) favoriteFriendIds.add(target);
    }
  }

  return { following, blocked, friendIds, favoriteFriendIds };
}

async function hydrateProfiles(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<CommunityMessengerProfileLite[]> {
  const includeSelf = options?.includeSelf === true;
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id && (includeSelf || id !== viewerId)));
  if (!uniqueTargets.length) return [];
  const [profileMap, relationSets] = await Promise.all([
    fetchProfilesByIds(uniqueTargets),
    getViewerRelationSets(viewerId, uniqueTargets),
  ]);
  return uniqueTargets.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: trimText(profile?.username) ? `@${trimText(profile?.username)}` : undefined,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: id === viewerId ? false : relationSets.following.has(id),
      blocked: id === viewerId ? false : relationSets.blocked.has(id),
      isFriend: id === viewerId ? false : relationSets.friendIds.has(id),
      isFavoriteFriend: id === viewerId ? false : relationSets.favoriteFriendIds.has(id),
    };
  });
}

async function hydrateSelfProfile(userId: string): Promise<CommunityMessengerProfileLite | null> {
  const me = await hydrateProfiles(userId, [userId], { includeSelf: true });
  return me[0] ?? null;
}

async function listFriendRequests(userId: string): Promise<CommunityMessengerFriendRequest[]> {
  const sb = getSupabaseOrNull();
  let rows: RequestRow[] = [];
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_friend_requests")
      .select("id, requester_id, addressee_id, status, created_at")
      .eq("status", "pending")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (!error || !isMissingTableError(error)) {
      rows = ((data ?? []) as RequestRow[]).filter(Boolean);
    }
  }
  if (!rows.length) {
    rows = getDevState().friendRequests
      .filter((row) => row.status === "pending" && (row.requester_id === userId || row.addressee_id === userId))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  const profileMap = await fetchProfilesByIds(
    dedupeIds(rows.flatMap((row) => [row.requester_id, row.addressee_id]))
  );
  return rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    requesterLabel: profileLabel(profileMap.get(row.requester_id), row.requester_id),
    addresseeId: row.addressee_id,
    addresseeLabel: profileLabel(profileMap.get(row.addressee_id), row.addressee_id),
    status: row.status,
    direction: row.addressee_id === userId ? "incoming" : "outgoing",
    createdAt: row.created_at,
  }));
}

async function listAcceptedFriendIds(userId: string): Promise<string[]> {
  const result = new Set<string>();
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_friend_requests")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (!error || !isMissingTableError(error)) {
      for (const row of (data ?? []) as Array<{
        requester_id?: string;
        addressee_id?: string;
      }>) {
        const requesterId = trimText(row.requester_id);
        const addresseeId = trimText(row.addressee_id);
        const peerId = requesterId === userId ? addresseeId : requesterId;
        if (peerId) result.add(peerId);
      }
    }
  }
  for (const row of getDevState().friendRequests) {
    if (row.status !== "accepted") continue;
    const peerId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    if (peerId) result.add(peerId);
  }
  return [...result];
}

async function listFollowingIds(userId: string, relationType: "neighbor_follow" | "blocked"): Promise<string[]> {
  const result = new Set<string>();
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data } = await (sb as any)
      .from("user_relationships")
      .select("target_user_id, relation_type, type")
      .eq("user_id", userId)
      .or(`relation_type.eq.${relationType},type.eq.${relationType}`);
    for (const row of (data ?? []) as Array<{
      target_user_id?: string | null;
    }>) {
      const target = trimText(row.target_user_id);
      if (target) result.add(target);
    }
  }
  return [...result];
}

async function mapRoomSummary(
  userId: string,
  room: RoomRow | DevRoom,
  participants: Array<ParticipantRow | DevParticipant>
): Promise<CommunityMessengerRoomSummary> {
  const roomId = room.id;
  const isDbRoom = "room_type" in room;
  const roomType = (isDbRoom ? room.room_type : room.roomType) as CommunityMessengerRoomType;
  const roomStatus = normalizeRoomStatus(isDbRoom ? room.room_status : room.roomStatus);
  const isReadonly = isDbRoom ? room.is_readonly === true : room.isReadonly;
  const roomTitle = trimText(isDbRoom ? room.title : room.title);
  const roomAvatar = trimText(isDbRoom ? room.avatar_url : room.avatarUrl) || null;
  const roomLastMessage = trimText(isDbRoom ? room.last_message : room.lastMessage);
  const roomLastAt = trimText(isDbRoom ? room.last_message_at : room.lastMessageAt) || nowIso();
  const me = participants.find((item) => ("user_id" in item ? item.user_id : item.userId) === userId);
  const memberIds = dedupeIds(
    participants.map((item) => ("user_id" in item ? item.user_id : item.userId))
  );
  const peers = memberIds.filter((id) => id !== userId);
  const peerProfiles = await hydrateProfiles(userId, peers);
  const defaultDirectTitle = peerProfiles[0]?.label ?? "새 대화";
  const title = roomType === "direct" ? defaultDirectTitle : roomTitle || `그룹 ${memberIds.length}명`;
  const subtitle =
    roomType === "direct"
      ? peerProfiles[0]?.subtitle ?? "친구와 나누는 대화"
      : `${memberIds.length}명 참여 중`;
  return {
    id: roomId,
    roomType,
    roomStatus,
    isReadonly,
    title,
    subtitle,
    avatarUrl: roomAvatar || peerProfiles[0]?.avatarUrl || null,
    unreadCount: Math.max(0, Number(("unread_count" in (me ?? {}) ? (me as ParticipantRow).unread_count : (me as DevParticipant | undefined)?.unreadCount) ?? 0)),
    lastMessage: roomLastMessage || (roomType === "group" ? "그룹 대화를 시작해 보세요." : "메시지를 보내 보세요."),
    lastMessageAt: roomLastAt,
    memberCount: memberIds.length,
    peerUserId: roomType === "direct" ? peers[0] ?? null : null,
  };
}

async function listRooms(userId: string): Promise<{
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
}> {
  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];

  if (sb) {
    const { data: myParticipants, error: myParticipantsError } = await (sb as any)
      .from("community_messenger_participants")
      .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, joined_at")
      .eq("user_id", userId);
    if (!myParticipantsError || !isMissingTableError(myParticipantsError)) {
      const roomIds = dedupeIds(((myParticipants ?? []) as ParticipantRow[]).map((row) => row.room_id));
      if (roomIds.length) {
        const [{ data: rooms }, { data: participants }] = await Promise.all([
          (sb as any)
            .from("community_messenger_rooms")
            .select("id, room_type, room_status, is_readonly, title, avatar_url, created_by, last_message, last_message_at, last_message_type")
            .in("id", roomIds)
            .order("last_message_at", { ascending: false }),
          (sb as any)
            .from("community_messenger_participants")
            .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, joined_at")
            .in("room_id", roomIds),
        ]);
        roomRows = (rooms ?? []) as RoomRow[];
        participantRows = (participants ?? []) as ParticipantRow[];
      }
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    const roomIds = dedupeIds(dev.participants.filter((row) => row.userId === userId).map((row) => row.roomId));
    roomRows = dev.rooms
      .filter((room) => roomIds.includes(room.id))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    participantRows = dev.participants.filter((row) => roomIds.includes(row.roomId));
  }

  const byRoomId = new Map<string, Array<ParticipantRow | DevParticipant>>();
  for (const participant of participantRows) {
    const roomId = "room_id" in participant ? participant.room_id : participant.roomId;
    const list = byRoomId.get(roomId) ?? [];
    list.push(participant);
    byRoomId.set(roomId, list);
  }

  const summaries = await Promise.all(
    roomRows.map((room) => mapRoomSummary(userId, room, byRoomId.get(room.id) ?? []))
  );
  return {
    chats: summaries.filter((room) => room.roomType === "direct"),
    groups: summaries.filter((room) => room.roomType === "group"),
  };
}

async function listCalls(userId: string): Promise<CommunityMessengerCallLog[]> {
  const sb = getSupabaseOrNull();
  let rows: Array<CallRow | DevCall> = [];
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_logs")
      .select("id, room_id, caller_user_id, peer_user_id, call_kind, status, duration_seconds, started_at")
      .or(`caller_user_id.eq.${userId},peer_user_id.eq.${userId}`)
      .order("started_at", { ascending: false })
      .limit(30);
    if (!error || !isMissingTableError(error)) {
      rows = (data ?? []) as CallRow[];
    }
  }
  if (!rows.length) {
    rows = getDevState().calls
      .filter((row) => row.callerUserId === userId || row.peerUserId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  const peerIds = dedupeIds(
    rows.map((row) => ("peer_user_id" in row ? row.peer_user_id : row.peerUserId) ?? "").filter(Boolean)
  );
  const peerProfiles = await hydrateProfiles(userId, peerIds);
  const peerMap = new Map(peerProfiles.map((profile) => [profile.id, profile]));
  const roomMap = await loadRoomTitleMap(
    dedupeIds(rows.map((row) => ("room_id" in row ? row.room_id : row.roomId) ?? "").filter(Boolean)),
    userId
  );

  return rows.map((row) => {
    const isDbCall = "call_kind" in row;
    const roomId = ("room_id" in row ? row.room_id : row.roomId) ?? null;
    const peerUserId = ("peer_user_id" in row ? row.peer_user_id : row.peerUserId) ?? null;
    const peer = peerUserId ? peerMap.get(peerUserId) : undefined;
    const startedAt = trimText("started_at" in row ? row.started_at : row.startedAt) || nowIso();
    const title = roomId ? roomMap.get(roomId) ?? peer?.label ?? "통화" : peer?.label ?? "통화";
    return {
      id: row.id,
      roomId,
      title,
      peerLabel: peer?.label ?? "상대",
      peerUserId,
      callKind: (isDbCall ? row.call_kind : row.callKind) as CommunityMessengerCallKind,
      status: (isDbCall ? row.status : row.status) as CommunityMessengerCallStatus,
      startedAt,
      durationSeconds: Number((isDbCall ? row.duration_seconds : row.durationSeconds) ?? 0),
    };
  });
}

async function loadRoomTitleMap(roomIds: string[], userId: string): Promise<Map<string, string>> {
  const uniqueRoomIds = dedupeIds(roomIds);
  const roomMap = new Map<string, string>();
  if (!uniqueRoomIds.length) return roomMap;
  const rooms = await listRooms(userId);
  for (const room of [...rooms.chats, ...rooms.groups]) {
    roomMap.set(room.id, room.title);
  }
  return roomMap;
}

async function mapCallSession(
  userId: string,
  session: CallSessionRow | DevCallSession
): Promise<CommunityMessengerCallSession> {
  const isDbSession = "initiator_user_id" in session;
  const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
  const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
  const peerUserId = initiatorUserId === userId ? recipientUserId : initiatorUserId;
  const profiles = await hydrateProfiles(userId, [peerUserId]);
  const peer = profiles[0];

  return {
    id: session.id,
    roomId: isDbSession ? session.room_id : session.roomId,
    initiatorUserId,
    recipientUserId,
    peerUserId,
    peerLabel: peer?.label ?? profileLabel(null, peerUserId),
    callKind: (isDbSession ? session.call_kind : session.callKind) as CommunityMessengerCallKind,
    status: (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus,
    startedAt: trimText(isDbSession ? session.started_at : session.startedAt) || nowIso(),
    answeredAt: trimText(isDbSession ? session.answered_at : session.answeredAt) || null,
    endedAt: trimText(isDbSession ? session.ended_at : session.endedAt) || null,
    isMineInitiator: initiatorUserId === userId,
  };
}

async function getActiveCallSessionForRoom(
  userId: string,
  roomId: string
): Promise<CommunityMessengerCallSession | null> {
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .eq("room_id", roomId)
      .in("status", ["ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && !error) {
      return mapCallSession(userId, data as CallSessionRow);
    }
  }

  const dev = getDevState();
  const session = dev.callSessions
    .filter((item) => item.roomId === roomId && (item.status === "ringing" || item.status === "active"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return session ? mapCallSession(userId, session) : null;
}

async function appendCallStubMessage(input: {
  userId: string;
  roomId: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  createdAt: string;
}) {
  if (!input.roomId) return;
  const label =
    input.callKind === "video" ? `영상 통화 · ${input.status}` : `음성 통화 · ${input.status}`;
  const sb = getSupabaseOrNull();
  if (sb) {
    await (sb as any).from("community_messenger_messages").insert({
      room_id: input.roomId,
      sender_id: input.userId,
      message_type: "call_stub",
      content: label,
      metadata: {
        callKind: input.callKind,
        callStatus: input.status,
      },
      created_at: input.createdAt,
    });
    await (sb as any)
      .from("community_messenger_rooms")
      .update({
        last_message: label,
        last_message_at: input.createdAt,
        last_message_type: "call_stub",
        updated_at: input.createdAt,
      })
      .eq("id", input.roomId);
    const { data: participants } = await (sb as any)
      .from("community_messenger_participants")
      .select("id, user_id, unread_count")
      .eq("room_id", input.roomId);
    for (const participant of (participants ?? []) as Array<{ id: string; user_id: string; unread_count?: number | null }>) {
      await (sb as any)
        .from("community_messenger_participants")
        .update({
          unread_count: participant.user_id === input.userId ? 0 : Number(participant.unread_count ?? 0) + 1,
          last_read_at: participant.user_id === input.userId ? input.createdAt : null,
        })
        .eq("id", participant.id);
    }
    return;
  }

  const dev = getDevState();
  dev.messages.push({
    id: randomUUID(),
    roomId: input.roomId,
    senderId: input.userId,
    messageType: "call_stub",
    content: label,
    metadata: {
      callKind: input.callKind,
      callStatus: input.status,
    },
    createdAt: input.createdAt,
  });
  const room = dev.rooms.find((item) => item.id === input.roomId);
  if (room) {
    room.lastMessage = label;
    room.lastMessageAt = input.createdAt;
    room.lastMessageType = "call_stub";
  }
  for (const participant of dev.participants.filter((item) => item.roomId === input.roomId)) {
    participant.unreadCount = participant.userId === input.userId ? 0 : participant.unreadCount + 1;
  }
}

async function ensureNoBlockedEitherWay(userId: string, targetUserId: string): Promise<boolean> {
  const sb = getSupabaseOrNull();
  if (!sb) return true;
  const { data } = await (sb as any)
    .from("user_relationships")
    .select("user_id, target_user_id, relation_type, type")
    .or(
      `and(user_id.eq.${userId},target_user_id.eq.${targetUserId},relation_type.eq.blocked),and(user_id.eq.${targetUserId},target_user_id.eq.${userId},relation_type.eq.blocked),and(user_id.eq.${userId},target_user_id.eq.${targetUserId},type.eq.blocked),and(user_id.eq.${targetUserId},target_user_id.eq.${userId},type.eq.blocked)`
    );
  return ((data ?? []) as Array<unknown>).length === 0;
}

export async function getCommunityMessengerBootstrap(
  userId: string
): Promise<CommunityMessengerBootstrap> {
  const [me, friendIds, followingIds, blockedIds, requests, rooms, calls] = await Promise.all([
    hydrateSelfProfile(userId),
    listAcceptedFriendIds(userId),
    listFollowingIds(userId, "neighbor_follow"),
    listFollowingIds(userId, "blocked"),
    listFriendRequests(userId),
    listRooms(userId),
    listCalls(userId),
  ]);

  const [friends, following, blocked] = await Promise.all([
    hydrateProfiles(userId, friendIds),
    hydrateProfiles(userId, followingIds),
    hydrateProfiles(userId, blockedIds),
  ]);

  return {
    me,
    tabs: {
      friends: friends.length,
      chats: rooms.chats.length,
      groups: rooms.groups.length,
      calls: calls.length,
      settings: blocked.length,
    },
    friends,
    following,
    blocked,
    requests,
    chats: rooms.chats,
    groups: rooms.groups,
    calls,
  };
}

export async function searchCommunityMessengerUsers(
  userId: string,
  query: string
): Promise<CommunityMessengerProfileLite[]> {
  const keyword = trimText(query);
  if (!keyword) return [];
  const sb = getSupabaseOrNull();
  if (!sb) return [];
  const { data } = await (sb as any)
    .from("profiles")
    .select("id")
    .or(`nickname.ilike.%${keyword}%,username.ilike.%${keyword}%`)
    .neq("id", userId)
    .limit(12);
  return hydrateProfiles(
    userId,
    dedupeIds(((data ?? []) as Array<{ id?: string }>).map((row) => trimText(row.id)))
  );
}

export async function sendCommunityMessengerFriendRequest(
  userId: string,
  targetUserId: string,
  note?: string
): Promise<{ ok: boolean; request?: CommunityMessengerFriendRequest; error?: string }> {
  const target = trimText(targetUserId);
  if (!target || target === userId) return { ok: false, error: "bad_target" };
  if (!(await ensureNoBlockedEitherWay(userId, target))) {
    return { ok: false, error: "blocked_target" };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: existingError } = await (sb as any)
      .from("community_friend_requests")
      .select("id, requester_id, addressee_id, status, created_at")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${userId})`
      )
      .limit(1)
      .maybeSingle();
    if (existing && !existingError) {
      const row = existing as RequestRow;
      if (row.status === "accepted") return { ok: false, error: "already_friend" };
      if (row.status === "pending" && row.requester_id === target) {
        return { ok: false, error: "incoming_request_exists" };
      }
      if (row.status === "pending" && row.requester_id === userId) {
        return { ok: false, error: "already_requested" };
      }
      const { error: cleanupError } = await (sb as any)
        .from("community_friend_requests")
        .delete()
        .eq("id", row.id);
      if (cleanupError && !isMissingTableError(cleanupError)) {
        return { ok: false, error: String(cleanupError.message ?? "friend_request_reset_failed") };
      }
    }
    if (!existingError) {
      const { data, error } = await (sb as any)
        .from("community_friend_requests")
        .insert({
          requester_id: userId,
          addressee_id: target,
          status: "pending",
          note: trimText(note),
        })
        .select("id, requester_id, addressee_id, status, created_at")
        .single();
      if (!error) {
        const profileMap = await fetchProfilesByIds([userId, target]);
        const row = data as RequestRow;
        return {
          ok: true,
          request: {
            id: row.id,
            requesterId: row.requester_id,
            requesterLabel: profileLabel(profileMap.get(row.requester_id), row.requester_id),
            addresseeId: row.addressee_id,
            addresseeLabel: profileLabel(profileMap.get(row.addressee_id), row.addressee_id),
            status: row.status,
            direction: "outgoing",
            createdAt: row.created_at,
          },
        };
      }
      if (!isMissingTableError(error)) {
        return { ok: false, error: String(error.message ?? "friend_request_failed") };
      }
    }
  }

  const dev = getDevState();
  const existing = dev.friendRequests.find(
    (row) =>
      (row.requester_id === userId && row.addressee_id === target) ||
      (row.requester_id === target && row.addressee_id === userId)
  );
  if (existing) {
    if (existing.status === "accepted") return { ok: false, error: "already_friend" };
    if (existing.status === "pending" && existing.requester_id === target) {
      return { ok: false, error: "incoming_request_exists" };
    }
    if (existing.status === "pending") return { ok: false, error: "already_requested" };
    dev.friendRequests = dev.friendRequests.filter((row) => row.id !== existing.id);
  }
  const row: RequestRow = {
    id: randomUUID(),
    requester_id: userId,
    addressee_id: target,
    status: "pending",
    created_at: nowIso(),
  };
  dev.friendRequests.unshift(row);
  const profileMap = await fetchProfilesByIds([userId, target]);
  return {
    ok: true,
    request: {
      id: row.id,
      requesterId: row.requester_id,
      requesterLabel: profileLabel(profileMap.get(row.requester_id), row.requester_id),
      addresseeId: row.addressee_id,
      addresseeLabel: profileLabel(profileMap.get(row.addressee_id), row.addressee_id),
      status: row.status,
      direction: "outgoing",
      createdAt: row.created_at,
    },
  };
}

export async function respondCommunityMessengerFriendRequest(
  userId: string,
  requestId: string,
  action: "accept" | "reject" | "cancel"
): Promise<{ ok: boolean; error?: string }> {
  const id = trimText(requestId);
  if (!id) return { ok: false, error: "bad_request_id" };
  const nextStatus: CommunityMessengerFriendRequestStatus =
    action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled";
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_friend_requests")
      .select("id, requester_id, addressee_id, status")
      .eq("id", id)
      .maybeSingle();
    if (row) {
      const request = row as RequestRow;
      const allowed =
        (action === "cancel" && request.requester_id === userId) ||
        ((action === "accept" || action === "reject") && request.addressee_id === userId);
      if (!allowed) return { ok: false, error: "forbidden" };
      const { error } = await (sb as any)
        .from("community_friend_requests")
        .update({ status: nextStatus, responded_at: nowIso() })
        .eq("id", id);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
    }
  }

  const dev = getDevState();
  const request = dev.friendRequests.find((row) => row.id === id);
  if (!request) return { ok: false, error: "not_found" };
  const allowed =
    (action === "cancel" && request.requester_id === userId) ||
    ((action === "accept" || action === "reject") && request.addressee_id === userId);
  if (!allowed) return { ok: false, error: "forbidden" };
  request.status = nextStatus;
  return { ok: true };
}

async function isFriend(userId: string, targetUserId: string): Promise<boolean> {
  const ids = await listAcceptedFriendIds(userId);
  return ids.includes(targetUserId);
}

export async function toggleCommunityMessengerFavoriteFriend(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; isFavorite?: boolean; error?: string }> {
  const target = trimText(targetUserId);
  if (!target || !(await isFriend(userId, target))) {
    return { ok: false, error: "friend_required" };
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: selectError } = await (sb as any)
      .from("community_friend_favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("target_user_id", target)
      .maybeSingle();
    if (!selectError || !isMissingTableError(selectError)) {
      if (existing?.id) {
        const { error } = await (sb as any).from("community_friend_favorites").delete().eq("id", existing.id);
        if (!error) return { ok: true, isFavorite: false };
      } else {
        const { error } = await (sb as any).from("community_friend_favorites").insert({
          user_id: userId,
          target_user_id: target,
        });
        if (!error) return { ok: true, isFavorite: true };
      }
    }
  }

  const dev = getDevState();
  const favorites = dev.favoriteFriends.get(userId) ?? new Set<string>();
  if (favorites.has(target)) {
    favorites.delete(target);
    dev.favoriteFriends.set(userId, favorites);
    return { ok: true, isFavorite: false };
  }
  favorites.add(target);
  dev.favoriteFriends.set(userId, favorites);
  return { ok: true, isFavorite: true };
}

export async function removeCommunityMessengerFriend(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const target = trimText(targetUserId);
  if (!target) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: rows, error: selectError } = await (sb as any)
      .from("community_friend_requests")
      .select("id, requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${userId})`);
    if (selectError && !isMissingTableError(selectError)) {
      return { ok: false, error: String(selectError.message ?? "friend_lookup_failed") };
    }
    for (const row of (rows ?? []) as RequestRow[]) {
      const { error } = await (sb as any)
        .from("community_friend_requests")
        .delete()
        .eq("id", row.id);
      if (error && !isMissingTableError(error)) {
        return { ok: false, error: String(error.message ?? "friend_remove_failed") };
      }
    }
    await (sb as any)
      .from("community_friend_favorites")
      .delete()
      .or(
        `and(user_id.eq.${userId},target_user_id.eq.${target}),and(user_id.eq.${target},target_user_id.eq.${userId})`
      );
    return { ok: true };
  }

  const dev = getDevState();
  dev.friendRequests = dev.friendRequests.filter((row) => {
    const samePair =
      (row.requester_id === userId && row.addressee_id === target) ||
      (row.requester_id === target && row.addressee_id === userId);
    return !(samePair && row.status === "accepted");
  });
  dev.favoriteFriends.get(userId)?.delete(target);
  dev.favoriteFriends.get(target)?.delete(userId);
  return { ok: true };
}

export async function ensureCommunityMessengerDirectRoom(
  userId: string,
  peerUserId: string
): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const peerId = trimText(peerUserId);
  if (!peerId || peerId === userId) return { ok: false, error: "bad_peer" };
  if (!(await ensureNoBlockedEitherWay(userId, peerId))) {
    return { ok: false, error: "blocked_target" };
  }
  const directKey = directKeyFor(userId, peerId);
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: existingError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id")
      .eq("room_type", "direct")
      .eq("direct_key", directKey)
      .maybeSingle();
    if (existing?.id && !existingError) {
      return { ok: true, roomId: existing.id as string };
    }
    if (!existing || isMissingTableError(existingError)) {
      const { data: room, error: roomError } = await (sb as any)
        .from("community_messenger_rooms")
        .insert({
          room_type: "direct",
          room_status: "active",
          is_readonly: false,
          created_by: userId,
          direct_key: directKey,
          title: "",
          last_message: "",
          last_message_type: "system",
        })
        .select("id")
        .single();
      if (!roomError) {
        const roomId = room.id as string;
        await (sb as any).from("community_messenger_participants").insert([
          { room_id: roomId, user_id: userId, role: "owner" },
          { room_id: roomId, user_id: peerId, role: "member" },
        ]);
        return { ok: true, roomId };
      }
      if (!isMissingTableError(roomError)) {
        return { ok: false, error: String(roomError.message ?? "room_create_failed") };
      }
    }
  }

  const dev = getDevState();
  const existing = dev.rooms.find((room) => room.roomType === "direct" && room.directKey === directKey);
  if (existing) return { ok: true, roomId: existing.id };
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "direct",
    roomStatus: "active",
    isReadonly: false,
    title: "",
    avatarUrl: null,
    createdBy: userId,
    directKey,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  dev.participants.push(
    {
      id: randomUUID(),
      roomId,
      userId,
      role: "owner",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      joinedAt: createdAt,
    },
    {
      id: randomUUID(),
      roomId,
      userId: peerId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      joinedAt: createdAt,
    }
  );
  return { ok: true, roomId };
}

export async function createCommunityMessengerGroupRoom(input: {
  userId: string;
  title: string;
  memberIds: string[];
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const title = trimText(input.title);
  const memberIds = dedupeIds([input.userId, ...input.memberIds]);
  if (!title) return { ok: false, error: "title_required" };
  if (memberIds.length < 2) return { ok: false, error: "members_required" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .insert({
        room_type: "group",
          room_status: "active",
          is_readonly: false,
        created_by: input.userId,
        title,
        last_message: "",
        last_message_type: "system",
      })
      .select("id")
      .single();
    if (!roomError) {
      const roomId = room.id as string;
      await (sb as any).from("community_messenger_participants").insert(
        memberIds.map((memberId) => ({
          room_id: roomId,
          user_id: memberId,
          role: memberId === input.userId ? "owner" : "member",
        }))
      );
      return { ok: true, roomId };
    }
    if (!isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "group_create_failed") };
    }
  }

  const dev = getDevState();
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "group",
    roomStatus: "active",
    isReadonly: false,
    title,
    avatarUrl: null,
    createdBy: input.userId,
    directKey: null,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  for (const memberId of memberIds) {
    dev.participants.push({
      id: randomUUID(),
      roomId,
      userId: memberId,
      role: memberId === input.userId ? "owner" : "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      joinedAt: createdAt,
    });
  }
  return { ok: true, roomId };
}

export async function inviteCommunityMessengerGroupMembers(input: {
  userId: string;
  roomId: string;
  memberIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const memberIds = dedupeIds(input.memberIds);
  if (!roomId || !memberIds.length) return { ok: false, error: "members_required" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: me } = await (sb as any)
      .from("community_messenger_participants")
      .select("id, role")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!me) return { ok: false, error: "forbidden" };
    const { error } = await (sb as any).from("community_messenger_participants").upsert(
      memberIds.map((memberId) => ({
        room_id: roomId,
        user_id: memberId,
        role: "member",
      })),
      { onConflict: "room_id,user_id" }
    );
    if (!error) return { ok: true };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "invite_failed") };
  }

  const dev = getDevState();
  const me = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!me) return { ok: false, error: "forbidden" };
  for (const memberId of memberIds) {
    if (dev.participants.some((row) => row.roomId === roomId && row.userId === memberId)) continue;
    dev.participants.push({
      id: randomUUID(),
      roomId,
      userId: memberId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      joinedAt: nowIso(),
    });
  }
  return { ok: true };
}

export async function getCommunityMessengerRoomSnapshot(
  userId: string,
  roomId: string
): Promise<CommunityMessengerRoomSnapshot | null> {
  const id = trimText(roomId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  let room: RoomRow | DevRoom | null = null;
  let participants: Array<ParticipantRow | DevParticipant> = [];
  let messages: Array<MessageRow | DevMessage> = [];
  if (sb) {
    const { data: myParticipant } = await (sb as any)
      .from("community_messenger_participants")
      .select("id, role")
      .eq("room_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (myParticipant) {
      const [{ data: roomData }, { data: participantData }, { data: messageData }] = await Promise.all([
        (sb as any)
          .from("community_messenger_rooms")
          .select("id, room_type, room_status, is_readonly, title, avatar_url, created_by, last_message, last_message_at, last_message_type")
          .eq("id", id)
          .maybeSingle(),
        (sb as any)
          .from("community_messenger_participants")
          .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, joined_at")
          .eq("room_id", id),
        (sb as any)
          .from("community_messenger_messages")
          .select("id, room_id, sender_id, message_type, content, metadata, created_at")
          .eq("room_id", id)
          .order("created_at", { ascending: true })
          .limit(120),
      ]);
      room = (roomData as RoomRow | null) ?? null;
      participants = (participantData ?? []) as ParticipantRow[];
      messages = (messageData ?? []) as MessageRow[];
      await (sb as any)
        .from("community_messenger_participants")
        .update({ unread_count: 0, last_read_at: nowIso() })
        .eq("room_id", id)
        .eq("user_id", userId);
    }
  }

  if (!room) {
    const dev = getDevState();
    room = dev.rooms.find((row) => row.id === id) ?? null;
    if (!room) return null;
    participants = dev.participants.filter((row) => row.roomId === id);
    if (!participants.some((row) => ("user_id" in row ? row.user_id : row.userId) === userId)) return null;
    messages = dev.messages.filter((row) => row.roomId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const mine = participants.find((row) => ("user_id" in row ? row.user_id : row.userId) === userId);
    if (mine && !("user_id" in mine)) mine.unreadCount = 0;
  }

  const [summary, activeCall] = await Promise.all([
    mapRoomSummary(userId, room, participants),
    getActiveCallSessionForRoom(userId, id),
  ]);
  const memberIds = dedupeIds(participants.map((item) => ("user_id" in item ? item.user_id : item.userId)));
  const members = await hydrateProfiles(userId, memberIds, { includeSelf: true });
  const profileMap = await fetchProfilesByIds(memberIds);
  const meParticipant = participants.find(
    (item) => ("user_id" in item ? item.user_id : item.userId) === userId
  ) as ParticipantRow | DevParticipant | undefined;
  const meRole = meParticipant?.role ?? "member";

  const mappedMessages: CommunityMessengerMessage[] = messages.map((message) => {
    const isDbMessage = "sender_id" in message;
    const senderId = (isDbMessage ? message.sender_id : message.senderId) ?? null;
    const metadata = ((isDbMessage ? message.metadata : message.metadata) ?? {}) as Record<string, unknown>;
    return {
      id: message.id,
      roomId: isDbMessage ? message.room_id : message.roomId,
      senderId,
      senderLabel: senderId ? profileLabel(profileMap.get(senderId), senderId) : "시스템",
      messageType: (isDbMessage ? message.message_type : message.messageType) as CommunityMessengerMessage["messageType"],
      content: trimText(isDbMessage ? message.content : message.content),
      createdAt: trimText(isDbMessage ? message.created_at : message.createdAt) || nowIso(),
      isMine: senderId === userId,
      callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
      callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
    };
  });

  return {
    viewerUserId: userId,
    room: {
      ...summary,
      description:
        summary.roomType === "group"
          ? `${members.length}명이 함께 있는 라인 스타일 그룹 채팅`
          : "친구와 1:1로 대화하는 메신저 방",
    },
    members,
    messages: mappedMessages,
    myRole: meRole,
    activeCall,
  };
}

export async function sendCommunityMessengerMessage(input: {
  userId: string;
  roomId: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const snapshot = await getCommunityMessengerRoomSnapshot(input.userId, roomId);
  if (!snapshot) return { ok: false, error: "room_not_found" };
  if (snapshot.room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (snapshot.room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (snapshot.room.isReadonly) return { ok: false, error: "room_readonly" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const createdAt = nowIso();
    const { error: insertError } = await (sb as any).from("community_messenger_messages").insert({
      room_id: roomId,
      sender_id: input.userId,
      message_type: "text",
      content,
      metadata: {},
      created_at: createdAt,
    });
    if (!insertError) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: content,
          last_message_at: createdAt,
          last_message_type: "text",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { data: participants } = await (sb as any)
        .from("community_messenger_participants")
        .select("id, user_id, unread_count")
        .eq("room_id", roomId);
      for (const participant of (participants ?? []) as Array<{
        id: string;
        user_id: string;
        unread_count?: number | null;
      }>) {
        await (sb as any)
          .from("community_messenger_participants")
          .update({
            unread_count: participant.user_id === input.userId ? 0 : Number(participant.unread_count ?? 0) + 1,
            last_read_at: participant.user_id === input.userId ? createdAt : null,
          })
          .eq("id", participant.id);
      }
      return { ok: true };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const dev = getDevState();
  const createdAt = nowIso();
  dev.messages.push({
    id: randomUUID(),
    roomId,
    senderId: input.userId,
    messageType: "text",
    content,
    metadata: {},
    createdAt,
  });
  const room = dev.rooms.find((row) => row.id === roomId);
  if (room) {
    room.lastMessage = content;
    room.lastMessageAt = createdAt;
    room.lastMessageType = "text";
  }
  for (const participant of dev.participants.filter((row) => row.roomId === roomId)) {
    participant.unreadCount = participant.userId === input.userId ? 0 : participant.unreadCount + 1;
  }
  return { ok: true };
}

export async function createCommunityMessengerCallLog(input: {
  userId: string;
  roomId?: string | null;
  sessionId?: string | null;
  peerUserId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  durationSeconds?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId ?? "") || null;
  const sessionId = trimText(input.sessionId ?? "") || null;
  const peerUserId = trimText(input.peerUserId ?? "") || null;
  const startedAt = nowIso();
  const payload = {
    session_id: sessionId,
    room_id: roomId,
    caller_user_id: input.userId,
    peer_user_id: peerUserId,
    call_kind: input.callKind,
    status: input.status,
    duration_seconds: Math.max(0, Number(input.durationSeconds ?? 0)),
    started_at: startedAt,
  };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { error } = await (sb as any).from("community_messenger_call_logs").insert(payload);
    if (!error) {
      await appendCallStubMessage({
        userId: input.userId,
        roomId,
        callKind: input.callKind,
        status: input.status,
        createdAt: startedAt,
      });
      return { ok: true };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "call_log_failed") };
  }

  const dev = getDevState();
  dev.calls.unshift({
    id: randomUUID(),
    sessionId,
    roomId,
    callerUserId: input.userId,
    peerUserId,
    callKind: input.callKind,
    status: input.status,
    durationSeconds: Math.max(0, Number(input.durationSeconds ?? 0)),
    startedAt,
  });
  await appendCallStubMessage({
    userId: input.userId,
    roomId,
    callKind: input.callKind,
    status: input.status,
    createdAt: startedAt,
  });
  return { ok: true };
}

export async function startCommunityMessengerCallSession(input: {
  userId: string;
  roomId: string;
  callKind: CommunityMessengerCallKind;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_required" };
  const snapshot = await getCommunityMessengerRoomSnapshot(input.userId, roomId);
  if (!snapshot) return { ok: false, error: "room_not_found" };
  if (snapshot.room.roomType !== "direct") return { ok: false, error: "group_call_not_supported_yet" };
  if (snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly) {
    return { ok: false, error: "room_unavailable" };
  }
  if (snapshot.activeCall && !isTerminalCallSessionStatus(snapshot.activeCall.status)) {
    return { ok: true, session: snapshot.activeCall };
  }
  const peerUserId = trimText(snapshot.room.peerUserId ?? "") || snapshot.members.find((item) => item.id !== input.userId)?.id;
  if (!peerUserId) return { ok: false, error: "peer_not_found" };

  const sb = getSupabaseOrNull();
  const startedAt = nowIso();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .insert({
        room_id: roomId,
        initiator_user_id: input.userId,
        recipient_user_id: peerUserId,
        call_kind: input.callKind,
        status: "ringing",
        started_at: startedAt,
        updated_at: startedAt,
      })
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .single();
    if (!error && data) {
      return { ok: true, session: await mapCallSession(input.userId, data as CallSessionRow) };
    }
    if (!isMissingTableError(error)) {
      return { ok: false, error: String(error.message ?? "call_session_start_failed") };
    }
  }

  const dev = getDevState();
  const session: DevCallSession = {
    id: randomUUID(),
    roomId,
    initiatorUserId: input.userId,
    recipientUserId: peerUserId,
    callKind: input.callKind,
    status: "ringing",
    startedAt,
    answeredAt: null,
    endedAt: null,
    createdAt: startedAt,
  };
  dev.callSessions.unshift(session);
  return { ok: true, session: await mapCallSession(input.userId, session) };
}

export async function updateCommunityMessengerCallSession(input: {
  userId: string;
  sessionId: string;
  action: "accept" | "reject" | "cancel" | "end" | "missed";
  durationSeconds?: number;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  if (!sessionId) return { ok: false, error: "session_required" };

  const resolveNextStatus = (
    session: CallSessionRow | DevCallSession
  ): { nextStatus: CommunityMessengerCallSessionStatus; answeredAt?: string | null; endedAt?: string | null } | null => {
    const isDbSession = "initiator_user_id" in session;
    const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
    const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
    const status = (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus;

    if (input.action === "accept") {
      if (recipientUserId !== input.userId || status !== "ringing") return null;
      return { nextStatus: "active", answeredAt: nowIso() };
    }
    if (input.action === "reject") {
      if (recipientUserId !== input.userId || status !== "ringing") return null;
      return { nextStatus: "rejected", endedAt: nowIso() };
    }
    if (input.action === "cancel") {
      if (initiatorUserId !== input.userId || status !== "ringing") return null;
      return { nextStatus: "cancelled", endedAt: nowIso() };
    }
    if (input.action === "missed") {
      if (status !== "ringing") return null;
      if (initiatorUserId !== input.userId && recipientUserId !== input.userId) return null;
      return { nextStatus: "missed", endedAt: nowIso() };
    }
    if (status !== "active") return null;
    if (initiatorUserId !== input.userId && recipientUserId !== input.userId) return null;
    return { nextStatus: "ended", endedAt: nowIso() };
  };

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (row) {
      const session = row as CallSessionRow;
      const next = resolveNextStatus(session);
      if (!next) return { ok: false, error: "bad_action" };
      const updatePayload: Record<string, unknown> = {
        status: next.nextStatus,
        updated_at: nowIso(),
      };
      if (next.answeredAt) updatePayload.answered_at = next.answeredAt;
      if (next.endedAt) updatePayload.ended_at = next.endedAt;
      const { data: updated, error } = await (sb as any)
        .from("community_messenger_call_sessions")
        .update(updatePayload)
        .eq("id", sessionId)
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, call_kind, status, started_at, answered_at, ended_at, created_at"
        )
        .single();
      if (!error && updated) {
        const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
        if (isTerminalCallSessionStatus(mapped.status)) {
          const { data: existingLog } = await (sb as any)
            .from("community_messenger_call_logs")
            .select("id")
            .eq("session_id", sessionId)
            .maybeSingle();
          if (!existingLog) {
            const peerUserId = mapped.peerUserId;
            const durationSeconds = Math.max(0, Number(input.durationSeconds ?? 0));
            await createCommunityMessengerCallLog({
              userId: session.initiator_user_id,
              roomId: session.room_id,
              sessionId,
              peerUserId,
              callKind: session.call_kind,
              status:
                mapped.status === "ended"
                  ? "ended"
                  : mapped.status === "rejected"
                    ? "rejected"
                    : mapped.status === "cancelled"
                      ? "cancelled"
                      : "missed",
              durationSeconds,
            });
          }
        }
        return { ok: true, session: mapped };
      }
      if (!isMissingTableError(error)) {
        return { ok: false, error: String(error.message ?? "call_session_update_failed") };
      }
    }
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };
  const next = resolveNextStatus(session);
  if (!next) return { ok: false, error: "bad_action" };
  session.status = next.nextStatus;
  if (typeof next.answeredAt !== "undefined") session.answeredAt = next.answeredAt;
  if (typeof next.endedAt !== "undefined") session.endedAt = next.endedAt;
  const mapped = await mapCallSession(input.userId, session);
  if (isTerminalCallSessionStatus(mapped.status) && !dev.calls.some((item) => item.sessionId === sessionId)) {
    await createCommunityMessengerCallLog({
      userId: session.initiatorUserId,
      roomId: session.roomId,
      sessionId,
      peerUserId: session.recipientUserId,
      callKind: session.callKind,
      status:
        mapped.status === "ended"
          ? "ended"
          : mapped.status === "rejected"
            ? "rejected"
            : mapped.status === "cancelled"
              ? "cancelled"
              : "missed",
      durationSeconds: Math.max(0, Number(input.durationSeconds ?? 0)),
    });
  }
  return { ok: true, session: mapped };
}

export async function listCommunityMessengerCallSignals(
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSignal[]> {
  const id = trimText(sessionId);
  if (!id) return [];
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_signals")
      .select("id, session_id, room_id, from_user_id, to_user_id, signal_type, payload, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data && !error) {
      return (data as CallSignalRow[]).map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        roomId: row.room_id,
        fromUserId: row.from_user_id,
        toUserId: row.to_user_id,
        signalType: row.signal_type,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        createdAt: trimText(row.created_at) || nowIso(),
      }));
    }
  }
  return getDevState().callSignals
    .filter((item) => item.sessionId === id && (item.fromUserId === userId || item.toUserId === userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      roomId: row.roomId,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      signalType: row.signalType,
      payload: row.payload,
      createdAt: row.createdAt,
    }));
}

export async function listIncomingCommunityMessengerCallSessions(
  userId: string
): Promise<CommunityMessengerCallSession[]> {
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .eq("recipient_user_id", userId)
      .eq("status", "ringing")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data && !error) {
      const mapped = await Promise.all((data as CallSessionRow[]).map((row) => mapCallSession(userId, row)));
      return mapped;
    }
  }

  const dev = getDevState();
  const sessions = dev.callSessions
    .filter((item) => item.recipientUserId === userId && item.status === "ringing")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  return Promise.all(sessions.map((row) => mapCallSession(userId, row)));
}

export async function createCommunityMessengerCallSignal(input: {
  userId: string;
  sessionId: string;
  toUserId: string;
  signalType: CommunityMessengerCallSignalType;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; signal?: CommunityMessengerCallSignal; error?: string }> {
  const sessionId = trimText(input.sessionId);
  const toUserId = trimText(input.toUserId);
  if (!sessionId || !toUserId) return { ok: false, error: "bad_signal_target" };
  const sb = getSupabaseOrNull();

  const mapSignal = (row: CallSignalRow | DevCallSignal): CommunityMessengerCallSignal => {
    const isDbSignal = "session_id" in row;
    return {
      id: row.id,
      sessionId: isDbSignal ? row.session_id : row.sessionId,
      roomId: isDbSignal ? row.room_id : row.roomId,
      fromUserId: isDbSignal ? row.from_user_id : row.fromUserId,
      toUserId: isDbSignal ? row.to_user_id : row.toUserId,
      signalType: (isDbSignal ? row.signal_type : row.signalType) as CommunityMessengerCallSignalType,
      payload: ((isDbSignal ? row.payload : row.payload) ?? {}) as Record<string, unknown>,
      createdAt: trimText(isDbSignal ? row.created_at : row.createdAt) || nowIso(),
    };
  };

  if (sb) {
    const { data: session } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select("id, room_id, initiator_user_id, recipient_user_id, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return { ok: false, error: "session_not_found" };
    const row = session as CallSessionRow;
    const participants = [row.initiator_user_id, row.recipient_user_id];
    if (!participants.includes(input.userId) || !participants.includes(toUserId) || input.userId === toUserId) {
      return { ok: false, error: "forbidden" };
    }
    const { data, error } = await (sb as any)
      .from("community_messenger_call_signals")
      .insert({
        session_id: sessionId,
        room_id: row.room_id,
        from_user_id: input.userId,
        to_user_id: toUserId,
        signal_type: input.signalType,
        payload: input.payload,
      })
      .select("id, session_id, room_id, from_user_id, to_user_id, signal_type, payload, created_at")
      .single();
    if (!error && data) return { ok: true, signal: mapSignal(data as CallSignalRow) };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "signal_insert_failed") };
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "session_not_found" };
  const participants = [session.initiatorUserId, session.recipientUserId];
  if (!participants.includes(input.userId) || !participants.includes(toUserId) || input.userId === toUserId) {
    return { ok: false, error: "forbidden" };
  }
  const row: DevCallSignal = {
    id: randomUUID(),
    sessionId,
    roomId: session.roomId,
    fromUserId: input.userId,
    toUserId,
    signalType: input.signalType,
    payload: input.payload,
    createdAt: nowIso(),
  };
  dev.callSignals.push(row);
  return { ok: true, signal: mapSignal(row) };
}
