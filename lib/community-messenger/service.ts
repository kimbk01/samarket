import { randomUUID } from "crypto";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";
import { hashMeetingPassword, verifyMeetingPassword } from "@/lib/neighborhood/meeting-password";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallKind,
  CommunityMessengerCallLog,
  CommunityMessengerCallParticipant,
  CommunityMessengerCallParticipantStatus,
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerIdentityMode,
  CommunityMessengerRoomAliasProfile,
  CommunityMessengerCallSessionMode,
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionStatus,
  CommunityMessengerCallSignal,
  CommunityMessengerCallSignalType,
  CommunityMessengerRoomJoinPolicy,
  CommunityMessengerRoomIdentityPolicy,
  CommunityMessengerCallStatus,
  CommunityMessengerFriendRequest,
  CommunityMessengerFriendRequestStatus,
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
  CommunityMessengerRoomVisibility,
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
  visibility?: CommunityMessengerRoomVisibility | null;
  join_policy?: CommunityMessengerRoomJoinPolicy | null;
  identity_policy?: CommunityMessengerRoomIdentityPolicy | null;
  is_readonly?: boolean | null;
  title: string | null;
  summary?: string | null;
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

type RoomProfileRow = {
  id: string;
  room_id: string;
  user_id: string;
  identity_mode: CommunityMessengerIdentityMode;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  message_type: "text" | "image" | "system" | "call_stub" | "voice";
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

type CallSessionMetaRow = {
  id: string;
  room_id: string;
  session_mode: CommunityMessengerCallSessionMode | null;
};

type CallSessionRow = {
  id: string;
  room_id: string;
  initiator_user_id: string;
  recipient_user_id: string | null;
  session_mode?: CommunityMessengerCallSessionMode | null;
  max_participants?: number | null;
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

type CallSessionParticipantRow = {
  id: string;
  session_id: string;
  room_id: string;
  user_id: string;
  participation_status: CommunityMessengerCallParticipantStatus;
  joined_at: string | null;
  left_at: string | null;
  created_at: string | null;
};

type DevRoom = {
  id: string;
  roomType: CommunityMessengerRoomType;
  roomStatus: CommunityMessengerRoomStatus;
  visibility: CommunityMessengerRoomVisibility;
  joinPolicy: CommunityMessengerRoomJoinPolicy;
  identityPolicy: CommunityMessengerRoomIdentityPolicy;
  isReadonly: boolean;
  title: string;
  summary: string;
  avatarUrl: string | null;
  createdBy: string;
  ownerUserId: string;
  memberLimit: number | null;
  isDiscoverable: boolean;
  allowMemberInvite: boolean;
  passwordHash: string | null;
  directKey: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType: "text" | "image" | "system" | "call_stub" | "voice";
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

type DevRoomProfile = {
  id: string;
  roomId: string;
  userId: string;
  identityMode: CommunityMessengerIdentityMode;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
};

type DevMessage = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "system" | "call_stub" | "voice";
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
  sessionMode: CommunityMessengerCallSessionMode;
  initiatorUserId: string;
  recipientUserId: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  createdAt: string;
  participants: DevCallSessionParticipant[];
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

type DevCallSessionParticipant = {
  id: string;
  sessionId: string;
  roomId: string;
  userId: string;
  participationStatus: CommunityMessengerCallParticipantStatus;
  joinedAt: string | null;
  leftAt: string | null;
  createdAt: string;
};

type DevState = {
  friendRequests: RequestRow[];
  favoriteFriends: Map<string, Set<string>>;
  rooms: DevRoom[];
  participants: DevParticipant[];
  roomProfiles: DevRoomProfile[];
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
  return /does not exist|relation .* does not exist|schema cache|column .* does not exist|Could not find the .* column/i.test(
    message
  );
}

function isUniqueViolationError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "23505" || /duplicate key|unique constraint/i.test(message);
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
      roomProfiles: [],
      messages: [],
      calls: [],
      callSessions: [],
      callSignals: [],
    };
  }
  return scope.__samarketCommunityMessengerState;
}

function allowCommunityMessengerDevFallback(): boolean {
  return getPublicDeployTier() === "local";
}

function ensureCommunityMessengerDevFallbackAllowed(error = "messenger_storage_unavailable") {
  if (allowCommunityMessengerDevFallback()) return { ok: true as const };
  return { ok: false as const, error };
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

function roomProfileKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

async function fetchRoomProfilesByRoomIds(roomIds: string[]): Promise<Map<string, RoomProfileRow | DevRoomProfile>> {
  const uniqueRoomIds = dedupeIds(roomIds);
  const result = new Map<string, RoomProfileRow | DevRoomProfile>();
  if (!uniqueRoomIds.length) return result;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_room_profiles")
      .select("id, room_id, user_id, identity_mode, display_name, bio, avatar_url")
      .in("room_id", uniqueRoomIds);
    if (!error || !isMissingTableError(error)) {
      for (const row of (data ?? []) as RoomProfileRow[]) {
        result.set(roomProfileKey(row.room_id, row.user_id), row);
      }
      return result;
    }
  }
  const dev = getDevState();
  for (const row of dev.roomProfiles.filter((item) => uniqueRoomIds.includes(item.roomId))) {
    result.set(roomProfileKey(row.roomId, row.userId), row);
  }
  return result;
}

function resolveRoomProfileLite(
  baseProfile: CommunityMessengerProfileLite | undefined,
  roomProfile: RoomProfileRow | DevRoomProfile | undefined
): CommunityMessengerProfileLite | undefined {
  if (!baseProfile) return undefined;
  if (!roomProfile) return baseProfile;
  const isDbProfile = "room_id" in roomProfile;
  const identityMode = (isDbProfile ? roomProfile.identity_mode : roomProfile.identityMode) as CommunityMessengerIdentityMode;
  if (identityMode !== "alias") {
    return {
      ...baseProfile,
      identityMode: "real_name",
      aliasProfile: null,
    };
  }
  const displayName = trimText(isDbProfile ? roomProfile.display_name : roomProfile.displayName);
  const bio = trimText(isDbProfile ? roomProfile.bio : roomProfile.bio);
  const avatarUrl = trimText(isDbProfile ? roomProfile.avatar_url : roomProfile.avatarUrl) || baseProfile.avatarUrl;
  return {
    ...baseProfile,
    label: displayName || baseProfile.label,
    subtitle: bio || baseProfile.subtitle,
    avatarUrl,
    identityMode: "alias",
    aliasProfile: {
      displayName: displayName || baseProfile.label,
      bio,
      avatarUrl,
    },
  };
}

async function upsertRoomIdentityProfile(input: {
  userId: string;
  roomId: string;
  identityMode: CommunityMessengerIdentityMode;
  aliasProfile?: Partial<CommunityMessengerRoomAliasProfile> | null;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const aliasDisplayName = trimText(input.aliasProfile?.displayName);
  const aliasBio = trimText(input.aliasProfile?.bio);
  const aliasAvatarUrl = trimText(input.aliasProfile?.avatarUrl) || null;
  if (input.identityMode === "alias" && !aliasDisplayName) {
    return { ok: false, error: "alias_name_required" };
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const { error } = await (sb as any).from("community_messenger_room_profiles").upsert(
      {
        room_id: roomId,
        user_id: input.userId,
        identity_mode: input.identityMode,
        display_name: input.identityMode === "alias" ? aliasDisplayName : "",
        bio: input.identityMode === "alias" ? aliasBio : "",
        avatar_url: input.identityMode === "alias" ? aliasAvatarUrl : null,
        updated_at: nowIso(),
      },
      { onConflict: "room_id,user_id" }
    );
    if (!error) return { ok: true };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_profile_upsert_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed("messenger_migration_required");
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const existing = dev.roomProfiles.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (existing) {
    existing.identityMode = input.identityMode;
    existing.displayName = input.identityMode === "alias" ? aliasDisplayName : "";
    existing.bio = input.identityMode === "alias" ? aliasBio : "";
    existing.avatarUrl = input.identityMode === "alias" ? aliasAvatarUrl : null;
    return { ok: true };
  }
  dev.roomProfiles.push({
    id: randomUUID(),
    roomId,
    userId: input.userId,
    identityMode: input.identityMode,
    displayName: input.identityMode === "alias" ? aliasDisplayName : "",
    bio: input.identityMode === "alias" ? aliasBio : "",
    avatarUrl: input.identityMode === "alias" ? aliasAvatarUrl : null,
  });
  return { ok: true };
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

async function resolveCommunityMessengerGroupTitle(
  userId: string,
  memberIds: string[],
  rawTitle?: string
): Promise<string> {
  const explicitTitle = trimText(rawTitle);
  if (explicitTitle) return explicitTitle;

  const peerIds = dedupeIds(memberIds.filter((id) => id !== userId));
  if (!peerIds.length) return `그룹 ${memberIds.length}명`;

  const peers = await hydrateProfiles(userId, peerIds);
  const labels = peers
    .map((peer) => trimText(peer.label))
    .filter(Boolean)
    .slice(0, 3);

  if (!labels.length) return `그룹 ${memberIds.length}명`;
  if (peerIds.length > labels.length) return `${labels.join(", ")} 외 ${peerIds.length - labels.length}명`;
  return labels.join(", ");
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
  participants: Array<ParticipantRow | DevParticipant>,
  roomProfileMap?: Map<string, RoomProfileRow | DevRoomProfile>
): Promise<CommunityMessengerRoomSummary> {
  const roomId = room.id;
  const isDbRoom = "room_type" in room;
  const roomType = (isDbRoom ? room.room_type : room.roomType) as CommunityMessengerRoomType;
  const roomStatus = normalizeRoomStatus(isDbRoom ? room.room_status : room.roomStatus);
  const visibility = normalizeRoomVisibility(isDbRoom ? room.visibility : room.visibility, roomType);
  const joinPolicy = normalizeRoomJoinPolicy(isDbRoom ? room.join_policy : room.joinPolicy, roomType);
  const identityPolicy = normalizeRoomIdentityPolicy(isDbRoom ? room.identity_policy : room.identityPolicy, roomType);
  const isReadonly = isDbRoom ? room.is_readonly === true : room.isReadonly;
  const roomTitle = trimText(isDbRoom ? room.title : room.title);
  const roomSummary = trimText(isDbRoom ? room.summary : room.summary);
  const roomAvatar = trimText(isDbRoom ? room.avatar_url : room.avatarUrl) || null;
  const roomLastMessage = trimText(isDbRoom ? room.last_message : room.lastMessage);
  const roomLastAt = trimText(isDbRoom ? room.last_message_at : room.lastMessageAt) || nowIso();
  const ownerUserId = trimText(isDbRoom ? room.owner_user_id : room.ownerUserId) || trimText(isDbRoom ? room.created_by : room.createdBy) || null;
  const memberLimitRaw = isDbRoom ? room.member_limit : room.memberLimit;
  const memberLimit = typeof memberLimitRaw === "number" && Number.isFinite(memberLimitRaw) ? memberLimitRaw : null;
  const isDiscoverable = isDbRoom ? room.is_discoverable === true : room.isDiscoverable;
  const allowMemberInvite = isDbRoom ? room.allow_member_invite !== false : room.allowMemberInvite;
  const requiresPassword =
    joinPolicy === "password" &&
    trimText(isDbRoom ? room.password_hash : room.passwordHash).length > 0;
  const me = participants.find((item) => ("user_id" in item ? item.user_id : item.userId) === userId);
  const memberIds = dedupeIds(
    participants.map((item) => ("user_id" in item ? item.user_id : item.userId))
  );
  const peers = memberIds.filter((id) => id !== userId);
  const peerProfiles = await hydrateProfiles(userId, peers);
  const memberProfilesRaw = await hydrateProfiles(userId, memberIds, { includeSelf: true });
  const memberProfiles = memberProfilesRaw.map((profile) =>
    resolveRoomProfileLite(profile, roomProfileMap?.get(roomProfileKey(roomId, profile.id))) ?? profile
  );
  const ownerLabel =
    (ownerUserId ? memberProfiles.find((profile) => profile.id === ownerUserId)?.label : "") ||
    (ownerUserId ? profileLabel(null, ownerUserId) : "-");
  const defaultDirectTitle = peerProfiles[0]?.label ?? "새 대화";
  const title =
    roomType === "direct"
      ? defaultDirectTitle
      : roomTitle || (roomType === "open_group" ? "공개 그룹방" : `그룹 ${memberIds.length}명`);
  const subtitle =
    roomType === "direct"
      ? peerProfiles[0]?.subtitle ?? "친구와 나누는 대화"
      : roomType === "open_group"
        ? `공개 그룹 · ${memberIds.length}명 참여 중`
        : `${memberIds.length}명 참여 중`;
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
    avatarUrl: roomAvatar || peerProfiles[0]?.avatarUrl || null,
    unreadCount: Math.max(0, Number(("unread_count" in (me ?? {}) ? (me as ParticipantRow).unread_count : (me as DevParticipant | undefined)?.unreadCount) ?? 0)),
    lastMessage: roomLastMessage || (roomType === "direct" ? "메시지를 보내 보세요." : "그룹 대화를 시작해 보세요."),
    lastMessageAt: roomLastAt,
    memberCount: memberIds.length,
    ownerUserId,
    ownerLabel,
    memberLimit,
    isDiscoverable,
    requiresPassword,
    allowMemberInvite,
    myIdentityMode: resolveRoomProfileLite(
      memberProfilesRaw.find((profile) => profile.id === userId),
      roomProfileMap?.get(roomProfileKey(roomId, userId))
    )?.identityMode,
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
            .select(
              "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, password_hash, last_message, last_message_at, last_message_type"
            )
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

  const roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
  const summaries = await Promise.all(
    roomRows.map((room) => mapRoomSummary(userId, room, byRoomId.get(room.id) ?? [], roomProfileMap))
  );
  return {
    chats: summaries.filter((room) => room.roomType === "direct"),
    groups: summaries.filter((room) => isCommunityMessengerGroupRoomType(room.roomType)),
  };
}

async function loadRoomSummaryMap(
  userId: string,
  roomIds: string[]
): Promise<Map<string, CommunityMessengerRoomSummary>> {
  const uniqueRoomIds = dedupeIds(roomIds);
  const result = new Map<string, CommunityMessengerRoomSummary>();
  if (!uniqueRoomIds.length) return result;

  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];

  if (sb) {
    const [{ data: rooms, error: roomsError }, { data: participants }] = await Promise.all([
      (sb as any)
        .from("community_messenger_rooms")
        .select(
          "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, password_hash, last_message, last_message_at, last_message_type"
        )
        .in("id", uniqueRoomIds),
      (sb as any)
        .from("community_messenger_participants")
        .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, joined_at")
        .in("room_id", uniqueRoomIds),
    ]);
    if (!roomsError || !isMissingTableError(roomsError)) {
      roomRows = (rooms ?? []) as RoomRow[];
      participantRows = (participants ?? []) as ParticipantRow[];
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    roomRows = dev.rooms.filter((room) => uniqueRoomIds.includes(room.id));
    participantRows = dev.participants.filter((participant) => uniqueRoomIds.includes(participant.roomId));
  }

  const participantsByRoom = new Map<string, Array<ParticipantRow | DevParticipant>>();
  for (const participant of participantRows) {
    const roomId = "room_id" in participant ? participant.room_id : participant.roomId;
    const list = participantsByRoom.get(roomId) ?? [];
    list.push(participant);
    participantsByRoom.set(roomId, list);
  }

  const roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
  const summaries = await Promise.all(
    roomRows.map((room) => mapRoomSummary(userId, room, participantsByRoom.get(room.id) ?? [], roomProfileMap))
  );
  for (const summary of summaries) {
    result.set(summary.id, summary);
  }
  return result;
}

export async function listDiscoverableOpenGroupRooms(
  userId: string,
  query?: string
): Promise<CommunityMessengerDiscoverableGroupSummary[]> {
  const keyword = trimText(query).toLowerCase();
  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];
  let joinedRoomIds = new Set<string>();

  if (sb) {
    const [{ data: rooms, error: roomsError }, { data: participants }, { data: myParticipants }] = await Promise.all([
      (sb as any)
        .from("community_messenger_rooms")
        .select(
          "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, password_hash, last_message, last_message_at, last_message_type"
        )
        .eq("room_type", "open_group")
        .eq("is_discoverable", true)
        .order("last_message_at", { ascending: false })
        .limit(50),
      (sb as any)
        .from("community_messenger_participants")
        .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, joined_at")
        .limit(2000),
      (sb as any)
        .from("community_messenger_participants")
        .select("room_id")
        .eq("user_id", userId),
    ]);
    if (!roomsError || !isMissingTableError(roomsError)) {
      roomRows = (rooms ?? []) as RoomRow[];
      const roomIds = new Set(roomRows.map((room) => room.id));
      participantRows = ((participants ?? []) as ParticipantRow[]).filter((row) => roomIds.has(row.room_id));
      joinedRoomIds = new Set(
        ((myParticipants ?? []) as Array<{ room_id?: string | null }>)
          .map((row) => trimText(row.room_id))
          .filter(Boolean)
      );
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    roomRows = dev.rooms
      .filter((room) => room.roomType === "open_group" && room.isDiscoverable)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    participantRows = dev.participants.filter((participant) =>
      roomRows.some((room) => room.id === participant.roomId)
    );
    joinedRoomIds = new Set(
      dev.participants.filter((participant) => participant.userId === userId).map((participant) => participant.roomId)
    );
  }

  const byRoomId = new Map<string, Array<ParticipantRow | DevParticipant>>();
  for (const participant of participantRows) {
    const roomId = "room_id" in participant ? participant.room_id : participant.roomId;
    const list = byRoomId.get(roomId) ?? [];
    list.push(participant);
    byRoomId.set(roomId, list);
  }

  const roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
  const summaries = await Promise.all(
    roomRows.map(async (room) => {
      const summary = await mapRoomSummary(userId, room, byRoomId.get(room.id) ?? [], roomProfileMap);
      if (summary.roomType !== "open_group") return null;
      if (keyword) {
        const haystack = [summary.title, summary.summary, summary.ownerLabel].join(" ").toLowerCase();
        if (!haystack.includes(keyword)) return null;
      }
      return {
        id: summary.id,
        roomType: "open_group" as const,
        roomStatus: summary.roomStatus,
        visibility: "public" as const,
        joinPolicy: summary.joinPolicy === "free" ? "free" : "password",
        identityPolicy: summary.identityPolicy,
        title: summary.title,
        summary: summary.summary,
        ownerUserId: summary.ownerUserId,
        ownerLabel: summary.ownerLabel,
        memberCount: summary.memberCount,
        memberLimit: summary.memberLimit,
        isDiscoverable: summary.isDiscoverable,
        requiresPassword: summary.requiresPassword,
        lastMessage: summary.lastMessage,
        lastMessageAt: summary.lastMessageAt,
        isJoined: joinedRoomIds.has(summary.id),
      };
    })
  );

  return summaries.filter(Boolean) as CommunityMessengerDiscoverableGroupSummary[];
}

export async function getOpenGroupJoinPreview(
  userId: string,
  roomId: string
): Promise<{ ok: boolean; group?: CommunityMessengerDiscoverableGroupSummary; error?: string }> {
  const groups = await listDiscoverableOpenGroupRooms(userId);
  const group = groups.find((item) => item.id === trimText(roomId));
  if (!group) return { ok: false, error: "room_not_found" };
  return { ok: true, group };
}

async function listCalls(userId: string): Promise<CommunityMessengerCallLog[]> {
  const sb = getSupabaseOrNull();
  let rows: Array<CallRow | DevCall> = [];
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_logs")
      .select("id, session_id, room_id, caller_user_id, peer_user_id, call_kind, status, duration_seconds, started_at")
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
  const roomMetaMap = new Map(
    (
      await loadRoomSummaryMap(
        userId,
        rows
          .map((row) => ("room_id" in row ? row.room_id : row.roomId) ?? "")
          .filter((value): value is string => Boolean(value))
      )
    ).entries()
  );
  const sessionIds = dedupeIds(
    rows
      .map((row) => {
        const isDbCall = "caller_user_id" in row;
        return (isDbCall ? row.session_id : row.sessionId) ?? "";
      })
      .filter(Boolean)
  );
  const sessionMap = new Map<string, CallSessionMetaRow | DevCallSession>();
  const participantsBySession = new Map<string, CommunityMessengerCallParticipant[]>();
  if (sb && sessionIds.length) {
    const [{ data: sessionRows }, { data: sessionParticipantRows }] = await Promise.all([
      (sb as any)
        .from("community_messenger_call_sessions")
        .select("id, room_id, session_mode")
        .in("id", sessionIds),
      (sb as any)
        .from("community_messenger_call_session_participants")
        .select("session_id, user_id, participation_status, joined_at, left_at, created_at")
        .in("session_id", sessionIds),
    ]);
    for (const session of (sessionRows ?? []) as CallSessionMetaRow[]) {
      sessionMap.set(session.id, session);
    }
    const participantRows = (sessionParticipantRows ?? []) as Array<{
      session_id?: string | null;
      user_id?: string | null;
      participation_status?: CommunityMessengerCallParticipantStatus | null;
      joined_at?: string | null;
      left_at?: string | null;
    }>;
    const participantIds = dedupeIds(
      participantRows.map((row) => row.user_id ?? "").filter(Boolean)
    );
    const participantProfiles = await hydrateProfiles(userId, participantIds, { includeSelf: true });
    const participantProfileMap = new Map(participantProfiles.map((profile) => [profile.id, profile]));
    for (const row of participantRows) {
      const sessionId = trimText(row.session_id) || "";
      const participantUserId = trimText(row.user_id) || "";
      if (!sessionId || !participantUserId) continue;
      const list = participantsBySession.get(sessionId) ?? [];
      const profile = participantProfileMap.get(participantUserId);
      list.push({
        userId: participantUserId,
        label: profile?.label ?? profileLabel(null, participantUserId),
        status: (trimText(row.participation_status) as CommunityMessengerCallParticipantStatus) || "invited",
        joinedAt: trimText(row.joined_at) || null,
        leftAt: trimText(row.left_at) || null,
        isMe: participantUserId === userId,
      });
      participantsBySession.set(sessionId, list);
    }
  } else {
    for (const session of getDevState().callSessions.filter((item) => sessionIds.includes(item.id))) {
      sessionMap.set(session.id, session);
      const participants = await loadCallSessionParticipants(userId, session);
      participantsBySession.set(session.id, participants);
    }
  }

  return rows.map((row) => {
    const isDbCall = "caller_user_id" in row;
    const roomId = (isDbCall ? row.room_id : row.roomId) ?? null;
    const sessionId = (isDbCall ? row.session_id : row.sessionId) ?? null;
    const peerUserId = (isDbCall ? row.peer_user_id : row.peerUserId) ?? null;
    const peer = peerUserId ? peerMap.get(peerUserId) : undefined;
    const startedAt = trimText(isDbCall ? row.started_at : row.startedAt) || nowIso();
    const session = sessionId ? sessionMap.get(sessionId) : null;
    const roomMeta = roomId ? roomMetaMap.get(roomId) : null;
    const sessionMode =
      session && "session_mode" in session
        ? (session.session_mode ?? "direct")
        : session
          ? session.sessionMode
          : roomMeta?.roomType && roomMeta.roomType !== "direct"
            ? "group"
            : "direct";
    const participants = sessionId ? participantsBySession.get(sessionId) ?? [] : [];
    const participantLabels = participants
      .filter((participant) => !participant.isMe)
      .map((participant) => participant.label);
    const participantCount =
      sessionMode === "group" ? Math.max(participants.length, Number(roomMeta?.memberCount ?? 0), 2) : 2;
    const title =
      sessionMode === "group"
        ? roomMeta?.title ?? "그룹 통화"
        : roomId
          ? roomMeta?.title ?? peer?.label ?? "통화"
          : peer?.label ?? "통화";
    const groupPeerLabel =
      participantLabels.length > 1
        ? `${participantLabels[0]} 외 ${participantLabels.length - 1}명`
        : participantLabels[0] ?? `${participantCount}명 그룹`;
    return {
      id: row.id,
      roomId,
      sessionMode,
      title,
      peerLabel: sessionMode === "group" ? groupPeerLabel : peer?.label ?? "상대",
      peerUserId,
      participantCount,
      participantLabels,
      callKind: (isDbCall ? row.call_kind : row.callKind) as CommunityMessengerCallKind,
      status: row.status as CommunityMessengerCallStatus,
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

async function loadCallSessionParticipants(
  userId: string,
  session: CallSessionRow | DevCallSession,
  /** 방금 insert 직후에는 DB 재조회 없이 메모리 행으로 매핑해 발신 API 지연을 줄인다 */
  preloadedDbRows?: CallSessionParticipantRow[] | null
): Promise<CommunityMessengerCallParticipant[]> {
  const isDbSession = "initiator_user_id" in session;
  const sessionId = session.id;
  const fallbackIds = dedupeIds(
    (isDbSession
      ? [session.initiator_user_id, session.recipient_user_id]
      : [session.initiatorUserId, session.recipientUserId]
    ).filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  let rows: Array<CallSessionParticipantRow | DevCallSessionParticipant> = [];
  if (preloadedDbRows && preloadedDbRows.length > 0) {
    rows = preloadedDbRows;
  }
  const sb = getSupabaseOrNull();
  if (!rows.length && isDbSession && sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (data && !error) {
      rows = data as CallSessionParticipantRow[];
    }
  } else if (!isDbSession) {
    rows = session.participants;
  }

  if (!rows.length) {
    const startedAt = trimText(isDbSession ? session.started_at : session.startedAt) || nowIso();
    const endedAt = trimText(isDbSession ? session.ended_at : session.endedAt) || null;
    const status = (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus;
    rows = fallbackIds.map((memberId) => ({
      id: `${sessionId}:${memberId}`,
      session_id: sessionId,
      room_id: isDbSession ? session.room_id : session.roomId,
      user_id: memberId,
      participation_status:
        status === "active"
          ? "joined"
          : status === "rejected" && memberId === (isDbSession ? session.recipient_user_id : session.recipientUserId)
            ? "rejected"
            : status === "ended" || status === "missed" || status === "cancelled"
              ? "left"
              : "invited",
      joined_at: status === "active" ? trimText(isDbSession ? session.answered_at : session.answeredAt) || startedAt : null,
      left_at: status === "ended" || status === "missed" || status === "cancelled" || status === "rejected" ? endedAt : null,
      created_at: startedAt,
    })) as CallSessionParticipantRow[];
  }

  const memberIds = dedupeIds(rows.map((row) => ("user_id" in row ? row.user_id : row.userId)));
  const profiles = await hydrateProfiles(userId, memberIds, { includeSelf: true });
  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  return rows.map((row) => {
    const isDbRow = "user_id" in row;
    const participantUserId = isDbRow ? row.user_id : row.userId;
    const profile = profileMap.get(participantUserId);
    return {
      userId: participantUserId,
      label: profile?.label ?? profileLabel(null, participantUserId),
      status: (isDbRow ? row.participation_status : row.participationStatus) as CommunityMessengerCallParticipantStatus,
      joinedAt: trimText(isDbRow ? row.joined_at : row.joinedAt) || null,
      leftAt: trimText(isDbRow ? row.left_at : row.leftAt) || null,
      isMe: participantUserId === userId,
    };
  });
}

async function mapCallSession(
  userId: string,
  session: CallSessionRow | DevCallSession,
  preloadedParticipantRows?: CallSessionParticipantRow[] | null
): Promise<CommunityMessengerCallSession> {
  const isDbSession = "initiator_user_id" in session;
  const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
  const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
  const sessionMode = ((isDbSession ? session.session_mode : session.sessionMode) ?? "direct") as CommunityMessengerCallSessionMode;
  const participants = await loadCallSessionParticipants(userId, session, preloadedParticipantRows);
  const peerUserId =
    sessionMode === "direct"
      ? messengerUserIdsEqual(initiatorUserId, userId)
        ? recipientUserId
        : initiatorUserId
      : null;
  const profiles = peerUserId ? await hydrateProfiles(userId, [peerUserId]) : [];
  const peer = profiles[0];
  const joinedCount = participants.filter((item) => item.status === "joined").length;
  const peerLabel =
    sessionMode === "group"
      ? joinedCount > 1
        ? `그룹 통화 · ${joinedCount}명 참여 중`
        : "그룹 통화"
      : (peer?.label ?? profileLabel(null, peerUserId ?? initiatorUserId));

  return {
    id: session.id,
    roomId: isDbSession ? session.room_id : session.roomId,
    sessionMode,
    initiatorUserId,
    recipientUserId,
    peerUserId,
    peerLabel,
    callKind: (isDbSession ? session.call_kind : session.callKind) as CommunityMessengerCallKind,
    status: (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus,
    startedAt: trimText(isDbSession ? session.started_at : session.startedAt) || nowIso(),
    answeredAt: trimText(isDbSession ? session.answered_at : session.answeredAt) || null,
    endedAt: trimText(isDbSession ? session.ended_at : session.endedAt) || null,
    isMineInitiator: messengerUserIdsEqual(initiatorUserId, userId),
    participants,
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
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
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

export async function getCommunityMessengerCallSessionById(
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSession | null> {
  const id = trimText(sessionId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (data && !error) {
      const row = data as CallSessionRow;
      const { data: participantRows } = await (sb as any)
        .from("community_messenger_call_session_participants")
        .select("user_id")
        .eq("session_id", id);
      const participants = dedupeIds(
        ((participantRows ?? []) as Array<{ user_id?: string | null }>)
          .map((item) => item.user_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      );
      const mode = trimText(row.session_mode ?? "") || "direct";
      const canRead =
        callSessionParticipantsContain(participants, userId) ||
        (mode === "direct" &&
          (messengerUserIdsEqual(row.initiator_user_id, userId) ||
            messengerUserIdsEqual(row.recipient_user_id, userId)));
      if (!canRead) return null;
      return mapCallSession(userId, row);
    }
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === id);
  if (!session) return null;
  const participants = dedupeIds(session.participants.map((item) => item.userId));
  const canRead =
    callSessionParticipantsContain(participants, userId) ||
    (session.sessionMode === "direct" &&
      (messengerUserIdsEqual(session.initiatorUserId, userId) ||
        messengerUserIdsEqual(session.recipientUserId, userId)));
  if (!canRead) return null;
  return mapCallSession(userId, session);
}

function formatCommunityMessengerCallStubStatus(status: CommunityMessengerCallStatus): string {
  if (status === "missed") return "부재중";
  if (status === "rejected") return "거절됨";
  if (status === "cancelled") return "취소됨";
  if (status === "ended") return "통화 종료";
  if (status === "incoming") return "수신 중";
  return "발신 중";
}

function buildCommunityMessengerCallStubLabel(
  callKind: CommunityMessengerCallKind,
  status: CommunityMessengerCallStatus
): string {
  return `${callKind === "video" ? "영상 통화" : "음성 통화"} · ${formatCommunityMessengerCallStubStatus(status)}`;
}

function isCallStubRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasMatchingCallStubSessionId(metadata: unknown, sessionId: string | null | undefined): boolean {
  if (!sessionId || !isCallStubRecord(metadata)) return false;
  return trimText(metadata.sessionId) === sessionId;
}

async function appendCallStubMessage(input: {
  userId: string;
  roomId: string | null;
  sessionId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  createdAt: string;
  replaceExisting?: boolean;
  incrementUnread?: boolean;
}) {
  if (!input.roomId) return;
  const label = buildCommunityMessengerCallStubLabel(input.callKind, input.status);
  const metadata = {
    callKind: input.callKind,
    callStatus: input.status,
    sessionId: trimText(input.sessionId ?? "") || null,
  };
  const shouldIncrementUnread = input.incrementUnread ?? true;
  const sb = getSupabaseOrNull();
  if (sb) {
    if (input.replaceExisting && input.sessionId) {
      const { data: existingRows } = await (sb as any)
        .from("community_messenger_messages")
        .select("id, metadata")
        .eq("room_id", input.roomId)
        .eq("message_type", "call_stub")
        .order("created_at", { ascending: false })
        .limit(20);
      const existingRow = ((existingRows ?? []) as Array<{ id: string; metadata?: unknown }>).find((row) =>
        hasMatchingCallStubSessionId(row.metadata, input.sessionId)
      );
      if (existingRow) {
        await (sb as any)
          .from("community_messenger_messages")
          .update({
            content: label,
            metadata,
            created_at: input.createdAt,
          })
          .eq("id", existingRow.id);
        await (sb as any)
          .from("community_messenger_rooms")
          .update({
            last_message: label,
            last_message_at: input.createdAt,
            last_message_type: "call_stub",
            updated_at: input.createdAt,
          })
          .eq("id", input.roomId);
        return;
      }
    }
    await (sb as any).from("community_messenger_messages").insert({
      room_id: input.roomId,
      sender_id: input.userId,
      message_type: "call_stub",
      content: label,
      metadata,
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
    if (!shouldIncrementUnread) return;
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
  if (input.replaceExisting && input.sessionId) {
    const existingMessage = [...dev.messages]
      .reverse()
      .find(
        (item) =>
          item.roomId === input.roomId &&
          item.messageType === "call_stub" &&
          hasMatchingCallStubSessionId(item.metadata, input.sessionId)
      );
    if (existingMessage) {
      existingMessage.content = label;
      existingMessage.metadata = metadata;
      existingMessage.createdAt = input.createdAt;
      const room = dev.rooms.find((item) => item.id === input.roomId);
      if (room) {
        room.lastMessage = label;
        room.lastMessageAt = input.createdAt;
        room.lastMessageType = "call_stub";
      }
      return;
    }
  }
  dev.messages.push({
    id: randomUUID(),
    roomId: input.roomId,
    senderId: input.userId,
    messageType: "call_stub",
    content: label,
    metadata,
    createdAt: input.createdAt,
  });
  const room = dev.rooms.find((item) => item.id === input.roomId);
  if (room) {
    room.lastMessage = label;
    room.lastMessageAt = input.createdAt;
    room.lastMessageType = "call_stub";
  }
  if (!shouldIncrementUnread) return;
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
  const [me, friendIds, followingIds, blockedIds, requests, rooms, discoverableGroups, calls] = await Promise.all([
    hydrateSelfProfile(userId),
    listAcceptedFriendIds(userId),
    listFollowingIds(userId, "neighbor_follow"),
    listFollowingIds(userId, "blocked"),
    listFriendRequests(userId),
    listRooms(userId),
    listDiscoverableOpenGroupRooms(userId),
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
    discoverableGroups,
    calls,
  };
}

export async function listCommunityMessengerFriends(userId: string): Promise<CommunityMessengerProfileLite[]> {
  const friendIds = await listAcceptedFriendIds(userId);
  return hydrateProfiles(userId, friendIds);
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

async function validateCommunityMessengerGroupTargets(
  userId: string,
  memberIds: string[]
): Promise<{ ok: true; memberIds: string[] } | { ok: false; error: string }> {
  const peerIds = dedupeIds(memberIds.filter((id) => id && id !== userId));
  if (!peerIds.length) return { ok: false, error: "members_required" };

  const checks = await Promise.all(
    peerIds.map(async (memberId) => ({
      memberId,
      isFriend: await isFriend(userId, memberId),
      allowedByBlock: await ensureNoBlockedEitherWay(userId, memberId),
    }))
  );

  if (checks.some((item) => !item.allowedByBlock)) return { ok: false, error: "blocked_target" };
  if (checks.some((item) => !item.isFriend)) return { ok: false, error: "friend_required" };
  return { ok: true, memberIds: peerIds };
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
  if (!(await isFriend(userId, peerId))) return { ok: false, error: "friend_required" };
  if (!(await ensureNoBlockedEitherWay(userId, peerId))) {
    return { ok: false, error: "blocked_target" };
  }
  const directKey = directKeyFor(userId, peerId);
  const sb = getSupabaseOrNull();
  if (sb) {
    const loadExistingRoomId = async () => {
      const { data } = await (sb as any)
        .from("community_messenger_rooms")
        .select("id")
        .eq("room_type", "direct")
        .eq("direct_key", directKey)
        .maybeSingle();
      return typeof data?.id === "string" ? (data.id as string) : null;
    };
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
        const { error: participantError } = await (sb as any).from("community_messenger_participants").insert([
          { room_id: roomId, user_id: userId, role: "owner" },
          { room_id: roomId, user_id: peerId, role: "member" },
        ]);
        if (!participantError) {
          return { ok: true, roomId };
        }
        await (sb as any).from("community_messenger_rooms").delete().eq("id", roomId);
        return { ok: false, error: String(participantError.message ?? "room_participant_create_failed") };
      }
      if (isUniqueViolationError(roomError)) {
        const roomId = await loadExistingRoomId();
        if (roomId) return { ok: true, roomId };
      }
      if (!isMissingTableError(roomError)) {
        return { ok: false, error: String(roomError.message ?? "room_create_failed") };
      }
    }
    if (isUniqueViolationError(existingError)) {
      const roomId = await loadExistingRoomId();
      if (roomId) return { ok: true, roomId };
    }
    if (existingError && !isMissingTableError(existingError)) {
      return { ok: false, error: String(existingError.message ?? "room_lookup_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const existing = dev.rooms.find((room) => room.roomType === "direct" && room.directKey === directKey);
  if (existing) return { ok: true, roomId: existing.id };
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    summary: "",
    avatarUrl: null,
    createdBy: userId,
    ownerUserId: userId,
    memberLimit: 2,
    isDiscoverable: false,
    allowMemberInvite: false,
    passwordHash: null,
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

export async function createPrivateGroupRoom(input: {
  userId: string;
  title: string;
  memberIds: string[];
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const memberIds = dedupeIds([input.userId, ...input.memberIds]);
  if (memberIds.length < 2) return { ok: false, error: "members_required" };
  const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
  if (!memberValidation.ok) return memberValidation;
  const title = await resolveCommunityMessengerGroupTitle(input.userId, memberIds, input.title);
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .insert({
        room_type: "private_group",
        room_status: "active",
        visibility: "private",
        join_policy: "invite_only",
        is_readonly: false,
        created_by: input.userId,
        owner_user_id: input.userId,
        title,
        summary: "",
        is_discoverable: false,
        allow_member_invite: true,
        last_message: "",
        last_message_type: "system",
      })
      .select("id")
      .single();
    if (!roomError) {
      const roomId = room.id as string;
      const { error: participantError } = await (sb as any).from("community_messenger_participants").insert(
        memberIds.map((memberId) => ({
          room_id: roomId,
          user_id: memberId,
          role: memberId === input.userId ? "owner" : "member",
        }))
      );
      if (!participantError) {
        return { ok: true, roomId };
      }
      await (sb as any).from("community_messenger_rooms").delete().eq("id", roomId);
      return { ok: false, error: String(participantError.message ?? "group_participant_create_failed") };
    }
    if (!isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "group_create_failed") };
    }
    const { data: legacyRoom, error: legacyRoomError } = await (sb as any)
      .from("community_messenger_rooms")
      .insert({
        room_type: "group",
        created_by: input.userId,
        title,
        last_message: "",
        last_message_type: "system",
      })
      .select("id")
      .single();
    if (!legacyRoomError) {
      const roomId = legacyRoom.id as string;
      const { error: participantError } = await (sb as any).from("community_messenger_participants").insert(
        memberIds.map((memberId) => ({
          room_id: roomId,
          user_id: memberId,
          role: memberId === input.userId ? "owner" : "member",
        }))
      );
      if (!participantError) return { ok: true, roomId };
      await (sb as any).from("community_messenger_rooms").delete().eq("id", roomId);
      return { ok: false, error: String(participantError.message ?? "group_participant_create_failed") };
    }
    return { ok: false, error: "messenger_migration_required" };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "private_group",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title,
    summary: "",
    avatarUrl: null,
    createdBy: input.userId,
    ownerUserId: input.userId,
    memberLimit: memberIds.length,
    isDiscoverable: false,
    allowMemberInvite: true,
    passwordHash: null,
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

export async function createOpenGroupRoom(input: {
  userId: string;
  title: string;
  summary?: string;
  password?: string;
  memberLimit?: number;
  isDiscoverable?: boolean;
  joinPolicy?: Extract<CommunityMessengerRoomJoinPolicy, "password" | "free">;
  identityPolicy?: CommunityMessengerRoomIdentityPolicy;
  creatorIdentityMode?: CommunityMessengerIdentityMode;
  creatorAliasProfile?: Partial<CommunityMessengerRoomAliasProfile> | null;
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const title = trimText(input.title);
  const summary = trimText(input.summary);
  const password = trimText(input.password);
  const memberLimit = Math.min(1000, Math.max(2, Math.floor(Number(input.memberLimit ?? 200) || 200)));
  const isDiscoverable = input.isDiscoverable !== false;
  const joinPolicy = input.joinPolicy === "free" ? "free" : "password";
  const identityPolicy = input.identityPolicy === "real_name" ? "real_name" : "alias_allowed";
  const creatorIdentityMode =
    input.creatorIdentityMode === "alias" && identityPolicy === "alias_allowed" ? "alias" : "real_name";
  if (!title) return { ok: false, error: "title_required" };
  if (joinPolicy === "password" && !password) return { ok: false, error: "password_required" };
  if (creatorIdentityMode === "alias" && !trimText(input.creatorAliasProfile?.displayName)) {
    return { ok: false, error: "alias_name_required" };
  }
  const passwordHash = joinPolicy === "password" ? hashMeetingPassword(password) : null;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .insert({
        room_type: "open_group",
        room_status: "active",
        visibility: "public",
        join_policy: joinPolicy,
        identity_policy: identityPolicy,
        is_readonly: false,
        created_by: input.userId,
        owner_user_id: input.userId,
        title,
        summary,
        password_hash: passwordHash,
        member_limit: memberLimit,
        is_discoverable: isDiscoverable,
        allow_member_invite: false,
        last_message: "",
        last_message_type: "system",
      })
      .select("id")
      .single();
    if (!roomError) {
      const roomId = room.id as string;
      const { error: participantError } = await (sb as any).from("community_messenger_participants").insert({
        room_id: roomId,
        user_id: input.userId,
        role: "owner",
      });
      if (!participantError) {
        const roomProfile = await upsertRoomIdentityProfile({
          userId: input.userId,
          roomId,
          identityMode: creatorIdentityMode,
          aliasProfile: input.creatorAliasProfile,
        });
        if (roomProfile.ok) return { ok: true, roomId };
        return roomProfile;
      }
      await (sb as any).from("community_messenger_rooms").delete().eq("id", roomId);
      return { ok: false, error: String(participantError.message ?? "open_group_participant_create_failed") };
    }
    if (!isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "open_group_create_failed") };
    }
    return { ok: false, error: "messenger_migration_required" };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "open_group",
    roomStatus: "active",
    visibility: "public",
    joinPolicy,
    identityPolicy,
    isReadonly: false,
    title,
    summary,
    avatarUrl: null,
    createdBy: input.userId,
    ownerUserId: input.userId,
    memberLimit,
    isDiscoverable,
    allowMemberInvite: false,
    passwordHash,
    directKey: null,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  dev.participants.push({
    id: randomUUID(),
    roomId,
    userId: input.userId,
    role: "owner",
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    joinedAt: createdAt,
  });
  const roomProfile = await upsertRoomIdentityProfile({
    userId: input.userId,
    roomId,
    identityMode: creatorIdentityMode,
    aliasProfile: input.creatorAliasProfile,
  });
  if (!roomProfile.ok) return roomProfile;
  return { ok: true, roomId };
}

export async function createCommunityMessengerGroupRoom(input: {
  userId: string;
  title: string;
  memberIds: string[];
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  return createPrivateGroupRoom(input);
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
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, room_status, is_readonly, allow_member_invite")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room && room.room_type !== "private_group") return { ok: false, error: "not_group_room" };
    if (room && ((room.room_status ?? "active") !== "active" || room.is_readonly === true)) {
      return { ok: false, error: "room_unavailable" };
    }
    if (room && room.allow_member_invite === false) return { ok: false, error: "forbidden" };
    const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
    if (!memberValidation.ok) return memberValidation;
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

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (room.roomStatus !== "active" || room.isReadonly) return { ok: false, error: "room_unavailable" };
  if (!room.allowMemberInvite) return { ok: false, error: "forbidden" };
  const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
  if (!memberValidation.ok) return memberValidation;
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

export async function joinOpenGroupRoomWithPassword(input: {
  userId: string;
  roomId: string;
  password?: string;
  identityMode?: CommunityMessengerIdentityMode;
  aliasProfile?: Partial<CommunityMessengerRoomAliasProfile> | null;
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const roomId = trimText(input.roomId);
  const password = trimText(input.password);
  const identityMode = input.identityMode === "alias" ? "alias" : "real_name";
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select(
        "id, room_type, room_status, join_policy, identity_policy, is_readonly, title, summary, owner_user_id, member_limit, is_discoverable, password_hash"
      )
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room) {
      if (room.room_type !== "open_group") return { ok: false, error: "not_open_group_room" };
      if ((room.room_status ?? "active") !== "active" || room.is_readonly === true) return { ok: false, error: "room_unavailable" };
      const joinPolicy = normalizeRoomJoinPolicy(room.join_policy, "open_group");
      const identityPolicy = normalizeRoomIdentityPolicy(room.identity_policy, "open_group");
      if (joinPolicy === "password") {
        if (!password) return { ok: false, error: "password_required" };
        if (!verifyMeetingPassword(password, room.password_hash)) return { ok: false, error: "invalid_password" };
      }
      if (identityPolicy !== "alias_allowed" && identityMode === "alias") return { ok: false, error: "forbidden" };
      const { count } = await (sb as any)
        .from("community_messenger_participants")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);
      const memberLimit = Number(room.member_limit ?? 0);
      if (memberLimit > 0 && Number(count ?? 0) >= memberLimit) return { ok: false, error: "room_full" };
      const { error } = await (sb as any).from("community_messenger_participants").upsert(
        {
          room_id: roomId,
          user_id: input.userId,
          role: input.userId === room.owner_user_id ? "owner" : "member",
        },
        { onConflict: "room_id,user_id" }
      );
      if (!error) {
        const roomProfile = await upsertRoomIdentityProfile({
          userId: input.userId,
          roomId,
          identityMode,
          aliasProfile: input.aliasProfile,
        });
        if (roomProfile.ok) return { ok: true, roomId };
        return roomProfile;
      }
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "join_failed") };
    }
    return { ok: false, error: "messenger_migration_required" };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "open_group") return { ok: false, error: "not_open_group_room" };
  if (room.roomStatus !== "active" || room.isReadonly) return { ok: false, error: "room_unavailable" };
  if (room.joinPolicy === "password") {
    if (!password) return { ok: false, error: "password_required" };
    if (!verifyMeetingPassword(password, room.passwordHash)) return { ok: false, error: "invalid_password" };
  }
  if (room.identityPolicy !== "alias_allowed" && identityMode === "alias") return { ok: false, error: "forbidden" };
  const memberCount = dev.participants.filter((participant) => participant.roomId === roomId).length;
  if (room.memberLimit && memberCount >= room.memberLimit) return { ok: false, error: "room_full" };
  if (!dev.participants.some((participant) => participant.roomId === roomId && participant.userId === input.userId)) {
    dev.participants.push({
      id: randomUUID(),
      roomId,
      userId: input.userId,
      role: input.userId === room.ownerUserId ? "owner" : "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      joinedAt: nowIso(),
    });
  }
  const roomProfile = await upsertRoomIdentityProfile({
    userId: input.userId,
    roomId,
    identityMode,
    aliasProfile: input.aliasProfile,
  });
  if (!roomProfile.ok) return roomProfile;
  return { ok: true, roomId };
}

export async function updateOpenGroupRoomSettings(input: {
  userId: string;
  roomId: string;
  title?: string;
  summary?: string;
  password?: string;
  memberLimit?: number;
  isDiscoverable?: boolean;
  joinPolicy?: Extract<CommunityMessengerRoomJoinPolicy, "password" | "free">;
  identityPolicy?: CommunityMessengerRoomIdentityPolicy;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const title = trimText(input.title);
  const summary = trimText(input.summary);
  const password = trimText(input.password);
  const sb = getSupabaseOrNull();
  const patch: Record<string, unknown> = {
    updated_at: nowIso(),
  };
  if (title) patch.title = title;
  if (typeof input.summary === "string") patch.summary = summary;
  if (password) patch.password_hash = hashMeetingPassword(password);
  if (typeof input.memberLimit === "number" && Number.isFinite(input.memberLimit)) {
    patch.member_limit = Math.min(1000, Math.max(2, Math.floor(input.memberLimit)));
  }
  if (typeof input.isDiscoverable === "boolean") patch.is_discoverable = input.isDiscoverable;
  if (input.joinPolicy === "free" || input.joinPolicy === "password") patch.join_policy = input.joinPolicy;
  if (input.identityPolicy === "real_name" || input.identityPolicy === "alias_allowed") {
    patch.identity_policy = input.identityPolicy;
  }
  if (input.joinPolicy === "free") patch.password_hash = null;
  if (input.joinPolicy === "password" && !password) return { ok: false, error: "password_required" };

  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, owner_user_id")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room) {
      if (room.room_type !== "open_group") return { ok: false, error: "not_open_group_room" };
      if (trimText(room.owner_user_id) !== input.userId) return { ok: false, error: "forbidden" };
      const { error } = await (sb as any).from("community_messenger_rooms").update(patch).eq("id", roomId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "open_group") return { ok: false, error: "not_open_group_room" };
  if (room.ownerUserId !== input.userId) return { ok: false, error: "forbidden" };
  if (title) room.title = title;
  if (typeof input.summary === "string") room.summary = summary;
  if (password) room.passwordHash = hashMeetingPassword(password);
  if (typeof input.memberLimit === "number" && Number.isFinite(input.memberLimit)) {
    room.memberLimit = Math.min(1000, Math.max(2, Math.floor(input.memberLimit)));
  }
  if (typeof input.isDiscoverable === "boolean") room.isDiscoverable = input.isDiscoverable;
  if (input.joinPolicy === "free" || input.joinPolicy === "password") room.joinPolicy = input.joinPolicy;
  if (input.identityPolicy === "real_name" || input.identityPolicy === "alias_allowed") {
    room.identityPolicy = input.identityPolicy;
  }
  if (input.joinPolicy === "free") room.passwordHash = null;
  return { ok: true };
}

export async function leaveCommunityMessengerRoom(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, owner_user_id")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room) {
      if (trimText(room.owner_user_id) === input.userId) return { ok: false, error: "owner_cannot_leave" };
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "leave_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  if (room.ownerUserId === input.userId) return { ok: false, error: "owner_cannot_leave" };
  dev.participants = dev.participants.filter((participant) => !(participant.roomId === roomId && participant.userId === input.userId));
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
          .select(
            "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, password_hash, last_message, last_message_at, last_message_type"
          )
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

  const [roomProfileMap, activeCall] = await Promise.all([
    fetchRoomProfilesByRoomIds([id]),
    getActiveCallSessionForRoom(userId, id),
  ]);
  const summary = await mapRoomSummary(userId, room, participants, roomProfileMap);
  const memberIds = dedupeIds(participants.map((item) => ("user_id" in item ? item.user_id : item.userId)));
  const membersRaw = await hydrateProfiles(userId, memberIds, { includeSelf: true });
  const members = membersRaw.map((profile) =>
    resolveRoomProfileLite(profile, roomProfileMap.get(roomProfileKey(id, profile.id))) ?? profile
  );
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
      senderLabel: senderId
        ? (
            resolveRoomProfileLite(
              members.find((member) => member.id === senderId),
              roomProfileMap.get(roomProfileKey(id, senderId))
            )?.label ?? profileLabel(profileMap.get(senderId), senderId)
          )
        : "시스템",
      messageType: (isDbMessage ? message.message_type : message.messageType) as CommunityMessengerMessage["messageType"],
      content: trimText(isDbMessage ? message.content : message.content),
      createdAt: trimText(isDbMessage ? message.created_at : message.createdAt) || nowIso(),
      isMine: senderId === userId,
      callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
      callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
      ...((isDbMessage ? message.message_type : message.messageType) === "voice"
        ? {
            voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
          }
        : {}),
    };
  });

  return {
    viewerUserId: userId,
    room: {
      ...summary,
      description:
        summary.roomType === "direct"
          ? "친구와 1:1로 대화하는 메신저 방"
          : summary.summary || `${members.length}명이 함께 있는 ${summary.roomType === "open_group" ? "공개" : "비공개"} 그룹 채팅`,
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
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "text",
        content,
        metadata: {},
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
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
      await Promise.all(
        ((participants ?? []) as Array<{
          id: string;
          user_id: string;
          unread_count?: number | null;
        }>).map((participant) =>
          (sb as any)
            .from("community_messenger_participants")
            .update({
              unread_count: participant.user_id === input.userId ? 0 : Number(participant.unread_count ?? 0) + 1,
              last_read_at: participant.user_id === input.userId ? createdAt : null,
            })
            .eq("id", participant.id)
        )
      );
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: "나",
          messageType: "text",
          content,
          createdAt,
          isMine: true,
          callKind: null,
          callStatus: null,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "text",
    content,
    metadata: {},
    createdAt,
  });
  if (room) {
    room.lastMessage = content;
    room.lastMessageAt = createdAt;
    room.lastMessageType = "text";
  }
  for (const participant of dev.participants.filter((row) => row.roomId === roomId)) {
    participant.unreadCount = participant.userId === input.userId ? 0 : participant.unreadCount + 1;
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: "나",
      messageType: "text",
      content,
      createdAt,
      isMine: true,
      callKind: null,
      callStatus: null,
    },
  };
}

const VOICE_LAST_PREVIEW = "음성 메시지";

export async function sendCommunityMessengerVoiceMessage(input: {
  userId: string;
  roomId: string;
  audioPublicUrl: string;
  durationSeconds: number;
  mimeType: string;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const audioPublicUrl = trimText(input.audioPublicUrl);
  if (!roomId || !audioPublicUrl) return { ok: false, error: "content_required" };
  const durationSeconds = Math.max(0, Math.min(600, Math.floor(Number(input.durationSeconds) || 0)));
  const mimeType = trimText(input.mimeType) || "audio/webm";
  const metadata = { durationSeconds, mimeType };
  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "voice",
        content: audioPublicUrl,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: VOICE_LAST_PREVIEW,
          last_message_at: createdAt,
          last_message_type: "voice",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { data: participants } = await (sb as any)
        .from("community_messenger_participants")
        .select("id, user_id, unread_count")
        .eq("room_id", roomId);
      await Promise.all(
        ((participants ?? []) as Array<{
          id: string;
          user_id: string;
          unread_count?: number | null;
        }>).map((participantRow) =>
          (sb as any)
            .from("community_messenger_participants")
            .update({
              unread_count: participantRow.user_id === input.userId ? 0 : Number(participantRow.unread_count ?? 0) + 1,
              last_read_at: participantRow.user_id === input.userId ? createdAt : null,
            })
            .eq("id", participantRow.id)
        )
      );
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: "나",
          messageType: "voice",
          content: audioPublicUrl,
          createdAt,
          isMine: true,
          callKind: null,
          callStatus: null,
          voiceDurationSeconds: durationSeconds,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "voice",
    content: audioPublicUrl,
    metadata,
    createdAt,
  });
  room.lastMessage = VOICE_LAST_PREVIEW;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "voice";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: "나",
      messageType: "voice",
      content: audioPublicUrl,
      createdAt,
      isMine: true,
      callKind: null,
      callStatus: null,
      voiceDurationSeconds: durationSeconds,
    },
  };
}

export async function createCommunityMessengerCallLog(input: {
  userId: string;
  roomId?: string | null;
  sessionId?: string | null;
  peerUserId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  durationSeconds?: number;
  replaceExistingStub?: boolean;
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
        sessionId,
        callKind: input.callKind,
        status: input.status,
        createdAt: startedAt,
        replaceExisting: input.replaceExistingStub,
        incrementUnread: !input.replaceExistingStub,
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
    sessionId,
    callKind: input.callKind,
    status: input.status,
    createdAt: startedAt,
    replaceExisting: input.replaceExistingStub,
    incrementUnread: !input.replaceExistingStub,
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
  if (snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly) {
    return { ok: false, error: "room_unavailable" };
  }
  if (snapshot.activeCall && !isTerminalCallSessionStatus(snapshot.activeCall.status)) {
    return { ok: true, session: snapshot.activeCall };
  }
  const isGroupRoom = isCommunityMessengerGroupRoomType(snapshot.room.roomType);
  const peerUserId = isGroupRoom
    ? null
    : trimText(snapshot.room.peerUserId ?? "") || snapshot.members.find((item) => item.id !== input.userId)?.id || null;
  if (!isGroupRoom && !peerUserId) return { ok: false, error: "peer_not_found" };
  if (isGroupRoom && snapshot.members.length > 4) {
    return { ok: false, error: "group_call_limit_exceeded" };
  }

  const sb = getSupabaseOrNull();
  const startedAt = nowIso();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .insert({
        room_id: roomId,
        initiator_user_id: input.userId,
        recipient_user_id: peerUserId,
        session_mode: isGroupRoom ? "group" : "direct",
        max_participants: isGroupRoom ? 4 : 2,
        call_kind: input.callKind,
        status: "ringing",
        started_at: startedAt,
        updated_at: startedAt,
      })
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .single();
    if (!error && data) {
      const inserted = data as CallSessionRow;
      const participantRows = isGroupRoom
        ? snapshot.members.map((member) => ({
            session_id: inserted.id,
            room_id: roomId,
            user_id: member.id,
            participation_status: member.id === input.userId ? "joined" : "invited",
            joined_at: member.id === input.userId ? startedAt : null,
            left_at: null,
            created_at: startedAt,
          }))
        : [
            {
              session_id: inserted.id,
              room_id: roomId,
              user_id: input.userId,
              participation_status: "joined",
              joined_at: startedAt,
              left_at: null,
              created_at: startedAt,
            },
            {
              session_id: inserted.id,
              room_id: roomId,
              user_id: peerUserId,
              participation_status: "invited",
              joined_at: null,
              left_at: null,
              created_at: startedAt,
            },
          ];
      const { error: participantInsertError } = await (sb as any)
        .from("community_messenger_call_session_participants")
        .insert(participantRows);
      if (participantInsertError) {
        await (sb as any).from("community_messenger_call_sessions").delete().eq("id", inserted.id);
        return { ok: false, error: String(participantInsertError.message ?? "call_session_participants_insert_failed") };
      }
      if (!isGroupRoom) {
        /* 채팅 스텁은 수신 실시간보다 늦어도 되므로 발신 응답을 막지 않는다 */
        void appendCallStubMessage({
          userId: input.userId,
          roomId,
          sessionId: inserted.id,
          callKind: input.callKind,
          status: "dialing",
          createdAt: startedAt,
        });
      }
      const syntheticParticipantRows: CallSessionParticipantRow[] = participantRows
        .filter((row): row is typeof row & { user_id: string } => typeof row.user_id === "string" && row.user_id.length > 0)
        .map((row) => ({
          id: `local:${inserted.id}:${row.user_id}`,
          session_id: inserted.id,
          room_id: row.room_id,
          user_id: row.user_id,
          participation_status: row.participation_status as CommunityMessengerCallParticipantStatus,
          joined_at: row.joined_at,
          left_at: row.left_at,
          created_at: row.created_at,
        }));
      return { ok: true, session: await mapCallSession(input.userId, inserted as CallSessionRow, syntheticParticipantRows) };
    }
    if (!isMissingTableError(error)) {
      return { ok: false, error: String(error.message ?? "call_session_start_failed") };
    }
  }

  const dev = getDevState();
  const session: DevCallSession = {
    id: randomUUID(),
    roomId,
    sessionMode: isGroupRoom ? "group" : "direct",
    initiatorUserId: input.userId,
    recipientUserId: peerUserId,
    callKind: input.callKind,
    status: "ringing",
    startedAt,
    answeredAt: null,
    endedAt: null,
    createdAt: startedAt,
    participants: snapshot.members
      .filter((member) => (isGroupRoom ? true : member.id === input.userId || member.id === peerUserId))
      .map((member) => ({
        id: randomUUID(),
        sessionId: "",
        roomId,
        userId: member.id,
        participationStatus: member.id === input.userId ? "joined" : "invited",
        joinedAt: member.id === input.userId ? startedAt : null,
        leftAt: null,
        createdAt: startedAt,
      })),
  };
  session.participants = session.participants.map((item) => ({ ...item, sessionId: session.id }));
  dev.callSessions.unshift(session);
  if (!isGroupRoom) {
    await appendCallStubMessage({
      userId: input.userId,
      roomId,
      sessionId: session.id,
      callKind: input.callKind,
      status: "dialing",
      createdAt: startedAt,
    });
  }
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
  const durationSeconds = Math.max(0, Number(input.durationSeconds ?? 0));
  const finalizeLog = async (session: CallSessionRow | DevCallSession, mapped: CommunityMessengerCallSession) => {
    const status =
      mapped.status === "ended"
        ? "ended"
        : mapped.status === "rejected"
          ? "rejected"
          : mapped.status === "cancelled"
            ? "cancelled"
            : "missed";
    await createCommunityMessengerCallLog({
      userId: "initiator_user_id" in session ? session.initiator_user_id : session.initiatorUserId,
      roomId: "room_id" in session ? session.room_id : session.roomId,
      sessionId,
      peerUserId: mapped.sessionMode === "direct" ? mapped.peerUserId : null,
      callKind: "call_kind" in session ? session.call_kind : session.callKind,
      status,
      durationSeconds,
      replaceExistingStub: mapped.sessionMode === "direct",
    });
  };

  const resolveDirectNextStatus = (
    session: CallSessionRow | DevCallSession
  ): { nextStatus: CommunityMessengerCallSessionStatus; answeredAt?: string | null; endedAt?: string | null } | null => {
    const isDbSession = "initiator_user_id" in session;
    const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
    const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
    const status = (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus;

    if (input.action === "accept") {
      if (!messengerUserIdsEqual(recipientUserId, input.userId)) return null;
      // 이미 active 면 수락 재시도·SDP 재전송 시에도 성공해야 한다 (WebRTC 단계 실패 후 재시도).
      if (status === "active") {
        return { nextStatus: "active", answeredAt: trimText(isDbSession ? session.answered_at : session.answeredAt) || nowIso() };
      }
      if (status !== "ringing") return null;
      return { nextStatus: "active", answeredAt: nowIso() };
    }
    if (input.action === "reject") {
      if (!messengerUserIdsEqual(recipientUserId, input.userId) || status !== "ringing") return null;
      return { nextStatus: "rejected", endedAt: nowIso() };
    }
    if (input.action === "cancel") {
      if (!messengerUserIdsEqual(initiatorUserId, input.userId) || status !== "ringing") return null;
      return { nextStatus: "cancelled", endedAt: nowIso() };
    }
    if (input.action === "missed") {
      if (status !== "ringing") return null;
      if (!messengerUserIdsEqual(initiatorUserId, input.userId) && !messengerUserIdsEqual(recipientUserId, input.userId)) return null;
      return { nextStatus: "missed", endedAt: nowIso() };
    }
    if (status !== "active") return null;
    if (!messengerUserIdsEqual(initiatorUserId, input.userId) && !messengerUserIdsEqual(recipientUserId, input.userId)) return null;
    return { nextStatus: "ended", endedAt: nowIso() };
  };

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (row) {
      const session = row as CallSessionRow;
      if ((session.session_mode ?? "direct") === "group") {
        const now = nowIso();
        const { data: participantRows } = await (sb as any)
          .from("community_messenger_call_session_participants")
          .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
          .eq("session_id", sessionId);
        const participants = (participantRows ?? []) as CallSessionParticipantRow[];
        const mine = participants.find((item) => messengerUserIdsEqual(item.user_id, input.userId));
        if (!mine) return { ok: false, error: "forbidden" };

        if (input.action === "cancel") {
          if (session.initiator_user_id !== input.userId || session.status !== "ringing") {
            return { ok: false, error: "bad_action" };
          }
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId);
          const { data: updated } = await (sb as any)
            .from("community_messenger_call_sessions")
            .update({ status: "cancelled", ended_at: now, updated_at: now })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
            )
            .single();
          if (updated) {
            const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
            await finalizeLog(session, mapped);
            return { ok: true, session: mapped };
          }
          return { ok: false, error: "call_session_update_failed" };
        }

        if (input.action === "accept") {
          if (session.status !== "ringing" && session.status !== "active") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "joined", joined_at: now, left_at: null })
            .eq("session_id", sessionId)
            .eq("user_id", input.userId);
        } else if (input.action === "reject") {
          if (session.status !== "ringing" && session.status !== "active") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "rejected", left_at: now })
            .eq("session_id", sessionId)
            .eq("user_id", input.userId);
        } else if (input.action === "end") {
          if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId)
            .eq("user_id", input.userId);
        } else if (input.action === "missed") {
          if (session.status !== "ringing") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId);
          const { data: updated } = await (sb as any)
            .from("community_messenger_call_sessions")
            .update({ status: "missed", ended_at: now, updated_at: now })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
            )
            .single();
          if (updated) {
            const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
            await finalizeLog(session, mapped);
            return { ok: true, session: mapped };
          }
          return { ok: false, error: "call_session_update_failed" };
        } else {
          return { ok: false, error: "bad_action" };
        }

        const { data: refreshedRows } = await (sb as any)
          .from("community_messenger_call_session_participants")
          .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
          .eq("session_id", sessionId);
        const refreshedParticipants = (refreshedRows ?? []) as CallSessionParticipantRow[];
        const joinedCount = refreshedParticipants.filter((item) => item.participation_status === "joined").length;
        const invitedCount = refreshedParticipants.filter((item) => item.participation_status === "invited").length;
        const nextStatus =
          joinedCount > 1 || (joinedCount >= 1 && invitedCount > 0)
            ? "active"
            : invitedCount > 0
              ? "ringing"
              : joinedCount > 0
                ? "ended"
                : input.action === "reject"
                  ? "rejected"
                  : "ended";
        const updatePayload: Record<string, unknown> = {
          status: nextStatus,
          updated_at: now,
        };
        if (nextStatus === "active" && !session.answered_at) updatePayload.answered_at = now;
        if (isTerminalCallSessionStatus(nextStatus)) updatePayload.ended_at = now;
        const { data: updated } = await (sb as any)
          .from("community_messenger_call_sessions")
          .update(updatePayload)
          .eq("id", sessionId)
          .select(
            "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
          )
          .single();
        if (!updated) return { ok: false, error: "call_session_update_failed" };
        const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
        if (isTerminalCallSessionStatus(mapped.status)) {
          const { data: existingLog } = await (sb as any)
            .from("community_messenger_call_logs")
            .select("id")
            .eq("session_id", sessionId)
            .maybeSingle();
          if (!existingLog) await finalizeLog(session, mapped);
        }
        return { ok: true, session: mapped };
      }

      const next = resolveDirectNextStatus(session);
      if (!next) return { ok: false, error: "bad_action" };
      const alreadyActiveRecipient =
        input.action === "accept" &&
        session.status === "active" &&
        messengerUserIdsEqual(session.recipient_user_id, input.userId);
      let updated: CallSessionRow | null = null;
      let error: unknown = null;
      if (alreadyActiveRecipient) {
        updated = session;
      } else {
        const updatePayload: Record<string, unknown> = {
          status: next.nextStatus,
          updated_at: nowIso(),
        };
        if (next.answeredAt) updatePayload.answered_at = next.answeredAt;
        if (next.endedAt) updatePayload.ended_at = next.endedAt;
        const result = await (sb as any)
          .from("community_messenger_call_sessions")
          .update(updatePayload)
          .eq("id", sessionId)
          .select(
            "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
          )
          .single();
        updated = (result.data as CallSessionRow | null) ?? null;
        error = result.error;
      }
      if (!error && updated) {
        const participantStatus =
          next.nextStatus === "active"
            ? "joined"
            : next.nextStatus === "rejected"
              ? "rejected"
              : isTerminalCallSessionStatus(next.nextStatus)
                ? "left"
                : "invited";
        await (sb as any)
          .from("community_messenger_call_session_participants")
          .update({
            participation_status: participantStatus,
            joined_at: next.answeredAt ?? null,
            left_at: next.endedAt ?? null,
          })
          .eq("session_id", sessionId)
          .eq("user_id", input.userId);
        const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
        if (isTerminalCallSessionStatus(mapped.status)) {
          const { data: existingLog } = await (sb as any)
            .from("community_messenger_call_logs")
            .select("id")
            .eq("session_id", sessionId)
            .maybeSingle();
          if (!existingLog) await finalizeLog(session, mapped);
        }
        return { ok: true, session: mapped };
      }
      if (!isMissingTableError(error)) {
        const message =
          typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message ?? "")
            : "";
        return { ok: false, error: message || "call_session_update_failed" };
      }
    }
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };

  if (session.sessionMode === "group") {
    const mine = session.participants.find((item) => messengerUserIdsEqual(item.userId, input.userId));
    if (!mine) return { ok: false, error: "forbidden" };
    const now = nowIso();
    if (input.action === "accept") {
      mine.participationStatus = "joined";
      mine.joinedAt = now;
      mine.leftAt = null;
      if (!session.answeredAt) session.answeredAt = now;
      session.status = "active";
    } else if (input.action === "reject") {
      mine.participationStatus = "rejected";
      mine.leftAt = now;
    } else if (input.action === "end") {
      mine.participationStatus = "left";
      mine.leftAt = now;
    } else if (input.action === "cancel") {
      if (!messengerUserIdsEqual(session.initiatorUserId, input.userId)) return { ok: false, error: "bad_action" };
      session.status = "cancelled";
      session.endedAt = now;
      for (const participant of session.participants) {
        participant.participationStatus = "left";
        participant.leftAt = now;
      }
    } else if (input.action === "missed") {
      session.status = "missed";
      session.endedAt = now;
      for (const participant of session.participants) {
        participant.participationStatus = "left";
        participant.leftAt = now;
      }
    } else {
      return { ok: false, error: "bad_action" };
    }
    if (!isTerminalCallSessionStatus(session.status)) {
      const joinedCount = session.participants.filter((item) => item.participationStatus === "joined").length;
      const invitedCount = session.participants.filter((item) => item.participationStatus === "invited").length;
      if (joinedCount > 1 || (joinedCount >= 1 && invitedCount > 0)) session.status = "active";
      else if (invitedCount > 0) session.status = "ringing";
      else {
        session.status = joinedCount > 0 ? "ended" : input.action === "reject" ? "rejected" : "ended";
        session.endedAt = now;
      }
    }
    const mapped = await mapCallSession(input.userId, session);
    if (isTerminalCallSessionStatus(mapped.status) && !dev.calls.some((item) => item.sessionId === sessionId)) {
      await finalizeLog(session, mapped);
    }
    return { ok: true, session: mapped };
  }

  const next = resolveDirectNextStatus(session);
  if (!next) return { ok: false, error: "bad_action" };
  session.status = next.nextStatus;
  if (typeof next.answeredAt !== "undefined") session.answeredAt = next.answeredAt;
  if (typeof next.endedAt !== "undefined") session.endedAt = next.endedAt;
  for (const participant of session.participants) {
    if (!messengerUserIdsEqual(participant.userId, input.userId)) continue;
    participant.participationStatus =
      next.nextStatus === "active"
        ? "joined"
        : next.nextStatus === "rejected"
          ? "rejected"
          : isTerminalCallSessionStatus(next.nextStatus)
            ? "left"
            : "invited";
    participant.joinedAt = next.answeredAt ?? participant.joinedAt;
    participant.leftAt = next.endedAt ?? participant.leftAt;
  }
  const mapped = await mapCallSession(input.userId, session);
  if (isTerminalCallSessionStatus(mapped.status) && !dev.calls.some((item) => item.sessionId === sessionId)) {
    await finalizeLog(session, mapped);
  }
  return { ok: true, session: mapped };
}

function callSessionParticipantsContain(participants: string[], userId: string): boolean {
  return participants.some((item) => messengerUserIdsEqual(item, userId));
}

function resolveCallSessionCanonicalUserId(participants: string[], userId: string): string | null {
  const hit = participants.find((item) => messengerUserIdsEqual(item, userId));
  return hit ? trimText(hit) || null : null;
}

export async function listCommunityMessengerCallSignals(
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSignal[]> {
  const id = trimText(sessionId);
  if (!id) return [];
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: participantRows } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("user_id")
      .eq("session_id", id);
    const sessionParticipants = dedupeIds(
      ((participantRows ?? []) as Array<{ user_id?: string | null }>)
        .map((item) => item.user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    if (!callSessionParticipantsContain(sessionParticipants, userId)) {
      /* 참가자 행 삽입 레이스·구 데이터 등으로 participant 가 비어 있어도 1:1 이면 세션 행으로 허용 */
      const { data: sessionRow } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select("initiator_user_id, recipient_user_id, session_mode")
        .eq("id", id)
        .maybeSingle();
      const row = sessionRow as {
        initiator_user_id?: string;
        recipient_user_id?: string | null;
        session_mode?: string | null;
      } | null;
      if (!row) return [];
      const mode = trimText(row.session_mode ?? "") || "direct";
      if (mode !== "direct") return [];
      const init = trimText(row.initiator_user_id ?? "");
      const recip = trimText(row.recipient_user_id ?? "");
      const isDirectParty =
        messengerUserIdsEqual(init, userId) || (recip.length > 0 && messengerUserIdsEqual(recip, userId));
      if (!isDirectParty) return [];
    }

    const { data, error } = await (sb as any)
      .from("community_messenger_call_signals")
      .select("id, session_id, room_id, from_user_id, to_user_id, signal_type, payload, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data && !error) {
      return (data as CallSignalRow[])
        .filter(
          (row) =>
            messengerUserIdsEqual(row.to_user_id, userId) || messengerUserIdsEqual(row.from_user_id, userId)
        )
        .map((row) => ({
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
  userId: string,
  options?: { directOnly?: boolean }
): Promise<CommunityMessengerCallSession[]> {
  const sb = getSupabaseOrNull();
  if (sb) {
    if (options?.directOnly) {
      const { data: directRows, error: directError } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
        )
        .eq("recipient_user_id", userId)
        .eq("session_mode", "direct")
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!directError && (directRows ?? []).length) {
        return Promise.all(((directRows ?? []) as CallSessionRow[]).map((row) => mapCallSession(userId, row)));
      }
      return [];
    }

    const [{ data: directRows, error: directError }, { data: groupParticipantRows, error: groupError }] =
      await Promise.all([
        (sb as any)
          .from("community_messenger_call_sessions")
          .select(
            "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
          )
          .eq("recipient_user_id", userId)
          .eq("session_mode", "direct")
          .eq("status", "ringing")
          .order("created_at", { ascending: false })
          .limit(10),
        (sb as any)
          .from("community_messenger_call_session_participants")
          .select("session_id, participation_status")
          .eq("user_id", userId)
          .in("participation_status", ["invited"])
          .limit(20),
      ]);

    const groupSessionIds = dedupeIds(
      ((groupParticipantRows ?? []) as Array<{ session_id?: string | null }>)
        .map((row) => row.session_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );

    let groupRows: CallSessionRow[] = [];
    if (groupSessionIds.length) {
      const { data } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
        )
        .in("id", groupSessionIds)
        .eq("session_mode", "group")
        .in("status", ["ringing", "active"])
        .order("created_at", { ascending: false });
      groupRows = (data ?? []) as CallSessionRow[];
    }

    if ((!directError || !groupError) && ((directRows ?? []).length || groupRows.length)) {
      const merged = [...((directRows ?? []) as CallSessionRow[]), ...groupRows]
        .sort((a, b) => (trimText(b.created_at) || "").localeCompare(trimText(a.created_at) || ""))
        .slice(0, 10);
      const mapped = await Promise.all(merged.map((row) => mapCallSession(userId, row)));
      return mapped;
    }
  }

  const dev = getDevState();
  const sessions = dev.callSessions
    .filter((item) => {
      if (item.sessionMode === "direct") {
        return item.recipientUserId === userId && item.status === "ringing";
      }
      const mine = item.participants.find((participant) => participant.userId === userId);
      return Boolean(mine && mine.participationStatus === "invited" && (item.status === "ringing" || item.status === "active"));
    })
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
      .select("id, room_id, initiator_user_id, recipient_user_id, session_mode, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return { ok: false, error: "session_not_found" };
    const row = session as CallSessionRow;
    const { data: participantRows } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("user_id")
      .eq("session_id", sessionId);
    const participants = dedupeIds(
      ((participantRows ?? []) as Array<{ user_id?: string | null }>)
        .map((item) => item.user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const directFallbackParticipants =
      (row.session_mode ?? "direct") === "direct"
        ? dedupeIds([trimText(row.initiator_user_id), trimText(row.recipient_user_id)])
        : [];
    const canonicalPool = participants.length > 0 ? participants : directFallbackParticipants;
    const canonicalFrom =
      resolveCallSessionCanonicalUserId(canonicalPool, input.userId) ??
      (messengerUserIdsEqual(row.initiator_user_id, input.userId)
        ? trimText(row.initiator_user_id)
        : messengerUserIdsEqual(row.recipient_user_id, input.userId)
          ? trimText(row.recipient_user_id)
          : null);
    const canonicalTo =
      resolveCallSessionCanonicalUserId(canonicalPool, toUserId) ??
      (messengerUserIdsEqual(row.initiator_user_id, toUserId)
        ? trimText(row.initiator_user_id)
        : messengerUserIdsEqual(row.recipient_user_id, toUserId)
          ? trimText(row.recipient_user_id)
          : null);
    if (!canonicalFrom || !canonicalTo || messengerUserIdsEqual(canonicalFrom, canonicalTo)) {
      return { ok: false, error: "forbidden" };
    }
    const { data, error } = await (sb as any)
      .from("community_messenger_call_signals")
      .insert({
        session_id: sessionId,
        room_id: row.room_id,
        from_user_id: canonicalFrom,
        to_user_id: canonicalTo,
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
  const participants = dedupeIds(session.participants.map((item) => item.userId));
  const canonicalFrom = resolveCallSessionCanonicalUserId(participants, input.userId);
  const canonicalTo = resolveCallSessionCanonicalUserId(participants, toUserId);
  if (!canonicalFrom || !canonicalTo || messengerUserIdsEqual(canonicalFrom, canonicalTo)) {
    return { ok: false, error: "forbidden" };
  }
  const row: DevCallSignal = {
    id: randomUUID(),
    sessionId,
    roomId: session.roomId,
    fromUserId: canonicalFrom,
    toUserId: canonicalTo,
    signalType: input.signalType,
    payload: input.payload,
    createdAt: nowIso(),
  };
  dev.callSignals.push(row);
  return { ok: true, signal: mapSignal(row) };
}
