import { randomUUID } from "crypto";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";
import {
  COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS,
  downsampleVoiceWaveformPeaks,
  parseVoiceWaveformPeaksFromMetadata,
} from "@/lib/community-messenger/voice-waveform";
import {
  isCommunityMessengerStickerPublicPath,
  normalizeCommunityMessengerStickerContent,
} from "@/lib/stickers/sticker-content";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import { buildMessengerContextMetaFromProductChatSnapshot } from "@/lib/community-messenger/product-chat-messenger-meta";
import { enrichMessengerTradeUnreadWithLegacyTrade } from "@/lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { loadChatRoomDetailForUser } from "@/lib/chats/server/load-chat-room-detail";
import type { ChatRoom } from "@/lib/types/chat";
import { persistProductChatMessengerRoomId } from "@/lib/trade/persist-trade-messenger-room-link";
import { syncItemTradeReadWithMessengerRoomMark } from "@/lib/trade/sync-item-trade-read-with-messenger-room";
import {
  itemTradeChatRoomIdFromMessengerDirectKey,
  mirrorCommunityMessengerTextToItemTradeLedger,
} from "@/lib/trade/mirror-community-messenger-text-to-item-trade-ledger";
import {
  resolveProductChat,
  type ProductChatRow,
  type ResolveProductChatResult,
} from "@/lib/trade/resolve-product-chat";
import { assertMessengerTradeDirectRoomAllowsCallKind } from "@/lib/trade/enforce-messenger-trade-room-call-policy";
import { hashMeetingPassword, verifyMeetingPassword } from "@/lib/neighborhood/meeting-password";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { notifyCommunityChatInAppForRecipients } from "@/lib/notifications/community-chat-inapp-notify";
import {
  notifyCommunityMessengerFriendRequestAccepted,
  notifyCommunityMessengerFriendRequestReceived,
  notifyCommunityMessengerFriendRequestRejected,
} from "@/lib/notifications/community-messenger-friend-inapp-notify";
import { MESSENGER_FRIEND_REJECT_COOLDOWN_MS } from "@/lib/community-messenger/messenger-latency-config";
import {
  getMessengerCallAdminPolicyCached,
  type MessengerCallAdminPolicy,
} from "@/lib/community-messenger/messenger-call-admin-policy";
import { sendWebPushForCommunityMessengerIncomingCall } from "@/lib/push/send-community-messenger-incoming-call-push";
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import {
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
  type CommunityMessengerBootstrap,
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
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerCallStatus,
  CommunityMessengerFriendRequest,
  CommunityMessengerFriendRequestStatus,
  CommunityMessengerMessage,
  type CommunityMessengerImageSendItem,
  type CommunityMessengerPeerPresenceSnapshot,
  type CommunityMessengerReadReceipt,
  CommunityMessengerProfileLite,
  type CommunityMessengerPresenceState,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
  CommunityMessengerRoomVisibility,
} from "@/lib/community-messenger/types";
import { derivePresenceFromDbRow } from "@/lib/community-messenger/presence/presence-policy";

type SupabaseLike = ReturnType<typeof getSupabaseServer>;

type ProfileRow = {
  id: string;
  nickname?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

type RequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: CommunityMessengerFriendRequestStatus;
  created_at: string;
  responded_at?: string | null;
};

/** 상대가 거절한 내 발신 요청을 같은 방향으로 재전송할 때만 쿨다운 적용(상대가 먼저 걸면 기존 행 삭제 후 새 방향 허용). */
function remainingFriendRejectCooldownMs(
  row: Pick<RequestRow, "status" | "requester_id" | "addressee_id" | "responded_at">,
  userId: string,
  target: string,
  nowMs: number
): number {
  const cool = MESSENGER_FRIEND_REJECT_COOLDOWN_MS;
  if (cool <= 0) return 0;
  if (row.status !== "rejected") return 0;
  if (row.requester_id !== userId || row.addressee_id !== target) return 0;
  const t = row.responded_at;
  if (t == null || !String(t).trim()) return 0;
  const respondedMs = Date.parse(String(t));
  if (!Number.isFinite(respondedMs)) return 0;
  return Math.max(0, respondedMs + cool - nowMs);
}

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
  notice_text?: string | null;
  notice_updated_at?: string | null;
  notice_updated_by?: string | null;
  allow_admin_invite?: boolean | null;
  allow_admin_kick?: boolean | null;
  allow_admin_edit_notice?: boolean | null;
  allow_member_upload?: boolean | null;
  allow_member_call?: boolean | null;
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
  is_archived?: boolean | null;
  joined_at: string | null;
  last_read_at?: string | null;
  last_read_message_id?: string | null;
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
  message_type: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker";
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
  noticeText?: string;
  noticeUpdatedAt?: string | null;
  noticeUpdatedBy?: string | null;
  allowAdminInvite?: boolean;
  allowAdminKick?: boolean;
  allowAdminEditNotice?: boolean;
  allowMemberUpload?: boolean;
  allowMemberCall?: boolean;
  passwordHash: string | null;
  directKey: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker";
};

type DevParticipant = {
  id: string;
  roomId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  joinedAt: string;
  lastReadAt?: string | null;
  lastReadMessageId?: string | null;
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
  messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker";
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
  hiddenFriends: Map<string, Set<string>>;
  rooms: DevRoom[];
  participants: DevParticipant[];
  roomProfiles: DevRoomProfile[];
  messages: DevMessage[];
  calls: DevCall[];
  callSessions: DevCallSession[];
  callSignals: DevCallSignal[];
};

type PresenceSnapshotRow = {
  user_id: string;
  last_seen_at: string | null;
  updated_at: string | null;
  last_ping_at?: string | null;
  last_activity_at?: string | null;
  app_visibility?: string | null;
  presence_state_cached?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function participantLastReadAt(value: ParticipantRow | DevParticipant | undefined): string | null {
  if (!value) return null;
  return trimText("last_read_at" in value ? (value as ParticipantRow).last_read_at : (value as DevParticipant).lastReadAt) || null;
}

function participantLastReadMessageId(value: ParticipantRow | DevParticipant | undefined): string | null {
  if (!value) return null;
  return trimText(
    "last_read_message_id" in value
      ? (value as ParticipantRow).last_read_message_id
      : (value as DevParticipant).lastReadMessageId
  ) || null;
}

function isMissingTableError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /does not exist|relation .* does not exist|schema cache|column .* does not exist|Could not find the .* column/i.test(
    message
  );
}

function isMissingRpcFunctionError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "PGRST202" || /Could not find the function|function .* does not exist/i.test(message);
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

async function userHasActiveDirectCallSession(sb: SupabaseLike, userId: string): Promise<boolean> {
  const u = trimText(userId);
  if (!u) return false;
  const { data } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id")
    .eq("status", "active")
    .eq("session_mode", "direct")
    .or(`initiator_user_id.eq.${u},recipient_user_id.eq.${u}`)
    .limit(1)
    .maybeSingle();
  return Boolean(data && trimText((data as { id?: string }).id));
}

async function appendCommunityMessengerCallSessionEvent(
  sb: SupabaseLike,
  input: {
    sessionId: string;
    actorUserId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const sid = trimText(input.sessionId);
  const aid = trimText(input.actorUserId);
  const ev = trimText(input.eventType);
  if (!sid || !aid || !ev) return;
  try {
    const { error } = await (sb as any).from("community_messenger_call_events").insert({
      session_id: sid,
      actor_user_id: aid,
      event_type: ev,
      payload: input.payload ?? {},
    });
    if (error && !isMissingTableError(error)) {
      /* best-effort */
    }
  } catch (e) {
    if (!isMissingTableError(e)) {
      /* ignore */
    }
  }
}

function endedReasonForSessionDelta(
  action: "accept" | "reject" | "cancel" | "end" | "missed",
  nextStatus: CommunityMessengerCallSessionStatus
): string | null {
  if (nextStatus === "active" || nextStatus === "ringing") return null;
  if (nextStatus === "rejected") return "declined";
  if (nextStatus === "cancelled") return "canceled";
  if (nextStatus === "missed") return "missed";
  if (nextStatus === "ended") {
    return action === "cancel" ? "canceled" : "ended";
  }
  return null;
}

function auditEventTypeForAction(
  action: "accept" | "reject" | "cancel" | "end" | "missed",
  nextStatus: CommunityMessengerCallSessionStatus
): string {
  if (action === "accept" || nextStatus === "active") return "accepted";
  if (action === "reject" || nextStatus === "rejected") return "declined";
  if (action === "cancel" || nextStatus === "cancelled") return "canceled";
  if (action === "missed" || nextStatus === "missed") return "missed";
  if (action === "end" || nextStatus === "ended") return "ended";
  return "ended";
}

async function filterDirectIncomingRowsForPolicy(
  sb: SupabaseLike,
  userId: string,
  rows: CallSessionRow[],
  policy: MessengerCallAdminPolicy
): Promise<CallSessionRow[]> {
  if (!rows.length) return [];
  let out = [...rows];
  const initiatorIds = out.map((r) => trimText(r.initiator_user_id));
  const { blocked } = await getViewerRelationSets(userId, initiatorIds);
  for (const row of out) {
    const init = trimText(row.initiator_user_id);
    if (blocked.has(init)) {
      void updateCommunityMessengerCallSession({ userId, sessionId: row.id, action: "reject" }).catch(() => {});
    }
  }
  out = out.filter((r) => !blocked.has(trimText(r.initiator_user_id)));
  if (policy.repeated_call_cooldown_seconds > 0 && out.length) {
    const cutoffIso = new Date(Date.now() - policy.repeated_call_cooldown_seconds * 1000).toISOString();
    const inits = [...new Set(out.map((r) => trimText(r.initiator_user_id)))].filter(Boolean);
    if (inits.length) {
      const { data: recentEnds } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select("initiator_user_id")
        .eq("recipient_user_id", userId)
        .in("initiator_user_id", inits)
        .not("ended_at", "is", null)
        .gte("ended_at", cutoffIso);
      const cooldownBlocked = new Set(
        ((recentEnds ?? []) as Array<{ initiator_user_id?: string }>)
          .map((r) => trimText(r.initiator_user_id))
          .filter(Boolean)
      );
      out = out.filter((r) => !cooldownBlocked.has(trimText(r.initiator_user_id)));
    }
  }
  return out;
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

function invalidateOwnerHubBadgeForCommunityMessengerPeers(senderUserId: string, recipientUserIds: string[]): void {
  for (const id of dedupeIds([senderUserId, ...recipientUserIds])) {
    invalidateOwnerHubBadgeCache(id);
  }
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
      hiddenFriends: new Map(),
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

const FETCH_PROFILES_BY_IDS_TTL_MS = 12_000;
const fetchProfilesByIdsCache = new Map<string, { expiresAt: number; map: Map<string, ProfileRow> }>();

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = dedupeIds(ids);
  if (!unique.length) return new Map();
  const cacheKey = unique.slice().sort().join("\0");
  const hit = fetchProfilesByIdsCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.map;
  const sb = getSupabaseOrNull();
  if (!sb) return new Map();
  const { data } = await (sb as any)
    .from("profiles")
    .select("id, nickname, username, avatar_url, bio")
    .in("id", unique);
  const map = new Map(((data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  fetchProfilesByIdsCache.set(cacheKey, { expiresAt: Date.now() + FETCH_PROFILES_BY_IDS_TTL_MS, map });
  if (fetchProfilesByIdsCache.size > 400) {
    const now = Date.now();
    for (const k of [...fetchProfilesByIdsCache.keys()].slice(0, 120)) {
      const e = fetchProfilesByIdsCache.get(k);
      if (!e || e.expiresAt <= now) fetchProfilesByIdsCache.delete(k);
    }
  }
  return map;
}

function roomProfileKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

async function fetchPresenceSnapshotsByUserIds(
  ids: string[]
): Promise<Map<string, CommunityMessengerPeerPresenceSnapshot>> {
  const unique = dedupeIds(ids);
  const result = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
  if (!unique.length) return result;
  const sb = getSupabaseOrNull();
  if (!sb) return result;
  const { data, error } = await (sb as any)
    .from("community_messenger_presence_snapshots")
    .select("user_id, last_seen_at, updated_at, last_ping_at, last_activity_at, app_visibility, presence_state_cached")
    .in("user_id", unique);
  if (error && !isMissingTableError(error)) {
    return result;
  }
  const nowMs = Date.now();
  for (const row of (data ?? []) as PresenceSnapshotRow[]) {
    const userId = trimText(row.user_id);
    if (!userId) continue;
    const lastSeenAt = trimText(row.last_seen_at) || trimText(row.updated_at) || null;
    const state = derivePresenceFromDbRow({
      nowMs,
      lastPingAtIso: row.last_ping_at ?? null,
      lastActivityAtIso: row.last_activity_at ?? null,
      lastSeenAtIso: row.last_seen_at ?? null,
      updatedAtIso: row.updated_at ?? null,
      appVisibility: row.app_visibility ?? "unknown",
    });
    result.set(userId, {
      userId,
      state,
      lastSeenAt,
    });
  }
  return result;
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
    const raw = trimText(baseProfile.avatarUrl);
    const safeAvatar =
      raw && !isCommunityMessengerStickerPublicPath(raw) ? raw : null;
    return {
      ...baseProfile,
      identityMode: "real_name",
      aliasProfile: null,
      avatarUrl: safeAvatar,
    };
  }
  const displayName = trimText(isDbProfile ? roomProfile.display_name : roomProfile.displayName);
  const bio = trimText(isDbProfile ? roomProfile.bio : roomProfile.bio);
  const rawRoomAvatar = trimText(isDbProfile ? roomProfile.avatar_url : roomProfile.avatarUrl);
  const fromRoom =
    rawRoomAvatar && !isCommunityMessengerStickerPublicPath(rawRoomAvatar) ? rawRoomAvatar : null;
  const rawBaseAvatar = trimText(baseProfile.avatarUrl);
  const fromBase =
    rawBaseAvatar && !isCommunityMessengerStickerPublicPath(rawBaseAvatar) ? rawBaseAvatar : null;
  const avatarUrl = fromRoom ?? fromBase;
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
  let aliasAvatarUrl = trimText(input.aliasProfile?.avatarUrl) || null;
  if (aliasAvatarUrl && isCommunityMessengerStickerPublicPath(aliasAvatarUrl)) {
    aliasAvatarUrl = null;
  }
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
  hiddenFriendIds: Set<string>;
}> {
  const following = new Set<string>();
  const blocked = new Set<string>();
  const friendIds = new Set<string>();
  const favoriteFriendIds = new Set<string>();
  const hiddenFriendIds = new Set<string>();
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id !== userId));
  if (!uniqueTargets.length) {
    return { following, blocked, friendIds, favoriteFriendIds, hiddenFriendIds };
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
      if (relationType === "hidden") hiddenFriendIds.add(target);
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
    const hidden = dev.hiddenFriends.get(userId);
    if (hidden) {
      for (const target of hidden) hiddenFriendIds.add(target);
    }
  }

  if (!friendIds.size || !favoriteFriendIds.size || !hiddenFriendIds.size) {
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
    const hidden = dev.hiddenFriends.get(userId);
    if (hidden) {
      for (const target of hidden) hiddenFriendIds.add(target);
    }
  }

  return { following, blocked, friendIds, favoriteFriendIds, hiddenFriendIds };
}

async function hydrateProfilesWithProfileMap(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<{ members: CommunityMessengerProfileLite[]; profileMap: Map<string, ProfileRow> }> {
  const includeSelf = options?.includeSelf === true;
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id && (includeSelf || id !== viewerId)));
  if (!uniqueTargets.length) return { members: [], profileMap: new Map() };
  const [profileMap, relationSets] = await Promise.all([
    fetchProfilesByIds(uniqueTargets),
    getViewerRelationSets(viewerId, uniqueTargets),
  ]);
  const members = uniqueTargets.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: trimText(profile?.username) ? `@${trimText(profile?.username)}` : undefined,
      bio: trimText(profile?.bio) || null,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: id === viewerId ? false : relationSets.following.has(id),
      blocked: id === viewerId ? false : relationSets.blocked.has(id),
      isFriend: id === viewerId ? false : relationSets.friendIds.has(id),
      isFavoriteFriend: id === viewerId ? false : relationSets.favoriteFriendIds.has(id),
      isHiddenFriend: id === viewerId ? false : relationSets.hiddenFriendIds.has(id),
    };
  });
  return { members, profileMap };
}

async function hydrateProfiles(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<CommunityMessengerProfileLite[]> {
  const { members } = await hydrateProfilesWithProfileMap(viewerId, targetIds, options);
  return members;
}

/**
 * 통화 세션 매핑 전용 — `getViewerRelationSets` 생략(친구/팔로우 등 3쿼리)으로 발신·GET TTFB 를 줄인다.
 * 통화 UI는 표시명·아바타 중심이며 관계 뱃지는 불필요하다.
 */
async function hydrateProfilesLabelsOnlyWithMap(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<{ members: CommunityMessengerProfileLite[]; profileMap: Map<string, ProfileRow> }> {
  const includeSelf = options?.includeSelf === true;
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id && (includeSelf || id !== viewerId)));
  if (!uniqueTargets.length) return { members: [], profileMap: new Map() };
  const profileMap = await fetchProfilesByIds(uniqueTargets);
  const members = uniqueTargets.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: trimText(profile?.username) ? `@${trimText(profile?.username)}` : undefined,
      bio: trimText(profile?.bio) || null,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
      isHiddenFriend: false,
    };
  });
  return { members, profileMap };
}

async function hydrateProfilesLabelsOnly(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<CommunityMessengerProfileLite[]> {
  const { members } = await hydrateProfilesLabelsOnlyWithMap(viewerId, targetIds, options);
  return members;
}

function buildProfilesFromKnownRelations(params: {
  viewerId: string;
  targetIds: string[];
  profileMap: Map<string, ProfileRow>;
  friendIds?: Iterable<string>;
  favoriteFriendIds?: Iterable<string>;
  followingIds?: Iterable<string>;
  hiddenIds?: Iterable<string>;
  blockedIds?: Iterable<string>;
  friendshipAcceptedAtByPeer?: Map<string, string>;
}): CommunityMessengerProfileLite[] {
  const friendIdSet = new Set(params.friendIds ?? []);
  const favoriteFriendIdSet = new Set(params.favoriteFriendIds ?? []);
  const followingIdSet = new Set(params.followingIds ?? []);
  const hiddenIdSet = new Set(params.hiddenIds ?? []);
  const blockedIdSet = new Set(params.blockedIds ?? []);
  return dedupeIds(params.targetIds).map((id) => {
    const profile = params.profileMap.get(id);
    const isViewer = id === params.viewerId;
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: trimText(profile?.username) ? `@${trimText(profile?.username)}` : undefined,
      bio: trimText(profile?.bio) || null,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: isViewer ? false : followingIdSet.has(id),
      blocked: isViewer ? false : blockedIdSet.has(id),
      isFriend: isViewer ? false : friendIdSet.has(id),
      isFavoriteFriend: isViewer ? false : favoriteFriendIdSet.has(id),
      isHiddenFriend: isViewer ? false : hiddenIdSet.has(id),
      friendshipAcceptedAt: params.friendshipAcceptedAtByPeer?.get(id) ?? null,
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

async function listCommunityMessengerFriendRequestRows(userId: string): Promise<RequestRow[]> {
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
  return rows;
}

function buildCommunityMessengerFriendRequestsFromProfileMap(
  userId: string,
  rows: RequestRow[],
  profileMap: Map<string, ProfileRow>
): CommunityMessengerFriendRequest[] {
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

export async function listCommunityMessengerFriendRequests(
  userId: string
): Promise<CommunityMessengerFriendRequest[]> {
  const rows = await listCommunityMessengerFriendRequestRows(userId);
  const profileMap = await fetchProfilesByIds(
    dedupeIds(rows.flatMap((row) => [row.requester_id, row.addressee_id]))
  );
  return buildCommunityMessengerFriendRequestsFromProfileMap(userId, rows, profileMap);
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

async function listFavoriteFriendIds(userId: string): Promise<string[]> {
  const result = new Set<string>();
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data } = await (sb as any)
      .from("community_friend_favorites")
      .select("target_user_id")
      .eq("user_id", userId);
    for (const row of (data ?? []) as Array<{ target_user_id?: string | null }>) {
      const target = trimText(row.target_user_id);
      if (target) result.add(target);
    }
  }
  const dev = getDevState();
  const favorites = dev.favoriteFriends.get(userId);
  if (favorites) {
    for (const target of favorites) {
      const id = trimText(target);
      if (id) result.add(id);
    }
  }
  return [...result];
}

/** 수락된 친구 관계마다 상대 peer → 수락 시각(가장 최근 값). `responded_at` 우선, 없으면 `created_at` */
async function fetchFriendshipAcceptedAtByPeerId(userId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const merge = (peerId: string, atRaw: string | null | undefined) => {
    const at = trimText(atRaw);
    if (!at || !peerId) return;
    const prev = map.get(peerId);
    if (!prev || Date.parse(at) > Date.parse(prev)) map.set(peerId, at);
  };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_friend_requests")
      .select("requester_id, addressee_id, status, responded_at, created_at")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (!error || !isMissingTableError(error)) {
      for (const row of (data ?? []) as Array<{
        requester_id?: string;
        addressee_id?: string;
        responded_at?: string | null;
        created_at?: string;
      }>) {
        const requesterId = trimText(row.requester_id);
        const addresseeId = trimText(row.addressee_id);
        const peerId = requesterId === userId ? addresseeId : requesterId;
        const at = trimText(row.responded_at) || trimText(row.created_at);
        merge(peerId, at);
      }
    }
  }
  for (const row of getDevState().friendRequests) {
    if (row.status !== "accepted") continue;
    const peerId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    merge(peerId, row.responded_at ?? row.created_at);
  }
  return map;
}

async function listFollowingIds(userId: string, relationType: "neighbor_follow" | "blocked" | "hidden"): Promise<string[]> {
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

function buildRoomSummaryFromHydratedMembers(
  userId: string,
  room: RoomRow | DevRoom,
  participants: Array<ParticipantRow | DevParticipant>,
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile> | undefined,
  memberProfilesRaw: CommunityMessengerProfileLite[],
  meta?: { totalMemberCount?: number }
): CommunityMessengerRoomSummary {
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
  const contextMeta = parseCommunityMessengerRoomContextMeta(roomSummary);
  const roomAvatar = trimText(isDbRoom ? room.avatar_url : room.avatarUrl) || null;
  const roomLastMessage = trimText(isDbRoom ? room.last_message : room.lastMessage);
  const roomLastMessageTypeRaw = trimText(isDbRoom ? room.last_message_type : room.lastMessageType);
  const roomLastMessageType =
    roomLastMessageTypeRaw === "image" ||
    roomLastMessageTypeRaw === "file" ||
    roomLastMessageTypeRaw === "system" ||
    roomLastMessageTypeRaw === "call_stub" ||
    roomLastMessageTypeRaw === "voice" ||
    roomLastMessageTypeRaw === "sticker"
      ? roomLastMessageTypeRaw
      : "text";
  const roomLastAt = trimText(isDbRoom ? room.last_message_at : room.lastMessageAt) || nowIso();
  const ownerUserId = trimText(isDbRoom ? room.owner_user_id : room.ownerUserId) || trimText(isDbRoom ? room.created_by : room.createdBy) || null;
  const memberLimitRaw = isDbRoom ? room.member_limit : room.memberLimit;
  const memberLimit = typeof memberLimitRaw === "number" && Number.isFinite(memberLimitRaw) ? memberLimitRaw : null;
  const isDiscoverable = isDbRoom ? room.is_discoverable === true : room.isDiscoverable;
  const allowMemberInvite = isDbRoom ? room.allow_member_invite !== false : room.allowMemberInvite;
  const noticeText = trimText(isDbRoom ? room.notice_text : room.noticeText);
  const noticeUpdatedAt = trimText(isDbRoom ? room.notice_updated_at : room.noticeUpdatedAt) || null;
  const noticeUpdatedBy = trimText(isDbRoom ? room.notice_updated_by : room.noticeUpdatedBy) || null;
  const allowAdminInvite = isDbRoom ? room.allow_admin_invite !== false : room.allowAdminInvite !== false;
  const allowAdminKick = isDbRoom ? room.allow_admin_kick !== false : room.allowAdminKick !== false;
  const allowAdminEditNotice =
    isDbRoom ? room.allow_admin_edit_notice !== false : room.allowAdminEditNotice !== false;
  const allowMemberUpload = isDbRoom ? room.allow_member_upload !== false : room.allowMemberUpload !== false;
  const allowMemberCall = isDbRoom ? room.allow_member_call !== false : room.allowMemberCall !== false;
  const requiresPassword =
    joinPolicy === "password" &&
    trimText(isDbRoom ? room.password_hash : room.passwordHash).length > 0;
  const me = participants.find((item) => ("user_id" in item ? item.user_id : item.userId) === userId);
  const isArchivedByViewer = participantViewerArchived(me);
  const memberIds = dedupeParticipantUserIds(participants);
  const effectiveMemberCount = meta?.totalMemberCount ?? memberIds.length;
  const peers = memberIds.filter((id) => id !== userId);
  const peerProfilesBase = memberProfilesRaw.filter((profile) => profile.id !== userId);
  const memberProfiles = memberProfilesRaw.map((profile) =>
    resolveRoomProfileLite(profile, roomProfileMap?.get(roomProfileKey(roomId, profile.id))) ?? profile
  );
  const ownerLabel =
    (ownerUserId ? memberProfiles.find((profile) => profile.id === ownerUserId)?.label : "") ||
    (ownerUserId ? profileLabel(null, ownerUserId) : "-");
  const defaultDirectTitle = peerProfilesBase[0]?.label ?? "새 대화";
  const title =
    roomType === "direct"
      ? defaultDirectTitle
      : roomTitle || (roomType === "open_group" ? "공개 그룹방" : `그룹 ${effectiveMemberCount}명`);
  const subtitle =
    roomType === "direct"
      ? peerProfilesBase[0]?.subtitle ?? "친구와 나누는 대화"
      : roomType === "open_group"
        ? `공개 그룹 · ${effectiveMemberCount}명 참여 중`
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
    avatarUrl: roomAvatar || peerProfilesBase[0]?.avatarUrl || null,
    unreadCount: Math.max(0, Number(("unread_count" in (me ?? {}) ? (me as ParticipantRow).unread_count : (me as DevParticipant | undefined)?.unreadCount) ?? 0)),
    isMuted: "is_muted" in (me ?? {}) ? (me as ParticipantRow).is_muted === true : false,
    isPinned: "is_pinned" in (me ?? {}) ? (me as ParticipantRow).is_pinned === true : false,
    lastMessage: roomLastMessage || (roomType === "direct" ? "메시지를 보내 보세요." : "그룹 대화를 시작해 보세요."),
    lastMessageType: roomLastMessageType,
    lastMessageAt: roomLastAt,
    memberCount: effectiveMemberCount,
    ownerUserId,
    ownerLabel,
    memberLimit,
    isDiscoverable,
    requiresPassword,
    allowMemberInvite,
    noticeText,
    noticeUpdatedAt,
    noticeUpdatedBy,
    allowAdminInvite,
    allowAdminKick,
    allowAdminEditNotice,
    allowMemberUpload,
    allowMemberCall,
    myIdentityMode: resolveRoomProfileLite(
      memberProfilesRaw.find((profile) => profile.id === userId),
      roomProfileMap?.get(roomProfileKey(roomId, userId))
    )?.identityMode,
    peerUserId: roomType === "direct" ? peers[0] ?? null : null,
    isArchivedByViewer,
    contextMeta: contextMeta ?? null,
  };
}

function buildParticipantsByRoomMap(
  participantRows: Array<ParticipantRow | DevParticipant>
): Map<string, Array<ParticipantRow | DevParticipant>> {
  const byRoomId = new Map<string, Array<ParticipantRow | DevParticipant>>();
  for (const participant of participantRows) {
    const roomId = participantRowRoomId(participant);
    const list = byRoomId.get(roomId) ?? [];
    list.push(participant);
    byRoomId.set(roomId, list);
  }
  return byRoomId;
}

/**
 * Community Messenger — `hydrateProfiles` / 관계 조립 경로 (실 API 기준)
 *
 * - `fetchMyRoomsPayload`: 참가 방이 많으면 `last_message_at` 메타로 상위 `COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP`만 로드.
 * - `getCommunityMessengerBootstrap`: 친구·차단·팔로우 ID, `fetchMyRoomsPayload`, (옵션) 탐색 raw, 통화 로그 행을 모은 뒤
 *   **단일** `hydrateProfiles` → `summarizeRoomsBatchWithProfileMap` + 통화 `roomSummaryMap` + `loadSessionMapsForCallLogs`.
 *   `skipDiscoverable` 이면 탐색 오픈그룹 쿼리를 생략하고 `discoverableGroups` 는 빈 배열(클라이언트가 `open-groups`로 후속 로드).
 * - `listCommunityMessengerMyChatsAndGroups` / `listDiscoverableOpenGroupRooms` / `listCommunityMessengerCallLogs`: 단독 엔드포인트에서 각각 **1회** 하이드레이션 (부트스트랩과는 별 요청).
 * - 방 상세 `getCommunityMessengerRoomDetail`: 해당 방 멤버만 **1회** `hydrateProfilesWithProfileMap`.
 * - `listCommunityMessengerFriends` / `searchCommunityMessengerUsers`: 목록·검색 전용 **1회**.
 * - `loadCallSessionParticipants` / `resolveCommunityMessengerGroupTitle`: 해당 작업 범위 **1회** (세션/그룹 제목용).
 */
function participantRowRoomId(p: ParticipantRow | DevParticipant): string {
  return "room_id" in p ? p.room_id : p.roomId;
}

function participantRowUserId(p: ParticipantRow | DevParticipant): string {
  return trimText("user_id" in p ? p.user_id : p.userId) || "";
}

function dedupeParticipantUserIds(rows: Array<ParticipantRow | DevParticipant>): string[] {
  return dedupeIds(rows.map((p) => participantRowUserId(p)).filter((id): id is string => Boolean(id)));
}

function participantViewerArchived(me: ParticipantRow | DevParticipant | undefined): boolean {
  if (!me) return false;
  if ("is_archived" in me && (me as ParticipantRow).is_archived === true) return true;
  if ("isArchived" in me && (me as DevParticipant).isArchived === true) return true;
  return false;
}

function rankParticipantRoleForBootstrap(role: "owner" | "admin" | "member"): number {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  return 2;
}

function participantJoinedAtForBootstrap(p: ParticipantRow | DevParticipant): string {
  return trimText("joined_at" in p ? p.joined_at : p.joinedAt) || "";
}

/** 방 멤버 목록·부트스트랩·페이지네이션 공통 정렬 (오프셋과 부트스트랩 첫 페이지가 동일 기준) */
function sortParticipantsForRoomMemberList<T extends ParticipantRow | DevParticipant>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dr = rankParticipantRoleForBootstrap(a.role) - rankParticipantRoleForBootstrap(b.role);
    if (dr !== 0) return dr;
    const jd = participantJoinedAtForBootstrap(b).localeCompare(participantJoinedAtForBootstrap(a));
    if (jd !== 0) return jd;
    return participantRowUserId(a).localeCompare(participantRowUserId(b));
  });
}

/** 그룹방 부트스트랩: 방장·관리자 우선, 그다음 최근 가입 순 — 뷰어는 항상 슬라이스에 포함(캡·정렬로 누락되면 헤더·권한 UI가 깨짐) */
function sliceGroupParticipantsForRoomBootstrap<T extends ParticipantRow | DevParticipant>(
  rows: T[],
  viewerUserId: string,
  cap: number
): { rows: T[]; truncated: boolean } {
  if (rows.length <= cap) return { rows, truncated: false };
  const sorted = sortParticipantsForRoomMemberList(rows);
  const viewer = trimText(viewerUserId);
  const base = sorted.slice(0, cap);
  const viewerRow = viewer ? sorted.find((r) => participantRowUserId(r) === viewer) : undefined;
  if (!viewerRow || base.some((r) => participantRowUserId(r) === viewer)) {
    return { rows: base, truncated: true };
  }
  const trimmed = base.slice(0, Math.max(0, cap - 1));
  return { rows: [...trimmed, viewerRow], truncated: true };
}

function isDbCallLogRow(row: CallRow | DevCall): row is CallRow {
  return "caller_user_id" in row;
}

function callLogRoomId(row: CallRow | DevCall): string | null {
  const v = isDbCallLogRow(row) ? row.room_id : row.roomId;
  return trimText(v) || null;
}

function callLogSessionId(row: CallRow | DevCall): string | null {
  const v = isDbCallLogRow(row) ? row.session_id : row.sessionId;
  return trimText(v) || null;
}

function callLogPeerUserId(row: CallRow | DevCall): string | null {
  const v = isDbCallLogRow(row) ? row.peer_user_id : row.peerUserId;
  return trimText(v) || null;
}

/** 이미 hydrateProfiles 로 채운 맵으로 방 요약만 조립 (부트스트랩 단일 하이드레이션용). */
function summarizeRoomsBatchWithProfileMap(
  userId: string,
  roomRows: Array<RoomRow | DevRoom>,
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile>,
  participantsByRoom: Map<string, Array<ParticipantRow | DevParticipant>>,
  profileById: Map<string, CommunityMessengerProfileLite>
): CommunityMessengerRoomSummary[] {
  return roomRows.map((room) => {
    const participants = participantsByRoom.get(room.id) ?? [];
    const memberIds = dedupeParticipantUserIds(participants);
    const memberProfilesForRoom = memberIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
    return buildRoomSummaryFromHydratedMembers(userId, room, participants, roomProfileMap, memberProfilesForRoom);
  });
}

/** 방 목록용: 참가자 전원에 대해 hydrateProfiles 1회만 호출 (방마다 호출 시 N배 지연). */
async function summarizeRoomsBatch(
  userId: string,
  roomRows: Array<RoomRow | DevRoom>,
  participantRows: Array<ParticipantRow | DevParticipant>,
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile>,
  participantsByRoom: Map<string, Array<ParticipantRow | DevParticipant>>
): Promise<CommunityMessengerRoomSummary[]> {
  const allMemberIds = dedupeParticipantUserIds(participantRows);
  const allMemberProfiles = await hydrateProfiles(userId, allMemberIds, { includeSelf: true });
  const profileById = new Map(allMemberProfiles.map((profile) => [profile.id, profile]));
  return summarizeRoomsBatchWithProfileMap(userId, roomRows, roomProfileMap, participantsByRoom, profileById);
}

type MessengerRoomsPayload = {
  roomRows: Array<RoomRow | DevRoom>;
  participantRows: Array<ParticipantRow | DevParticipant>;
  byRoomId: Map<string, Array<ParticipantRow | DevParticipant>>;
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile>;
};

type CommunityMessengerBootstrapRoomsDiagnostics = {
  rounds: number;
  queryCount: number;
  metaChunkCount: number;
  roomIdsBeforeCap: number;
  roomIdsAfterCap: number;
  round1Ms: number;
  round2Ms: number;
  round2RoomsMs: number;
  round2RoomsDbFetchMs: number;
  round2RoomsNormalizeMs: number;
  round2RoomsMergeMapMs: number;
  round2RoomsHydrateLabelMs: number;
  round2RoomsPayloadSerializeMs: number;
  round2ParticipantsMs: number;
  round3Ms: number;
  transformMs: number;
  postprocessMs: number;
  round1RoomIdCount: number;
  round2RoomRowCount: number;
  round2ParticipantRowCount: number;
  round3RoomProfileCount: number;
};

export type CommunityMessengerBootstrapDiagnostics = {
  parallelInitialWallMs: number;
  roomsQueryMs: number;
  roomsQueryRound1Ms: number;
  roomsQueryRound2Ms: number;
  roomsQueryRound2RoomsMs: number;
  roomsQueryRound2RoomsDbFetchMs: number;
  roomsQueryRound2RoomsNormalizeMs: number;
  roomsQueryRound2RoomsMergeMapMs: number;
  roomsQueryRound2RoomsHydrateLabelMs: number;
  roomsQueryRound2RoomsPayloadSerializeMs: number;
  roomsQueryRound2ParticipantsMs: number;
  roomsQueryRound3Ms: number;
  roomsQueryTransformMs: number;
  roomsQueryPostprocessMs: number;
  unreadMs: number;
  profilesMs: number;
  tradeContextMs: number;
  callsLogMs: number;
  transformMs: number;
  roomCount: number;
  participantCount: number;
  roomsQueryRound1RoomIdCount: number;
  roomsQueryRound2RoomRowCount: number;
  roomsQueryRound2ParticipantRowCount: number;
  roomsQueryRound3RoomProfileCount: number;
  unreadAggregation: string;
  roomsQueryRounds: number;
  additionalLookupRounds: number;
  extraRoomsFetchRounds: number;
  hasPerRoomNPlusOne: boolean;
  callsLogIncluded: boolean;
  discoverableIncluded: boolean;
};

/** 메신저 홈·부트스트랩에서 한 번에 실을 최대 방 수(최근 활동순). 초과분은 목록에서 제외(방 URL 직접 진입은 `getCommunityMessengerRoomSnapshot` 등 별도). */
const COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP = 500;
/** `id in (…)` 메타 조회 시 PostgREST URL 부담을 줄이기 위한 청크 크기 */
const COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK = 120;

type BootstrapRoomIdRpcRow = {
  room_id?: string | null;
  last_message_at?: string | null;
  membership_total_count?: number | null;
};

type BootstrapRoomRowRpc = {
  id?: string | null;
  room_type?: RoomRow["room_type"] | null;
  room_status?: RoomRow["room_status"] | null;
  is_readonly?: boolean | null;
  title?: string | null;
  summary?: string | null;
  avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_type?: RoomRow["last_message_type"] | null;
};

async function fetchBootstrapRoomIdsViaRpc(
  sb: SupabaseLike,
  userId: string
): Promise<{ roomIds: string[]; totalCount: number } | null> {
  const { data, error } = await (sb as any).rpc("community_messenger_bootstrap_my_room_ids", {
    p_user_id: userId,
    p_limit: COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP,
  });
  if (error) {
    if (isMissingRpcFunctionError(error) || isMissingTableError(error)) return null;
    throw error;
  }
  const rows = (data ?? []) as BootstrapRoomIdRpcRow[];
  const roomIds = dedupeIds(rows.map((row) => String(row.room_id ?? "")).filter(Boolean));
  const totalCountRaw = rows[0]?.membership_total_count;
  const totalCount =
    typeof totalCountRaw === "number" && Number.isFinite(totalCountRaw)
      ? totalCountRaw
      : roomIds.length;
  return { roomIds, totalCount };
}

async function fetchBootstrapRoomsViaRpc(
  sb: SupabaseLike,
  roomIds: string[]
): Promise<RoomRow[] | null> {
  const { data, error } = await (sb as any).rpc("community_messenger_bootstrap_rooms", {
    p_room_ids: roomIds,
  });
  if (error) {
    if (isMissingRpcFunctionError(error) || isMissingTableError(error)) return null;
    throw error;
  }
  return ((data ?? []) as BootstrapRoomRowRpc[]).map((row) => ({
    id: String(row.id ?? ""),
    room_type: (row.room_type ?? "direct") as RoomRow["room_type"],
    room_status: (row.room_status ?? "active") as RoomRow["room_status"],
    is_readonly: row.is_readonly === true,
    title: row.title ?? null,
    summary: row.summary ?? null,
    avatar_url: row.avatar_url ?? null,
    last_message: row.last_message ?? null,
    last_message_at: row.last_message_at ?? null,
    last_message_type: (row.last_message_type ?? "text") as RoomRow["last_message_type"],
  }));
}

async function fetchMyRoomsPayload(
  userId: string,
  options?: {
    diagnostics?: CommunityMessengerBootstrapRoomsDiagnostics;
    includeRoomProfiles?: boolean;
  }
): Promise<MessengerRoomsPayload> {
  const diagnostics = options?.diagnostics;
  const includeRoomProfiles = options?.includeRoomProfiles !== false;
  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];

  if (sb) {
    diagnostics && (diagnostics.rounds += 1);
    diagnostics && (diagnostics.queryCount += 1);
    const tRound1 = performance.now();
    let roomIds: string[] = [];
    const rpcRoomIds = await fetchBootstrapRoomIdsViaRpc(sb, userId);
    if (rpcRoomIds) {
      roomIds = rpcRoomIds.roomIds;
      if (diagnostics) {
        diagnostics.roomIdsBeforeCap = rpcRoomIds.totalCount;
        diagnostics.round1RoomIdCount = rpcRoomIds.totalCount;
        diagnostics.roomIdsAfterCap = roomIds.length;
      }
    } else {
      const { data: myParticipants, error: myParticipantsError } = await (sb as any)
        .from("community_messenger_participants")
        .select("room_id")
        .eq("user_id", userId);
      if (!myParticipantsError || !isMissingTableError(myParticipantsError)) {
        roomIds = dedupeIds(
          ((myParticipants ?? []) as Array<{ room_id?: string | null }>).map((row) => String(row.room_id ?? ""))
        );
        if (diagnostics) diagnostics.roomIdsBeforeCap = roomIds.length;
        if (diagnostics) diagnostics.round1RoomIdCount = roomIds.length;
        if (roomIds.length > COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP) {
          const metas: Array<{ id: string; lastAt: string }> = [];
          const chunks: string[][] = [];
          for (let i = 0; i < roomIds.length; i += COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK) {
            chunks.push(roomIds.slice(i, i + COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK));
          }
          if (diagnostics) {
            diagnostics.rounds += 1;
            diagnostics.queryCount += chunks.length;
            diagnostics.metaChunkCount = chunks.length;
          }
          const tTransform = performance.now();
          const metaChunks = await Promise.all(
            chunks.map((chunk) =>
              (sb as any)
                .from("community_messenger_rooms")
                .select("id, last_message_at")
                .in("id", chunk)
            )
          );
          for (const { data: metaRows } of metaChunks) {
            for (const row of (metaRows ?? []) as Array<{ id?: string; last_message_at?: string | null }>) {
              const id = trimText(row.id);
              if (!id) continue;
              metas.push({ id, lastAt: trimText(row.last_message_at) || "" });
            }
          }
          metas.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
          roomIds = metas.slice(0, COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP).map((m) => m.id);
          diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransform));
        }
        if (diagnostics) diagnostics.roomIdsAfterCap = roomIds.length;
      }
    }
    diagnostics && (diagnostics.round1Ms = Math.round(performance.now() - tRound1));
    if (roomIds.length) {
      diagnostics && (diagnostics.rounds += 1);
      diagnostics && (diagnostics.queryCount += 2);
      const tRound2 = performance.now();
      const roomsPromise = (async () => {
        const tRoomsTotal = performance.now();
        const tRoomsQuery = performance.now();
        const rpcRows = await fetchBootstrapRoomsViaRpc(sb, roomIds);
        const roomRowsRaw =
          rpcRows ??
          (((await (sb as any)
            .from("community_messenger_rooms")
            .select(
              "id, room_type, room_status, is_readonly, title, summary, avatar_url, last_message, last_message_at, last_message_type"
            )
            .in("id", roomIds)
            .order("last_message_at", { ascending: false })).data ?? []) as RoomRow[]);
        diagnostics && (diagnostics.round2RoomsDbFetchMs = Math.round(performance.now() - tRoomsQuery));
        const tRoomsNormalize = performance.now();
        const normalizedRooms = roomRowsRaw.map((row) => row);
        diagnostics && (diagnostics.round2RoomsNormalizeMs = Math.round(performance.now() - tRoomsNormalize));
        diagnostics && (diagnostics.round2RoomsMs = Math.round(performance.now() - tRoomsTotal));
        return normalizedRooms;
      })();
      const participantsPromise = (async () => {
        const tParticipantsQuery = performance.now();
        const result = await (sb as any)
          .from("community_messenger_participants")
          .select("room_id, user_id, unread_count, is_muted, is_pinned, is_archived")
          .in("room_id", roomIds);
        diagnostics && (diagnostics.round2ParticipantsMs = Math.round(performance.now() - tParticipantsQuery));
        return result;
      })();
      const [rooms, { data: participants }] = await Promise.all([roomsPromise, participantsPromise]);
      diagnostics && (diagnostics.round2Ms = Math.round(performance.now() - tRound2));
      roomRows = rooms;
      participantRows = (participants ?? []) as ParticipantRow[];
      if (diagnostics) {
        diagnostics.round2RoomRowCount = roomRows.length;
        diagnostics.round2ParticipantRowCount = participantRows.length;
      }
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    let roomIds = dedupeIds(dev.participants.filter((row) => row.userId === userId).map((row) => row.roomId));
    roomRows = dev.rooms
      .filter((room) => roomIds.includes(room.id))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .slice(0, COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP);
    roomIds = roomRows.map((room) => room.id);
    participantRows = dev.participants.filter((row) => roomIds.includes(row.roomId));
  }

  const tPostprocess = performance.now();
  const byRoomId = buildParticipantsByRoomMap(participantRows);
  diagnostics && (diagnostics.postprocessMs = Math.round(performance.now() - tPostprocess));
  if (includeRoomProfiles && roomRows.length && diagnostics) {
    diagnostics.rounds += 1;
    diagnostics.queryCount += 1;
  }
  let roomProfileMap = new Map<string, RoomProfileRow | DevRoomProfile>();
  if (includeRoomProfiles && roomRows.length) {
    const tRound3 = performance.now();
    roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
    diagnostics && (diagnostics.round3Ms = Math.round(performance.now() - tRound3));
    diagnostics && (diagnostics.round3RoomProfileCount = roomProfileMap.size);
  }
  return { roomRows, participantRows, byRoomId, roomProfileMap };
}

async function fetchRoomsPayloadByRoomIds(roomIds: string[]): Promise<MessengerRoomsPayload> {
  const uniqueRoomIds = dedupeIds(roomIds);
  if (!uniqueRoomIds.length) {
    return {
      roomRows: [],
      participantRows: [],
      byRoomId: new Map(),
      roomProfileMap: new Map(),
    };
  }

  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];

  if (sb) {
    const [{ data: rooms, error: roomsError }, { data: participants }] = await Promise.all([
      (sb as any)
        .from("community_messenger_rooms")
        .select(
          "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type"
        )
        .in("id", uniqueRoomIds),
      (sb as any)
        .from("community_messenger_participants")
        .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at")
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

  const byRoomId = buildParticipantsByRoomMap(participantRows);
  const roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
  return { roomRows, participantRows, byRoomId, roomProfileMap };
}

async function loadRoomSummaryMap(
  userId: string,
  roomIds: string[]
): Promise<Map<string, CommunityMessengerRoomSummary>> {
  const uniqueRoomIds = dedupeIds(roomIds);
  const result = new Map<string, CommunityMessengerRoomSummary>();
  if (!uniqueRoomIds.length) return result;

  const payload = await fetchRoomsPayloadByRoomIds(uniqueRoomIds);
  const summaries = await summarizeRoomsBatch(
    userId,
    payload.roomRows,
    payload.participantRows,
    payload.roomProfileMap,
    payload.byRoomId
  );
  for (const summary of summaries) {
    result.set(summary.id, summary);
  }
  return result;
}

/** 홈 `homeRoomIds` 청크 밖 방 — 단일 `CommunityMessengerRoomSummary` (목록 끼워넣기·실시간 보강용). */
export async function getCommunityMessengerSingleRoomSummaryForViewer(
  viewerUserId: string,
  roomId: string
): Promise<CommunityMessengerRoomSummary | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const payload = await fetchRoomsPayloadByRoomIds([rid]);
  if (!payload.roomRows.length) return null;
  const roomParticipants = payload.byRoomId.get(rid) ?? [];
  if (!roomParticipants.some((p) => participantRowUserId(p) === viewerUserId)) return null;
  const summaries = await summarizeRoomsBatch(
    viewerUserId,
    payload.roomRows,
    payload.participantRows,
    payload.roomProfileMap,
    payload.byRoomId
  );
  const summary = summaries[0];
  if (!summary) return null;
  await enrichTradeRoomContextMetaForBootstrap(viewerUserId, [summary]);
  const sbUnread = getSupabaseOrNull();
  if (sbUnread) {
    await enrichMessengerTradeUnreadWithLegacyTrade(sbUnread as any, viewerUserId, [summary]).catch(() => {});
  }
  return summary;
}

type DiscoverableOpenGroupsRawState = MessengerRoomsPayload & { joinedRoomIds: Set<string> };

async function fetchDiscoverableOpenGroupsRawState(userId: string): Promise<DiscoverableOpenGroupsRawState> {
  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];
  let joinedRoomIds = new Set<string>();

  if (sb) {
    const [{ data: rooms, error: roomsError }, { data: myParticipants }] = await Promise.all([
      (sb as any)
        .from("community_messenger_rooms")
        .select(
          "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type"
        )
        .eq("room_type", "open_group")
        .eq("is_discoverable", true)
        .order("last_message_at", { ascending: false })
        .limit(50),
      (sb as any)
        .from("community_messenger_participants")
        .select("room_id")
        .eq("user_id", userId),
    ]);
    if (!roomsError || !isMissingTableError(roomsError)) {
      roomRows = (rooms ?? []) as RoomRow[];
      const roomIdList = dedupeIds(roomRows.map((room) => room.id));
      if (roomIdList.length) {
        const { data: participants } = await (sb as any)
          .from("community_messenger_participants")
          .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at")
          .in("room_id", roomIdList);
        participantRows = (participants ?? []) as ParticipantRow[];
      }
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

  const byRoomId = buildParticipantsByRoomMap(participantRows);
  const roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
  return { roomRows, participantRows, byRoomId, roomProfileMap, joinedRoomIds };
}

export async function listDiscoverableOpenGroupRooms(
  userId: string,
  query?: string
): Promise<CommunityMessengerDiscoverableGroupSummary[]> {
  const keyword = trimText(query).toLowerCase();
  const state = await fetchDiscoverableOpenGroupsRawState(userId);
  const baseSummaries = await summarizeRoomsBatch(
    userId,
    state.roomRows,
    state.participantRows,
    state.roomProfileMap,
    state.byRoomId
  );
  const summaries = baseSummaries
    .map((summary) => {
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
        isJoined: state.joinedRoomIds.has(summary.id),
      };
    })
    .filter(Boolean);

  return summaries as CommunityMessengerDiscoverableGroupSummary[];
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

async function fetchCallLogRowsOnly(userId: string): Promise<Array<CallRow | DevCall>> {
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
  return rows;
}

async function fetchCallSessionParticipantUserIds(sessionIds: string[]): Promise<string[]> {
  if (!sessionIds.length) return [];
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("user_id")
      .in("session_id", sessionIds);
    return dedupeIds(
      ((data ?? []) as Array<{ user_id?: string | null }>)
        .map((row) => trimText(row.user_id))
        .filter(Boolean)
    );
  }
  const dev = getDevState();
  const ids = new Set<string>();
  for (const sid of sessionIds) {
    const session = dev.callSessions.find((item) => item.id === sid);
    if (session?.participants) {
      for (const p of session.participants) {
        ids.add(p.userId);
      }
    }
  }
  return [...ids];
}

async function loadSessionMapsForCallLogs(
  userId: string,
  sessionIds: string[],
  profileById: Map<string, CommunityMessengerProfileLite>
): Promise<{
  sessionMap: Map<string, CallSessionMetaRow | DevCallSession>;
  participantsBySession: Map<string, CommunityMessengerCallParticipant[]>;
}> {
  const sessionMap = new Map<string, CallSessionMetaRow | DevCallSession>();
  const participantsBySession = new Map<string, CommunityMessengerCallParticipant[]>();
  const sb = getSupabaseOrNull();
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
    for (const row of participantRows) {
      const sessionId = trimText(row.session_id) || "";
      const participantUserId = trimText(row.user_id) || "";
      if (!sessionId || !participantUserId) continue;
      const list = participantsBySession.get(sessionId) ?? [];
      const profile = profileById.get(participantUserId);
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
  return { sessionMap, participantsBySession };
}

function buildCallLogEntriesFromRows(
  userId: string,
  rows: Array<CallRow | DevCall>,
  profileById: Map<string, CommunityMessengerProfileLite>,
  roomMetaMap: Map<string, CommunityMessengerRoomSummary>,
  sessionMap: Map<string, CallSessionMetaRow | DevCallSession>,
  participantsBySession: Map<string, CommunityMessengerCallParticipant[]>
): CommunityMessengerCallLog[] {
  return rows.map((row) => {
    const isDbCall = isDbCallLogRow(row);
    const roomId = (isDbCall ? row.room_id : row.roomId) ?? null;
    const sessionId = (isDbCall ? row.session_id : row.sessionId) ?? null;
    const peerUserId = (isDbCall ? row.peer_user_id : row.peerUserId) ?? null;
    const peer = peerUserId ? profileById.get(peerUserId) : undefined;
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

export async function listCommunityMessengerCallLogs(userId: string): Promise<CommunityMessengerCallLog[]> {
  const rows = await fetchCallLogRowsOnly(userId);
  const roomIds = dedupeIds(
    rows.map((row) => callLogRoomId(row)).filter((value): value is string => Boolean(value))
  );
  const sessionIds = dedupeIds(
    rows.map((row) => callLogSessionId(row) ?? "").filter(Boolean)
  );
  const peerIds = dedupeIds(
    rows.map((row) => callLogPeerUserId(row) ?? "").filter(Boolean)
  );
  const roomPayload = await fetchRoomsPayloadByRoomIds(roomIds);
  const sessionParticipantUserIds = await fetchCallSessionParticipantUserIds(sessionIds);
  const allIds = dedupeIds([
    userId,
    ...dedupeParticipantUserIds(roomPayload.participantRows),
    ...peerIds,
    ...sessionParticipantUserIds,
  ]);
  const profileById = new Map(
    (await hydrateProfiles(userId, allIds, { includeSelf: true })).map((p) => [p.id, p])
  );
  const roomMetaMap = new Map(
    summarizeRoomsBatchWithProfileMap(
      userId,
      roomPayload.roomRows,
      roomPayload.roomProfileMap,
      roomPayload.byRoomId,
      profileById
    ).map((s) => [s.id, s])
  );
  const { sessionMap, participantsBySession } = await loadSessionMapsForCallLogs(userId, sessionIds, profileById);
  return buildCallLogEntriesFromRows(userId, rows, profileById, roomMetaMap, sessionMap, participantsBySession);
}

/** `GET /api/community-messenger/rooms` 전용 — 부트스트랩 전체 없이 내 채팅·그룹 목록만 조립 */
export async function listCommunityMessengerMyChatsAndGroups(userId: string): Promise<{
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
}> {
  const myPayload = await fetchMyRoomsPayload(userId);
  const allIds = dedupeIds([userId, ...dedupeParticipantUserIds(myPayload.participantRows)]);
  const profileById = new Map(
    (await hydrateProfiles(userId, allIds, { includeSelf: true })).map((p) => [p.id, p])
  );
  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    myPayload.roomRows,
    myPayload.roomProfileMap,
    myPayload.byRoomId,
    profileById
  );
  await enrichTradeRoomContextMetaForBootstrap(userId, mySummaries);
  const sbList = getSupabaseOrNull();
  if (sbList) {
    await enrichMessengerTradeUnreadWithLegacyTrade(sbList as any, userId, mySummaries).catch(() => {});
  }
  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerGroupRoomType(room.roomType));
  return { chats, groups };
}

type CallSessionProfileHydrationMode = "full" | "labels_only";

async function loadCallSessionParticipants(
  userId: string,
  session: CallSessionRow | DevCallSession,
  /** 방금 insert 직후에는 DB 재조회 없이 메모리 행으로 매핑해 발신 API 지연을 줄인다 */
  preloadedDbRows?: CallSessionParticipantRow[] | null,
  /** `listIncomingCommunityMessengerCallSessions` 배치 경로 — 참가자 행을 이미 묶어 조회했으면 세션당 재조회하지 않는다 */
  profileById?: Map<string, CommunityMessengerProfileLite>,
  dbParticipantsPreloaded?: boolean,
  profileHydration: CallSessionProfileHydrationMode = "full"
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
  if (dbParticipantsPreloaded && isDbSession) {
    rows = preloadedDbRows ?? [];
  } else if (preloadedDbRows && preloadedDbRows.length > 0) {
    rows = preloadedDbRows;
  }
  const sb = getSupabaseOrNull();
  if (!rows.length && isDbSession && sb && !dbParticipantsPreloaded) {
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
  let profileMap: Map<string, CommunityMessengerProfileLite>;
  if (profileById && profileById.size > 0) {
    profileMap = new Map();
    const missing: string[] = [];
    for (const id of memberIds) {
      const p = profileById.get(id);
      if (p) profileMap.set(id, p);
      else missing.push(id);
    }
    const need = dedupeIds(missing);
    if (need.length) {
      const hydrated =
        profileHydration === "labels_only"
          ? await hydrateProfilesLabelsOnly(userId, need, { includeSelf: true })
          : await hydrateProfiles(userId, need, { includeSelf: true });
      for (const p of hydrated) profileMap.set(p.id, p);
    }
  } else {
    const profiles =
      profileHydration === "labels_only"
        ? await hydrateProfilesLabelsOnly(userId, memberIds, { includeSelf: true })
        : await hydrateProfiles(userId, memberIds, { includeSelf: true });
    profileMap = new Map(profiles.map((item) => [item.id, item]));
  }
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
  preloadedParticipantRows?: CallSessionParticipantRow[] | null,
  profileById?: Map<string, CommunityMessengerProfileLite>,
  dbParticipantsPreloaded?: boolean,
  profileHydration: CallSessionProfileHydrationMode = "full"
): Promise<CommunityMessengerCallSession> {
  const isDbSession = "initiator_user_id" in session;
  const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
  const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
  const sessionMode = ((isDbSession ? session.session_mode : session.sessionMode) ?? "direct") as CommunityMessengerCallSessionMode;
  const participants = await loadCallSessionParticipants(
    userId,
    session,
    preloadedParticipantRows,
    profileById,
    dbParticipantsPreloaded,
    profileHydration
  );
  const peerUserId =
    sessionMode === "direct"
      ? messengerUserIdsEqual(initiatorUserId, userId)
        ? recipientUserId
        : initiatorUserId
      : null;
  const joinedCount = participants.filter((item) => item.status === "joined").length;
  const peerLabel =
    sessionMode === "group"
      ? joinedCount > 1
        ? `그룹 통화 · ${joinedCount}명 참여 중`
        : "그룹 통화"
      : (peerUserId
          ? participants.find((p) => p.userId === peerUserId)?.label
          : undefined) ??
        profileLabel(null, peerUserId ?? initiatorUserId);
  let peerAvatarUrl: string | null = null;
  if (sessionMode === "direct" && peerUserId) {
    const peerHydrated =
      profileById?.get(peerUserId) != null
        ? null
        : await hydrateProfilesLabelsOnly(userId, [peerUserId], { includeSelf: true });
    const peerProfile = profileById?.get(peerUserId) ?? peerHydrated?.[0] ?? null;
    peerAvatarUrl = peerProfile?.avatarUrl ?? null;
  }

  return {
    id: session.id,
    roomId: isDbSession ? session.room_id : session.roomId,
    sessionMode,
    initiatorUserId,
    recipientUserId,
    peerUserId,
    peerLabel,
    peerAvatarUrl,
    callKind: (isDbSession ? session.call_kind : session.callKind) as CommunityMessengerCallKind,
    status: (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus,
    startedAt: trimText(isDbSession ? session.started_at : session.startedAt) || nowIso(),
    answeredAt: trimText(isDbSession ? session.answered_at : session.answeredAt) || null,
    endedAt: trimText(isDbSession ? session.ended_at : session.endedAt) || null,
    isMineInitiator: messengerUserIdsEqual(initiatorUserId, userId),
    participants,
  };
}

/** 수신 통화 폴링 전용 — 세션·프로필 조회를 배치로 묶어 지연·Supabase 왕복을 줄인다 */
async function mapIncomingCallSessionsBatch(
  userId: string,
  sessionRows: CallSessionRow[]
): Promise<CommunityMessengerCallSession[]> {
  if (!sessionRows.length) return [];
  const sb = getSupabaseOrNull();
  if (!sb) {
    return Promise.all(sessionRows.map((row) => mapCallSession(userId, row, undefined, undefined, undefined, "labels_only")));
  }
  const sessionIds = dedupeIds(sessionRows.map((r) => r.id));
  const { data: participantRows } = await (sb as any)
    .from("community_messenger_call_session_participants")
    .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true });
  const bySession = new Map<string, CallSessionParticipantRow[]>();
  for (const row of (participantRows ?? []) as CallSessionParticipantRow[]) {
    const sid = trimText(row.session_id);
    if (!sid) continue;
    const list = bySession.get(sid) ?? [];
    list.push(row);
    bySession.set(sid, list);
  }
  const fromSessions = sessionRows.flatMap((r) =>
    [r.initiator_user_id, r.recipient_user_id].filter((v): v is string => typeof v === "string" && v.length > 0)
  );
  const fromParticipants = ((participantRows ?? []) as CallSessionParticipantRow[])
    .map((p) => p.user_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const allUserIds = dedupeIds([...fromSessions, ...fromParticipants]);
  const profileById = new Map(
    (await hydrateProfilesLabelsOnly(userId, allUserIds, { includeSelf: true })).map((p) => [p.id, p])
  );
  return Promise.all(
    sessionRows.map((row) =>
      mapCallSession(userId, row, bySession.get(row.id) ?? [], profileById, true, "labels_only")
    )
  );
}

const ACTIVE_CALL_ROOM_CACHE_TTL_MS = 2500;
const activeCallSessionByUserRoomCache = new Map<string, { expiresAt: number; session: CommunityMessengerCallSession | null }>();

async function getActiveCallSessionForRoom(
  userId: string,
  roomId: string
): Promise<CommunityMessengerCallSession | null> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  const ck = `${uid}\0${rid}`;
  const hit = activeCallSessionByUserRoomCache.get(ck);
  if (hit && hit.expiresAt > Date.now()) return hit.session;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
      )
      .eq("room_id", rid)
      .in("status", ["ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && !error) {
      const mapped = await mapCallSession(userId, data as CallSessionRow, undefined, undefined, undefined, "labels_only");
      activeCallSessionByUserRoomCache.set(ck, {
        expiresAt: Date.now() + ACTIVE_CALL_ROOM_CACHE_TTL_MS,
        session: mapped,
      });
      return mapped;
    }
  }

  const dev = getDevState();
  const session = dev.callSessions
    .filter((item) => item.roomId === roomId && (item.status === "ringing" || item.status === "active"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const mapped = session
    ? await mapCallSession(userId, session, undefined, undefined, undefined, "labels_only")
    : null;
  activeCallSessionByUserRoomCache.set(ck, {
    expiresAt: Date.now() + ACTIVE_CALL_ROOM_CACHE_TTL_MS,
    session: mapped,
  });
  return mapped;
}

export async function getCommunityMessengerCallSessionById(
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSession | null> {
  const id = trimText(sessionId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  if (sb) {
    const [sessionRes, participantRes] = await Promise.all([
      (sb as any)
        .from("community_messenger_call_sessions")
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
        )
        .eq("id", id)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_call_session_participants")
        .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
    ]);
    const { data, error } = sessionRes as { data: unknown; error: unknown };
    if (data && !error) {
      const row = data as CallSessionRow;
      const participantRows = (!participantRes.error && participantRes.data
        ? participantRes.data
        : []) as CallSessionParticipantRow[];
      const participants = dedupeIds(
        participantRows.map((item) => item.user_id).filter((value): value is string => typeof value === "string" && value.length > 0)
      );
      const mode = trimText(row.session_mode ?? "") || "direct";
      const canRead =
        callSessionParticipantsContain(participants, userId) ||
        (mode === "direct" &&
          (messengerUserIdsEqual(row.initiator_user_id, userId) ||
            messengerUserIdsEqual(row.recipient_user_id, userId)));
      if (!canRead) return null;
      return mapCallSession(
        userId,
        row,
        participantRows.length ? participantRows : null,
        undefined,
        participantRows.length > 0,
        "labels_only"
      );
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
  return mapCallSession(userId, session, undefined, undefined, undefined, "labels_only");
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
  status: CommunityMessengerCallStatus,
  durationSeconds?: number
): string {
  const kindLabel = callKind === "video" ? "영상 통화" : "음성 통화";
  const dur = Math.max(0, Math.floor(Number(durationSeconds ?? 0)));
  if (status === "ended" && dur > 0) {
    return `${kindLabel} · ${formatCommunityMessengerCallDurationLabel(dur)}`;
  }
  return `${kindLabel} · ${formatCommunityMessengerCallStubStatus(status)}`;
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
  durationSeconds?: number;
}) {
  if (!input.roomId) return;
  const label = buildCommunityMessengerCallStubLabel(input.callKind, input.status, input.durationSeconds);
  const metadata = {
    callKind: input.callKind,
    callStatus: input.status,
    sessionId: trimText(input.sessionId ?? "") || null,
    durationSeconds:
      input.status === "ended" && Math.max(0, Number(input.durationSeconds ?? 0)) > 0
        ? Math.max(0, Math.floor(Number(input.durationSeconds ?? 0)))
        : null,
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
  userId: string,
  options?: {
    skipDiscoverable?: boolean;
    deferCallLog?: boolean;
    diagnostics?: CommunityMessengerBootstrapDiagnostics;
    detailedTimingBreakdown?: boolean;
  }
): Promise<CommunityMessengerBootstrap> {
  const skipDiscoverable = options?.skipDiscoverable === true;
  const deferCallLog = options?.deferCallLog === true;
  const isMinimalLiteBootstrap = skipDiscoverable && deferCallLog;
  const diagnostics = options?.diagnostics;
  const detailedTimingBreakdown = options?.detailedTimingBreakdown === true;
  const myRoomsDiagnostics: CommunityMessengerBootstrapRoomsDiagnostics = {
    rounds: 0,
    queryCount: 0,
    metaChunkCount: 0,
    roomIdsBeforeCap: 0,
    roomIdsAfterCap: 0,
    round1Ms: 0,
    round2Ms: 0,
    round2RoomsMs: 0,
    round2RoomsDbFetchMs: 0,
    round2RoomsNormalizeMs: 0,
    round2RoomsMergeMapMs: 0,
    round2RoomsHydrateLabelMs: 0,
    round2RoomsPayloadSerializeMs: 0,
    round2ParticipantsMs: 0,
    round3Ms: 0,
    transformMs: 0,
    postprocessMs: 0,
    round1RoomIdCount: 0,
    round2RoomRowCount: 0,
    round2ParticipantRowCount: 0,
    round3RoomProfileCount: 0,
  };
  if (diagnostics) {
    diagnostics.parallelInitialWallMs = 0;
    diagnostics.roomsQueryMs = 0;
    diagnostics.roomsQueryRound1Ms = 0;
    diagnostics.roomsQueryRound2Ms = 0;
    diagnostics.roomsQueryRound2RoomsMs = 0;
    diagnostics.roomsQueryRound2RoomsDbFetchMs = 0;
    diagnostics.roomsQueryRound2RoomsNormalizeMs = 0;
    diagnostics.roomsQueryRound2RoomsMergeMapMs = 0;
    diagnostics.roomsQueryRound2RoomsHydrateLabelMs = 0;
    diagnostics.roomsQueryRound2RoomsPayloadSerializeMs = 0;
    diagnostics.roomsQueryRound2ParticipantsMs = 0;
    diagnostics.roomsQueryRound3Ms = 0;
    diagnostics.roomsQueryTransformMs = 0;
    diagnostics.roomsQueryPostprocessMs = 0;
    diagnostics.unreadMs = 0;
    diagnostics.profilesMs = 0;
    diagnostics.tradeContextMs = 0;
    diagnostics.callsLogMs = 0;
    diagnostics.transformMs = 0;
    diagnostics.roomCount = 0;
    diagnostics.participantCount = 0;
    diagnostics.roomsQueryRound1RoomIdCount = 0;
    diagnostics.roomsQueryRound2RoomRowCount = 0;
    diagnostics.roomsQueryRound2ParticipantRowCount = 0;
    diagnostics.roomsQueryRound3RoomProfileCount = 0;
    diagnostics.unreadAggregation =
      "community_messenger_participants.unread_count + trade legacy unread batch max merge";
    diagnostics.roomsQueryRounds = 0;
    diagnostics.additionalLookupRounds = 0;
    diagnostics.extraRoomsFetchRounds = 0;
    diagnostics.hasPerRoomNPlusOne = false;
    diagnostics.callsLogIncluded = !deferCallLog;
    diagnostics.discoverableIncluded = !skipDiscoverable;
  }
  const myPayloadPromise = (async () => {
    const tRooms = performance.now();
    const payload = await fetchMyRoomsPayload(userId, {
      diagnostics: myRoomsDiagnostics,
      includeRoomProfiles: !isMinimalLiteBootstrap,
    });
    if (diagnostics) {
      diagnostics.roomsQueryMs = Math.round(performance.now() - tRooms);
      diagnostics.roomCount = payload.roomRows.length;
      diagnostics.participantCount = payload.participantRows.length;
      diagnostics.roomsQueryRounds = myRoomsDiagnostics.rounds;
      diagnostics.roomsQueryRound1Ms = myRoomsDiagnostics.round1Ms;
      diagnostics.roomsQueryRound2Ms = myRoomsDiagnostics.round2Ms;
      diagnostics.roomsQueryRound2RoomsMs = myRoomsDiagnostics.round2RoomsMs;
      diagnostics.roomsQueryRound2RoomsDbFetchMs = myRoomsDiagnostics.round2RoomsDbFetchMs;
      diagnostics.roomsQueryRound2RoomsNormalizeMs = myRoomsDiagnostics.round2RoomsNormalizeMs;
      diagnostics.roomsQueryRound2RoomsMergeMapMs = myRoomsDiagnostics.round2RoomsMergeMapMs;
      diagnostics.roomsQueryRound2RoomsHydrateLabelMs = myRoomsDiagnostics.round2RoomsHydrateLabelMs;
      diagnostics.roomsQueryRound2RoomsPayloadSerializeMs = myRoomsDiagnostics.round2RoomsPayloadSerializeMs;
      diagnostics.roomsQueryRound2ParticipantsMs = myRoomsDiagnostics.round2ParticipantsMs;
      diagnostics.roomsQueryRound3Ms = myRoomsDiagnostics.round3Ms;
      diagnostics.roomsQueryTransformMs = myRoomsDiagnostics.transformMs;
      diagnostics.roomsQueryPostprocessMs = myRoomsDiagnostics.postprocessMs;
      diagnostics.roomsQueryRound1RoomIdCount = myRoomsDiagnostics.round1RoomIdCount;
      diagnostics.roomsQueryRound2RoomRowCount = myRoomsDiagnostics.round2RoomRowCount;
      diagnostics.roomsQueryRound2ParticipantRowCount = myRoomsDiagnostics.round2ParticipantRowCount;
      diagnostics.roomsQueryRound3RoomProfileCount = myRoomsDiagnostics.round3RoomProfileCount;
    }
    return payload;
  })();
  const callRowsPromise = deferCallLog
    ? Promise.resolve<Array<CallRow | DevCall>>([])
    : (async () => {
        const tCalls = performance.now();
        const rows = await fetchCallLogRowsOnly(userId);
        diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tCalls));
        return rows;
      })();
  const tParallelInitial = performance.now();
  const [
    friendIds,
    favoriteFriendIds,
    followingIds,
    hiddenIds,
    blockedIds,
    requestRows,
    myPayload,
    discState,
    callRows,
    friendshipAcceptedAtByPeer,
  ] = await Promise.all([
    listAcceptedFriendIds(userId),
    listFavoriteFriendIds(userId),
    listFollowingIds(userId, "neighbor_follow"),
    listFollowingIds(userId, "hidden"),
    listFollowingIds(userId, "blocked"),
    listCommunityMessengerFriendRequestRows(userId),
    myPayloadPromise,
    skipDiscoverable
      ? Promise.resolve<DiscoverableOpenGroupsRawState>({
          roomRows: [],
          participantRows: [],
          byRoomId: new Map(),
          roomProfileMap: new Map(),
          joinedRoomIds: new Set(),
        })
      : fetchDiscoverableOpenGroupsRawState(userId),
    callRowsPromise,
    fetchFriendshipAcceptedAtByPeerId(userId),
  ]);
  diagnostics && (diagnostics.parallelInitialWallMs = Math.round(performance.now() - tParallelInitial));
  if (isMinimalLiteBootstrap && diagnostics) {
    diagnostics.unreadAggregation = "community_messenger_participants.unread_count";
  }

  const callRoomIds = dedupeIds(
    callRows.map((row) => callLogRoomId(row)).filter((value): value is string => Boolean(value))
  );
  const myRoomIdSet = new Set(myPayload.roomRows.map((r) => r.id));
  const missingCallRoomIds = callRoomIds.filter((id) => !myRoomIdSet.has(id));
  const shouldHydrateCallData = !deferCallLog && callRows.length > 0;
  const extraPayload =
    shouldHydrateCallData && missingCallRoomIds.length > 0
      ? await (async () => {
          const tExtraRooms = performance.now();
          const payload = await fetchRoomsPayloadByRoomIds(missingCallRoomIds);
          diagnostics && (diagnostics.extraRoomsFetchRounds += 1);
          diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tExtraRooms));
          return payload;
        })()
      : null;

  const sessionIds = shouldHydrateCallData
    ? dedupeIds(callRows.map((row) => callLogSessionId(row) ?? "").filter(Boolean))
    : [];
  const sessionParticipantUserIds = shouldHydrateCallData
    ? await (async () => {
        const tSessionUsers = performance.now();
        const ids = await fetchCallSessionParticipantUserIds(sessionIds);
        diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tSessionUsers));
        return ids;
      })()
    : [];

  const peerIdsFromCalls = dedupeIds(
    callRows.map((row) => callLogPeerUserId(row) ?? "").filter(Boolean)
  );

  const allIds = dedupeIds([
    userId,
    ...friendIds,
    ...favoriteFriendIds,
    ...followingIds,
    ...hiddenIds,
    ...blockedIds,
    ...requestRows.flatMap((row) => [row.requester_id, row.addressee_id]),
    ...dedupeParticipantUserIds(myPayload.participantRows),
    ...dedupeParticipantUserIds(discState.participantRows),
    ...(extraPayload ? dedupeParticipantUserIds(extraPayload.participantRows) : []),
    ...peerIdsFromCalls,
    ...sessionParticipantUserIds,
  ]);

  const tProfiles = performance.now();
  const { profileMap } = await hydrateProfilesLabelsOnlyWithMap(userId, allIds, { includeSelf: true });
  diagnostics && (diagnostics.profilesMs = Math.round(performance.now() - tProfiles));
  const allProfiles = buildProfilesFromKnownRelations({
    viewerId: userId,
    targetIds: allIds,
    profileMap,
    friendIds,
    favoriteFriendIds,
    followingIds,
    hiddenIds,
    blockedIds,
    friendshipAcceptedAtByPeer,
  });
  const profileById = new Map(allProfiles.map((profile) => [profile.id, profile]));

  const tTransformCore = performance.now();
  const me = profileById.get(userId) ?? null;
  const friends = friendIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile))
    .map((profile) => ({
      ...profile,
      friendshipAcceptedAt: friendshipAcceptedAtByPeer.get(profile.id) ?? null,
    }));
  const following = followingIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
  const hidden = hiddenIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
  const blocked = blockedIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
  const requests = buildCommunityMessengerFriendRequestsFromProfileMap(userId, requestRows, profileMap);
  const hiddenIdSet = new Set(hidden.map((profile) => profile.id));

  const tRoomsHydrateLabel = performance.now();
  const mySummaries = summarizeRoomsBatchWithProfileMap(userId, myPayload.roomRows, myPayload.roomProfileMap, myPayload.byRoomId, profileById);
  diagnostics && (diagnostics.roomsQueryRound2RoomsHydrateLabelMs = Math.round(performance.now() - tRoomsHydrateLabel));
  diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransformCore));
  if (!isMinimalLiteBootstrap) {
    const tTrade = performance.now();
    await enrichTradeRoomContextMetaForBootstrap(userId, mySummaries);
    diagnostics && (diagnostics.tradeContextMs = Math.round(performance.now() - tTrade));
    const sbBoot = getSupabaseOrNull();
    if (sbBoot) {
      const tUnread = performance.now();
      await enrichMessengerTradeUnreadWithLegacyTrade(sbBoot as any, userId, mySummaries).catch(() => {});
      diagnostics && (diagnostics.unreadMs = Math.round(performance.now() - tUnread));
    }
  }
  const tTransformLists = performance.now();
  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerGroupRoomType(room.roomType));

  const discSummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    discState.roomRows,
    discState.roomProfileMap,
    discState.byRoomId,
    profileById
  );
  const discoverableGroups = discSummaries
    .map((summary) => {
      if (summary.roomType !== "open_group") return null;
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
        isJoined: discState.joinedRoomIds.has(summary.id),
      };
    })
    .filter(Boolean) as CommunityMessengerDiscoverableGroupSummary[];

  const tRoomsMergeMap = performance.now();
  const roomSummaryMap = new Map<string, CommunityMessengerRoomSummary>();
  for (const s of mySummaries) roomSummaryMap.set(s.id, s);
  diagnostics && (diagnostics.roomsQueryRound2RoomsMergeMapMs = Math.round(performance.now() - tRoomsMergeMap));
  if (extraPayload) {
    const extraSummaries = summarizeRoomsBatchWithProfileMap(
      userId,
      extraPayload.roomRows,
      extraPayload.roomProfileMap,
      extraPayload.byRoomId,
      profileById
    );
    for (const s of extraSummaries) roomSummaryMap.set(s.id, s);
  }
  if (diagnostics && detailedTimingBreakdown) {
    const tRoomsSerialize = performance.now();
    JSON.stringify({ chats, groups });
    diagnostics.roomsQueryRound2RoomsPayloadSerializeMs = Math.round(performance.now() - tRoomsSerialize);
  }
  diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransformLists));

  const { sessionMap, participantsBySession } = shouldHydrateCallData
    ? await (async () => {
        const tSessionMaps = performance.now();
        const maps = await loadSessionMapsForCallLogs(userId, sessionIds, profileById);
        diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tSessionMaps));
        return maps;
      })()
    : {
        sessionMap: new Map<string, CallSessionMetaRow | DevCallSession>(),
        participantsBySession: new Map<string, CommunityMessengerCallParticipant[]>(),
      };
  const tTransformCalls = performance.now();
  const calls = buildCallLogEntriesFromRows(
    userId,
    callRows,
    profileById,
    roomSummaryMap,
    sessionMap,
    participantsBySession
  );
  diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransformCalls));

  const base: CommunityMessengerBootstrap = {
    me,
    tabs: {
      friends: friends.filter((profile) => !hiddenIdSet.has(profile.id)).length,
      chats: chats.length,
      groups: groups.length,
      calls: calls.length,
    },
    friends,
    following,
    hidden,
    blocked,
    requests,
    chats,
    groups,
    discoverableGroups,
    calls,
  };
  if (diagnostics) {
    diagnostics.additionalLookupRounds =
      (diagnostics.profilesMs > 0 ? 1 : 0) +
      (diagnostics.tradeContextMs > 0 ? 2 : 0) +
      (diagnostics.unreadMs > 0 ? 3 : 0) +
      (shouldHydrateCallData && diagnostics.callsLogMs > 0 ? 3 : 0);
  }
  return deferCallLog ? { ...base, deferredCallLog: true as const } : base;
}

async function enrichTradeRoomContextMetaForBootstrap(
  userId: string,
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  const sb = getSupabaseOrNull();
  if (!sb) return;
  const targets = summaries.filter(
    (s) => s.contextMeta?.kind === "trade" && Boolean(s.contextMeta.productChatId?.trim())
  );
  if (!targets.length) return;
  const productChatIds = dedupeIds(targets.map((s) => s.contextMeta?.productChatId?.trim() ?? "").filter(Boolean));
  if (!productChatIds.length) return;

  const { data: pcs } = await (sb as any)
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id")
    .in("id", productChatIds);
  const byPcId = new Map<string, { postId: string; sellerId: string; buyerId: string }>();
  for (const row of (pcs ?? []) as Array<{ id?: unknown; post_id?: unknown; seller_id?: unknown; buyer_id?: unknown }>) {
    const pcid = trimText(row.id);
    const postId = trimText(row.post_id);
    const sellerId = trimText(row.seller_id);
    const buyerId = trimText(row.buyer_id);
    if (!pcid || !postId || !sellerId || !buyerId) continue;
    byPcId.set(pcid, { postId, sellerId, buyerId });
  }
  const postIds = dedupeIds([...byPcId.values()].map((v) => v.postId));
  const { data: posts } = await (sb as any)
    .from(POSTS_TABLE_READ)
    .select("id, title, price, currency, images, status, seller_listing_state")
    .in("id", postIds);
  const postById = new Map<string, any>(((posts ?? []) as any[]).map((p) => [trimText(p.id), p]));

  for (const s of targets) {
    const pcid = s.contextMeta?.productChatId?.trim() ?? "";
    const pc = byPcId.get(pcid);
    if (!pc) continue;
    const post = postById.get(pc.postId);
    const title = typeof post?.title === "string" ? post.title.trim() : "";
    const priceRaw = post?.price;
    const price =
      typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
    const currency = typeof post?.currency === "string" && post.currency.trim() ? post.currency.trim() : "PHP";
    const role: "seller" | "buyer" = userId === pc.sellerId ? "seller" : "buyer";
    const meta = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: pcid,
      productTitle: title || "거래",
      price: price != null && !Number.isNaN(price) ? price : null,
      currency,
      role,
      sellerListingStateRaw: post?.seller_listing_state,
      postStatus: post?.status ?? null,
      thumbnailUrl: firstPostThumbnailForTradeMeta(post?.images),
    });
    s.contextMeta = meta;
  }
}

export async function listCommunityMessengerFriends(userId: string): Promise<CommunityMessengerProfileLite[]> {
  const [friendIds, hiddenIds, friendshipAcceptedAtByPeer] = await Promise.all([
    listAcceptedFriendIds(userId),
    listFollowingIds(userId, "hidden"),
    fetchFriendshipAcceptedAtByPeerId(userId),
  ]);
  const hiddenIdSet = new Set(hiddenIds);
  const profiles = await hydrateProfiles(
    userId,
    friendIds.filter((id) => !hiddenIdSet.has(id))
  );
  return profiles.map((profile) => ({
    ...profile,
    friendshipAcceptedAt: friendshipAcceptedAtByPeer.get(profile.id) ?? null,
  }));
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
): Promise<{
  ok: boolean;
  request?: CommunityMessengerFriendRequest;
  error?: string;
  /** 상대가 보낸 pending 을 내가 친구추가로 흡수해 수락 처리한 경우 */
  mergedFromIncoming?: boolean;
  directRoomId?: string;
  /** `error === "reject_cooldown_active"` 일 때 재시도 가능 시각까지 남은 ms (올림) */
  retryAfterMs?: number;
}> {
  const target = trimText(targetUserId);
  if (!target || target === userId) return { ok: false, error: "bad_target" };
  if (!(await ensureNoBlockedEitherWay(userId, target))) {
    return { ok: false, error: "blocked_target" };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: existingError } = await (sb as any)
      .from("community_friend_requests")
      .select("id, requester_id, addressee_id, status, created_at, responded_at")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${userId})`
      )
      .limit(1)
      .maybeSingle();
    if (existing && !existingError) {
      const row = existing as RequestRow;
      if (row.status === "accepted") return { ok: false, error: "already_friend" };
      /** 교차 요청: B→A pending 인데 A가 친구추가 → 새 행 없이 기존 요청을 A가 수락한 것으로 처리 */
      if (row.status === "pending" && row.requester_id === target) {
        const outcome = await respondCommunityMessengerFriendRequest(userId, row.id, "accept");
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          mergedFromIncoming: true,
          directRoomId: outcome.directRoomId,
        };
      }
      if (row.status === "pending" && row.requester_id === userId) {
        return { ok: false, error: "already_requested" };
      }
      const cooldownRemain = remainingFriendRejectCooldownMs(row, userId, target, Date.now());
      if (cooldownRemain > 0) {
        return {
          ok: false,
          error: "reject_cooldown_active",
          retryAfterMs: Math.ceil(cooldownRemain),
        };
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
        void notifyCommunityMessengerFriendRequestReceived(sb as any, {
          addresseeUserId: row.addressee_id,
          requestId: row.id,
          requesterUserId: row.requester_id,
          requesterLabel: profileLabel(profileMap.get(row.requester_id), row.requester_id),
        });
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
      const outcome = await respondCommunityMessengerFriendRequest(userId, existing.id, "accept");
      if (!outcome.ok) return outcome;
      return {
        ok: true,
        mergedFromIncoming: true,
        directRoomId: outcome.directRoomId,
      };
    }
    if (existing.status === "pending") return { ok: false, error: "already_requested" };
    const cooldownRemain = remainingFriendRejectCooldownMs(existing, userId, target, Date.now());
    if (cooldownRemain > 0) {
      return {
        ok: false,
        error: "reject_cooldown_active",
        retryAfterMs: Math.ceil(cooldownRemain),
      };
    }
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
): Promise<{ ok: boolean; error?: string; directRoomId?: string }> {
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
      if (!error) {
        let directRoomId: string | undefined;
        if (action === "accept") {
          const requesterId = trimText(request.requester_id);
          const addresseeId = trimText(request.addressee_id);
          if (requesterId && addresseeId) {
            const roomOut = await ensureCommunityMessengerDirectRoom(addresseeId, requesterId);
            if (!roomOut.ok) {
              console.warn("[community-messenger] accept friend: direct room ensure failed", roomOut.error);
            } else if (roomOut.roomId) {
              directRoomId = roomOut.roomId;
            }
            const profileMap = await fetchProfilesByIds([requesterId, addresseeId]);
            void notifyCommunityMessengerFriendRequestAccepted(sb as any, {
              requesterUserId: requesterId,
              requestId: id,
              addresseeUserId: addresseeId,
              addresseeLabel: profileLabel(profileMap.get(addresseeId), addresseeId),
            });
          }
        } else if (action === "reject") {
          const requesterId = trimText(request.requester_id);
          const addresseeId = trimText(request.addressee_id);
          if (requesterId && addresseeId) {
            const profileMap = await fetchProfilesByIds([requesterId, addresseeId]);
            void notifyCommunityMessengerFriendRequestRejected(sb as any, {
              requesterUserId: requesterId,
              requestId: id,
              addresseeUserId: addresseeId,
              addresseeLabel: profileLabel(profileMap.get(addresseeId), addresseeId),
            });
          }
        }
        return directRoomId ? { ok: true, directRoomId } : { ok: true };
      }
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
  request.responded_at = nowIso();
  let directRoomId: string | undefined;
  if (action === "accept") {
    const requesterId = trimText(request.requester_id);
    const addresseeId = trimText(request.addressee_id);
    if (requesterId && addresseeId) {
      const roomOut = await ensureCommunityMessengerDirectRoom(addresseeId, requesterId);
      if (!roomOut.ok) {
        console.warn("[community-messenger] accept friend (dev): direct room ensure failed", roomOut.error);
      } else if (roomOut.roomId) {
        directRoomId = roomOut.roomId;
      }
    }
  }
  return directRoomId ? { ok: true, directRoomId } : { ok: true };
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

export async function toggleCommunityMessengerHiddenFriend(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; isHidden?: boolean; error?: string }> {
  const target = trimText(targetUserId);
  if (!target || !(await isFriend(userId, target))) {
    return { ok: false, error: "friend_required" };
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: selectError } = await (sb as any)
      .from("user_relationships")
      .select("id")
      .eq("user_id", userId)
      .eq("target_user_id", target)
      .or("relation_type.eq.hidden,type.eq.hidden")
      .maybeSingle();
    if (!selectError || !isMissingTableError(selectError)) {
      if (existing?.id) {
        const { error } = await (sb as any).from("user_relationships").delete().eq("id", existing.id);
        if (!error) return { ok: true, isHidden: false };
        return { ok: false, error: String(error.message ?? "friend_hide_update_failed") };
      }
      const { error } = await (sb as any).from("user_relationships").insert({
        user_id: userId,
        target_user_id: target,
        type: "hidden",
        relation_type: "hidden",
      });
      if (!error) return { ok: true, isHidden: true };
      return { ok: false, error: String(error.message ?? "friend_hide_update_failed") };
    }
  }

  const dev = getDevState();
  const hidden = dev.hiddenFriends.get(userId) ?? new Set<string>();
  if (hidden.has(target)) {
    hidden.delete(target);
    dev.hiddenFriends.set(userId, hidden);
    return { ok: true, isHidden: false };
  }
  hidden.add(target);
  dev.hiddenFriends.set(userId, hidden);
  return { ok: true, isHidden: true };
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
    const { error: favoriteDeleteError } = await (sb as any)
      .from("community_friend_favorites")
      .delete()
      .or(
        `and(user_id.eq.${userId},target_user_id.eq.${target}),and(user_id.eq.${target},target_user_id.eq.${userId})`
      );
    if (favoriteDeleteError && !isMissingTableError(favoriteDeleteError)) {
      return { ok: false, error: String(favoriteDeleteError.message ?? "friend_favorite_cleanup_failed") };
    }
    const { error: hiddenDeleteError } = await (sb as any)
      .from("user_relationships")
      .delete()
      .eq("user_id", userId)
      .eq("target_user_id", target)
      .or("relation_type.eq.hidden,type.eq.hidden");
    if (hiddenDeleteError && !isMissingTableError(hiddenDeleteError)) {
      return { ok: false, error: String(hiddenDeleteError.message ?? "friend_hidden_cleanup_failed") };
    }
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
  dev.hiddenFriends.get(userId)?.delete(target);
  return { ok: true };
}

/**
 * 커뮤니티 차단(`user_relationships.blocked`) 시 친구·요청·즐겨찾기·숨김 관계를 정리합니다.
 * 차단 행 자체는 호출 측에서 이미 반영된 뒤 호출하는 것을 전제로 합니다.
 */
export async function cleanupCommunityMessengerFriendGraphOnBlock(
  blockerUserId: string,
  blockedUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const a = trimText(blockerUserId);
  const b = trimText(blockedUserId);
  if (!a || !b || a === b) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: rows, error: selectError } = await (sb as any)
      .from("community_friend_requests")
      .select("id")
      .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`);
    if (selectError && !isMissingTableError(selectError)) {
      return { ok: false, error: String(selectError.message ?? "friend_request_pair_lookup_failed") };
    }
    for (const row of (rows ?? []) as Array<{ id?: string }>) {
      const id = trimText(row.id);
      if (!id) continue;
      const { error: delErr } = await (sb as any).from("community_friend_requests").delete().eq("id", id);
      if (delErr && !isMissingTableError(delErr)) {
        return { ok: false, error: String(delErr.message ?? "friend_request_delete_failed") };
      }
    }

    const { error: favoriteDeleteError } = await (sb as any)
      .from("community_friend_favorites")
      .delete()
      .or(`and(user_id.eq.${a},target_user_id.eq.${b}),and(user_id.eq.${b},target_user_id.eq.${a})`);
    if (favoriteDeleteError && !isMissingTableError(favoriteDeleteError)) {
      return { ok: false, error: String(favoriteDeleteError.message ?? "friend_favorite_cleanup_failed") };
    }

    for (const [uid, tid] of [
      [a, b],
      [b, a],
    ] as const) {
      const { error: hiddenDeleteError } = await (sb as any)
        .from("user_relationships")
        .delete()
        .eq("user_id", uid)
        .eq("target_user_id", tid)
        .or("relation_type.eq.hidden,type.eq.hidden");
      if (hiddenDeleteError && !isMissingTableError(hiddenDeleteError)) {
        return { ok: false, error: String(hiddenDeleteError.message ?? "friend_hidden_cleanup_failed") };
      }
    }

    return { ok: true };
  }

  const dev = getDevState();
  dev.friendRequests = dev.friendRequests.filter((row) => {
    const samePair =
      (row.requester_id === a && row.addressee_id === b) || (row.requester_id === b && row.addressee_id === a);
    return !samePair;
  });
  dev.favoriteFriends.get(a)?.delete(b);
  dev.favoriteFriends.get(b)?.delete(a);
  dev.hiddenFriends.get(a)?.delete(b);
  dev.hiddenFriends.get(b)?.delete(a);
  return { ok: true };
}

async function verifyUserIsProductChatCounterpart(
  userId: string,
  peerUserId: string,
  productChatId: string
): Promise<boolean> {
  const pid = trimText(productChatId);
  if (!pid) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
  const { data } = await (sb as any)
    .from("product_chats")
    .select("seller_id, buyer_id")
    .eq("id", pid)
    .maybeSingle();
  if (!data) return false;
  const seller = trimText((data as { seller_id?: unknown }).seller_id);
  const buyer = trimText((data as { buyer_id?: unknown }).buyer_id);
  if (!seller || !buyer) return false;
  return (
    (userId === seller && peerUserId === buyer) || (userId === buyer && peerUserId === seller)
  );
}

async function verifyUserIsItemTradeRoomCounterpart(
  userId: string,
  peerUserId: string,
  itemTradeChatRoomId: string
): Promise<boolean> {
  const cid = trimText(itemTradeChatRoomId);
  if (!cid) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
  const { data } = await (sb as any)
    .from("chat_rooms")
    .select("room_type, seller_id, buyer_id")
    .eq("id", cid)
    .maybeSingle();
  if (!data) return false;
  const rt = String((data as { room_type?: unknown }).room_type ?? "");
  if (rt !== "item_trade") return false;
  const seller = trimText((data as { seller_id?: unknown }).seller_id);
  const buyer = trimText((data as { buyer_id?: unknown }).buyer_id);
  if (!seller || !buyer) return false;
  return (
    (userId === seller && peerUserId === buyer) || (userId === buyer && peerUserId === seller)
  );
}

async function verifyUserIsStoreOrderChatCounterpart(
  userId: string,
  peerUserId: string,
  storeOrderId: string
): Promise<boolean> {
  const oid = trimText(storeOrderId);
  if (!oid) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
  const { data } = await (sb as any)
    .from("order_chat_rooms")
    .select("buyer_user_id, owner_user_id")
    .eq("order_id", oid)
    .maybeSingle();
  if (!data) return false;
  const buyer = trimText((data as { buyer_user_id?: unknown }).buyer_user_id);
  const owner = trimText((data as { owner_user_id?: unknown }).owner_user_id);
  if (!buyer || !owner) return false;
  return (
    (userId === buyer && peerUserId === owner) || (userId === owner && peerUserId === buyer)
  );
}

/**
 * `direct_key` 로 찾은 기존 방 — INSERT 없이 재사용할 때 양쪽 `community_messenger_participants` 가
 * 모두 있는지 보장한다(과거 레이스·부분 롤백으로 한쪽만 남은 경우 판매자 목록에 방이 안 보임).
 */
async function ensureDirectMessengerRoomParticipantsForPair(
  sb: any,
  roomId: string,
  openerUserId: string,
  peerUserId: string
): Promise<void> {
  const rid = trimText(roomId);
  const opener = trimText(openerUserId);
  const peer = trimText(peerUserId);
  if (!rid || !opener || !peer) return;
  const { data: rows, error } = await sb
    .from("community_messenger_participants")
    .select("user_id, role")
    .eq("room_id", rid);
  if (error && !isMissingTableError(error)) return;
  const present = new Map<string, "owner" | "admin" | "member">();
  for (const row of (rows ?? []) as Array<{ user_id?: string; role?: string }>) {
    const uid = trimText(row.user_id);
    if (!uid) continue;
    const r = row.role;
    const role: "owner" | "admin" | "member" =
      r === "owner" || r === "admin" ? (r as "owner" | "admin") : "member";
    present.set(uid, role);
  }
  const hasOwner = [...present.values()].some((role) => role === "owner");
  const toInsert: Array<{ room_id: string; user_id: string; role: "owner" | "member" }> = [];
  if (!present.has(opener)) {
    toInsert.push({ room_id: rid, user_id: opener, role: hasOwner ? "member" : "owner" });
  }
  if (!present.has(peer)) {
    toInsert.push({ room_id: rid, user_id: peer, role: "member" });
  }
  if (!toInsert.length) return;
  const { error: insErr } = await sb.from("community_messenger_participants").insert(toInsert);
  if (insErr && !isUniqueViolationError(insErr)) {
    /* 로그 없이 무시 — 운영은 재시도·다음 ensure 에서 보정 */
  }
}

export async function ensureCommunityMessengerDirectRoom(
  userId: string,
  peerUserId: string,
  options?: { productChatId?: string; storeOrderId?: string; itemTradeChatRoomId?: string }
): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const peerId = trimText(peerUserId);
  if (!peerId || peerId === userId) return { ok: false, error: "bad_peer" };
  const itemTradeChatRoomId = trimText(options?.itemTradeChatRoomId ?? "");
  const productChatId = trimText(options?.productChatId ?? "");
  const storeOrderId = trimText(options?.storeOrderId ?? "");
  let allowWithoutFriend = false;
  if (itemTradeChatRoomId) {
    allowWithoutFriend = await verifyUserIsItemTradeRoomCounterpart(userId, peerId, itemTradeChatRoomId);
  } else if (productChatId) {
    allowWithoutFriend = await verifyUserIsProductChatCounterpart(userId, peerId, productChatId);
  } else if (storeOrderId) {
    allowWithoutFriend = await verifyUserIsStoreOrderChatCounterpart(userId, peerId, storeOrderId);
  }
  if (!(await isFriend(userId, peerId)) && !allowWithoutFriend) return { ok: false, error: "friend_required" };
  if (!(await ensureNoBlockedEitherWay(userId, peerId))) {
    return { ok: false, error: "blocked_target" };
  }
  const basePairKey = directKeyFor(userId, peerId);
  /** 거래·주문은 친구 DM(`basePairKey`)과 동일 키를 쓰지 않음 — 물품별·스레드별 방 유지 */
  const directKey =
    itemTradeChatRoomId !== ""
      ? `trade_item:${itemTradeChatRoomId}`
      : productChatId !== ""
        ? `trade_pc:${productChatId}`
        : storeOrderId !== ""
          ? `trade_order:${storeOrderId}`
          : basePairKey;
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
      const rid = existing.id as string;
      await ensureDirectMessengerRoomParticipantsForPair(sb, rid, userId, peerId);
      return { ok: true, roomId: rid };
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
        if (roomId) {
          await ensureDirectMessengerRoomParticipantsForPair(sb, roomId, userId, peerId);
          return { ok: true, roomId };
        }
      }
      if (!isMissingTableError(roomError)) {
        return { ok: false, error: String(roomError.message ?? "room_create_failed") };
      }
    }
    if (isUniqueViolationError(existingError)) {
      const roomId = await loadExistingRoomId();
      if (roomId) {
        await ensureDirectMessengerRoomParticipantsForPair(sb, roomId, userId, peerId);
        return { ok: true, roomId };
      }
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
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: false,
    allowAdminKick: false,
    allowAdminEditNotice: false,
    allowMemberUpload: true,
    allowMemberCall: true,
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
      isArchived: false,
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
      isArchived: false,
      joinedAt: createdAt,
    }
  );
  return { ok: true, roomId };
}

export type EnsureCommunityMessengerDirectRoomFromProductChatTradeLink = {
  itemTradeChatRoomId?: string | null;
  /** 호출부가 이미 `product_chats` 행을 확보한 경우 `resolveProductChat` DB 왕복 생략 */
  prefetchedProductChat?: ProductChatRow | null;
};

export async function ensureCommunityMessengerDirectRoomFromProductChat(
  userId: string,
  roomIdOrProductChat: string,
  tradeLink?: EnsureCommunityMessengerDirectRoomFromProductChatTradeLink
): Promise<{ ok: boolean; roomId?: string; peerUserId?: string; error?: string }> {
  const rid = trimText(roomIdOrProductChat);
  if (!rid) return { ok: false, error: "bad_room" };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const pref = tradeLink?.prefetchedProductChat ?? null;
  const resolved: ResolveProductChatResult | null =
    pref && trimText(pref.id) === rid
      ? {
          productChat: pref,
          productChatId: pref.id,
          messengerRoomId:
            typeof pref.community_messenger_room_id === "string" && pref.community_messenger_room_id.trim()
              ? pref.community_messenger_room_id.trim()
              : null,
        }
      : await resolveProductChat(sb as any, rid);
  if (!resolved) return { ok: false, error: "product_chat_not_found" };
  const pc = resolved.productChat;
  const seller = trimText(pc.seller_id);
  const buyer = trimText(pc.buyer_id);
  const productChatId = resolved.productChatId;
  if (!seller || !buyer) return { ok: false, error: "product_chat_invalid" };
  if (userId !== seller && userId !== buyer) return { ok: false, error: "not_participant" };
  const peer = userId === seller ? buyer : seller;
  const itemTradeChatRoomId = trimText(tradeLink?.itemTradeChatRoomId ?? "");
  const out = await ensureCommunityMessengerDirectRoom(userId, peer, {
    productChatId,
    ...(itemTradeChatRoomId ? { itemTradeChatRoomId } : {}),
  });
  if (!out.ok || !out.roomId) return { ok: false, error: out.error ?? "room_failed" };
  /** 요약 하이드레이션은 부트스트랩·목록 보강에서도 됨 — `item/start` 응답 RTT 에서 제외 */
  void hydrateTradeMessengerRoomSummaryFromProductChat(userId, productChatId, out.roomId, pc).catch(() => {});
  const sbPersist = getSupabaseOrNull();
  /** `item_trade` 행별 메신저는 `chat_rooms.community_messenger_room_id` 로만 고정 — `product_chats` 단일 행을 덮어쓰지 않음 */
  if (sbPersist && !itemTradeChatRoomId) {
    await persistProductChatMessengerRoomId(sbPersist as never, productChatId, out.roomId);
  }
  return { ok: true, roomId: out.roomId, peerUserId: peer };
}

export async function ensureCommunityMessengerDirectRoomFromStoreOrderChat(
  userId: string,
  orderId: string
): Promise<{ ok: boolean; roomId?: string; peerUserId?: string; error?: string }> {
  const oid = trimText(orderId);
  if (!oid) return { ok: false, error: "bad_order" };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const { data } = await (sb as any)
    .from("order_chat_rooms")
    .select("buyer_user_id, owner_user_id")
    .eq("order_id", oid)
    .maybeSingle();
  if (!data) return { ok: false, error: "order_chat_not_found" };
  const buyer = trimText((data as { buyer_user_id?: unknown }).buyer_user_id);
  const owner = trimText((data as { owner_user_id?: unknown }).owner_user_id);
  if (!buyer || !owner) return { ok: false, error: "order_chat_invalid" };
  if (userId !== buyer && userId !== owner) return { ok: false, error: "not_participant" };
  const peer = userId === buyer ? owner : buyer;
  const out = await ensureCommunityMessengerDirectRoom(userId, peer, { storeOrderId: oid });
  if (!out.ok || !out.roomId) return { ok: false, error: out.error ?? "room_failed" };
  return { ok: true, roomId: out.roomId, peerUserId: peer };
}

/**
 * `store_orders.community_messenger_room_id` — 주문·메신저 1:1 연결(선택 컬럼, 마이그레이션 후 동작).
 * 실패해도 방 생성·딥링크는 이미 성공한 상태이므로 호출부는 best-effort 로 둔다.
 */
export async function syncStoreOrderCommunityMessengerRoomId(input: {
  userId: string;
  storeOrderId: string;
  communityMessengerRoomId: string;
}): Promise<{ ok: boolean }> {
  const oid = trimText(input.storeOrderId);
  const cmRoomId = trimText(input.communityMessengerRoomId);
  const uid = trimText(input.userId);
  if (!oid || !cmRoomId || !uid) return { ok: false };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false };

  const { data: ocr } = await (sb as any)
    .from("order_chat_rooms")
    .select("buyer_user_id, owner_user_id")
    .eq("order_id", oid)
    .maybeSingle();
  if (!ocr) return { ok: false };
  const buyer = trimText((ocr as { buyer_user_id?: unknown }).buyer_user_id);
  const owner = trimText((ocr as { owner_user_id?: unknown }).owner_user_id);
  if (uid !== buyer && uid !== owner) return { ok: false };

  const { error } = await (sb as any).from("store_orders").update({ community_messenger_room_id: cmRoomId }).eq("id", oid);
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false };
    }
    return { ok: false };
  }
  return { ok: true };
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
        notice_text: "",
        allow_admin_invite: true,
        allow_admin_kick: true,
        allow_admin_edit_notice: true,
        allow_member_upload: true,
        allow_member_call: true,
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
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: true,
    allowAdminKick: true,
    allowAdminEditNotice: true,
    allowMemberUpload: true,
    allowMemberCall: true,
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
      isArchived: false,
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
        notice_text: "",
        allow_admin_invite: false,
        allow_admin_kick: false,
        allow_admin_edit_notice: false,
        allow_member_upload: true,
        allow_member_call: true,
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
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: false,
    allowAdminKick: false,
    allowAdminEditNotice: false,
    allowMemberUpload: true,
    allowMemberCall: true,
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
    isArchived: false,
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
      .select("id, room_type, room_status, is_readonly, allow_member_invite, allow_admin_invite, owner_user_id")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room && room.room_type !== "private_group") return { ok: false, error: "not_group_room" };
    if (room && ((room.room_status ?? "active") !== "active" || room.is_readonly === true)) {
      return { ok: false, error: "room_unavailable" };
    }
    const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
    if (!memberValidation.ok) return memberValidation;
    const { data: me } = await (sb as any)
      .from("community_messenger_participants")
      .select("id, role")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!me) return { ok: false, error: "forbidden" };
    const myRole = trimText((me as { role?: string }).role) as "owner" | "admin" | "member";
    const isOwner = trimText((room as { owner_user_id?: string } | null)?.owner_user_id) === input.userId || myRole === "owner";
    const canInvite =
      isOwner ||
      (myRole === "admin" ? (room as { allow_admin_invite?: boolean } | null)?.allow_admin_invite !== false : room?.allow_member_invite !== false);
    if (!canInvite) return { ok: false, error: "forbidden" };
    const { error } = await (sb as any).from("community_messenger_participants").upsert(
      memberIds.map((memberId) => ({
        room_id: roomId,
        user_id: memberId,
        role: "member",
      })),
      { onConflict: "room_id,user_id" }
    );
    if (!error) {
      const invited = await hydrateProfiles(input.userId, memberIds);
      const labels = invited.map((item) => item.label).filter(Boolean).join(", ");
      await appendCommunityMessengerSystemMessage({
        userId: input.userId,
        roomId,
        content: labels ? `멤버 초대 · ${labels}` : "멤버 초대",
      });
      return { ok: true };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "invite_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (room.roomStatus !== "active" || room.isReadonly) return { ok: false, error: "room_unavailable" };
  const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
  if (!memberValidation.ok) return memberValidation;
  const me = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!me) return { ok: false, error: "forbidden" };
  const isOwner = room.ownerUserId === input.userId || me.role === "owner";
  const canInvite = isOwner || (me.role === "admin" ? room.allowAdminInvite !== false : room.allowMemberInvite);
  if (!canInvite) return { ok: false, error: "forbidden" };
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
      isArchived: false,
      joinedAt: nowIso(),
    });
  }
  const invited = await hydrateProfiles(input.userId, memberIds);
  const labels = invited.map((item) => item.label).filter(Boolean).join(", ");
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: labels ? `멤버 초대 · ${labels}` : "멤버 초대",
  });
  return { ok: true };
}

export async function updateCommunityMessengerPrivateGroupNotice(input: {
  userId: string;
  roomId: string;
  noticeText: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const noticeText = trimText(input.noticeText).slice(0, 2000);
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_update_group_notice", {
      p_room_id: roomId,
      p_notice_text: noticeText,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: noticeText ? `공지 수정 · ${noticeText}` : "공지 삭제",
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!me) return { ok: false, error: "forbidden" };
  const canEdit = me.role === "owner" || (me.role === "admin" && room.allowAdminEditNotice !== false);
  if (!canEdit) return { ok: false, error: "forbidden" };
  room.noticeText = noticeText;
  room.noticeUpdatedAt = nowIso();
  room.noticeUpdatedBy = input.userId;
  const createdAt = nowIso();
  dev.messages.push({
    id: randomUUID(),
    roomId,
    senderId: null,
    messageType: "system",
    content: noticeText ? `공지 수정 · ${noticeText}` : "공지 삭제",
    metadata: {},
    createdAt,
  });
  room.lastMessage = noticeText ? `공지 수정 · ${noticeText}` : "공지 삭제";
  room.lastMessageAt = createdAt;
  room.lastMessageType = "system";
  return { ok: true };
}

export async function updateCommunityMessengerPrivateGroupPermissions(input: {
  userId: string;
  roomId: string;
  allowMemberInvite?: boolean;
  allowAdminInvite?: boolean;
  allowAdminKick?: boolean;
  allowAdminEditNotice?: boolean;
  allowMemberUpload?: boolean;
  allowMemberCall?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_update_group_permissions", {
      p_room_id: roomId,
      p_allow_member_invite: input.allowMemberInvite ?? null,
      p_allow_admin_invite: input.allowAdminInvite ?? null,
      p_allow_admin_kick: input.allowAdminKick ?? null,
      p_allow_admin_edit_notice: input.allowAdminEditNotice ?? null,
      p_allow_member_upload: input.allowMemberUpload ?? null,
      p_allow_member_call: input.allowMemberCall ?? null,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: "운영 권한 변경",
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (room.ownerUserId !== input.userId) return { ok: false, error: "forbidden" };
  if (typeof input.allowMemberInvite === "boolean") room.allowMemberInvite = input.allowMemberInvite;
  if (typeof input.allowAdminInvite === "boolean") room.allowAdminInvite = input.allowAdminInvite;
  if (typeof input.allowAdminKick === "boolean") room.allowAdminKick = input.allowAdminKick;
  if (typeof input.allowAdminEditNotice === "boolean") room.allowAdminEditNotice = input.allowAdminEditNotice;
  if (typeof input.allowMemberUpload === "boolean") room.allowMemberUpload = input.allowMemberUpload;
  if (typeof input.allowMemberCall === "boolean") room.allowMemberCall = input.allowMemberCall;
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: "운영 권한 변경",
  });
  return { ok: true };
}

export async function setCommunityMessengerGroupMemberRole(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
  nextRole: "admin" | "member";
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_set_group_member_role", {
      p_room_id: roomId,
      p_target_user_id: targetUserId,
      p_next_role: input.nextRole,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        const target = (await hydrateProfiles(input.userId, [targetUserId]))[0];
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: target
            ? `${input.nextRole === "admin" ? "관리자 지정" : "관리자 해제"} · ${target.label}`
            : input.nextRole === "admin"
              ? "관리자 지정"
              : "관리자 해제",
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  const target = dev.participants.find((item) => item.roomId === roomId && item.userId === targetUserId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (!me || !target) return { ok: false, error: "target_not_found" };
  if (me.role !== "owner" || target.role === "owner" || room.ownerUserId === targetUserId) return { ok: false, error: "forbidden" };
  target.role = input.nextRole;
  const targetProfile = (await hydrateProfiles(input.userId, [targetUserId]))[0];
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: targetProfile
      ? `${input.nextRole === "admin" ? "관리자 지정" : "관리자 해제"} · ${targetProfile.label}`
      : input.nextRole === "admin"
        ? "관리자 지정"
        : "관리자 해제",
  });
  return { ok: true };
}

export async function transferCommunityMessengerGroupOwner(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_transfer_group_owner", {
      p_room_id: roomId,
      p_next_owner_user_id: targetUserId,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        const target = (await hydrateProfiles(input.userId, [targetUserId]))[0];
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: target ? `방장 위임 · ${target.label}` : "방장 위임",
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  const target = dev.participants.find((item) => item.roomId === roomId && item.userId === targetUserId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (!me || !target) return { ok: false, error: "target_not_found" };
  if (room.ownerUserId !== input.userId || me.role !== "owner") return { ok: false, error: "forbidden" };
  if (targetUserId === input.userId) return { ok: false, error: "same_owner" };
  if (target.role === "owner" || room.ownerUserId === targetUserId) return { ok: false, error: "owner_immutable" };
  room.ownerUserId = targetUserId;
  me.role = "admin";
  target.role = "owner";
  const targetProfile = (await hydrateProfiles(input.userId, [targetUserId]))[0];
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: targetProfile ? `방장 위임 · ${targetProfile.label}` : "방장 위임",
  });
  return { ok: true };
}

export async function kickCommunityMessengerGroupMember(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_kick_group_member", {
      p_room_id: roomId,
      p_target_user_id: targetUserId,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        const target = (await hydrateProfiles(input.userId, [targetUserId]))[0];
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: target ? `멤버 내보내기 · ${target.label}` : "멤버 내보내기",
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  const target = dev.participants.find((item) => item.roomId === roomId && item.userId === targetUserId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (!me || !target) return { ok: false, error: "target_not_found" };
  if (target.userId === input.userId || target.role === "owner" || room.ownerUserId === targetUserId) return { ok: false, error: "forbidden" };
  const canKick = me.role === "owner" || (me.role === "admin" && room.allowAdminKick !== false && target.role === "member");
  if (!canKick) return { ok: false, error: "forbidden" };
  dev.participants = dev.participants.filter((item) => !(item.roomId === roomId && item.userId === targetUserId));
  const targetProfile = (await hydrateProfiles(input.userId, [targetUserId]))[0];
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: targetProfile ? `멤버 내보내기 · ${targetProfile.label}` : "멤버 내보내기",
  });
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
      /**
       * `count: "exact"` can be expensive for large rooms (it may scan/index-walk).
       * We only need to know "is it full?" — use limit+1 as a cheap existence check.
       */
      const { data: participantHead, error: participantHeadError } = await (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .limit(Number(room.member_limit ?? 0) > 0 ? Math.max(1, Number(room.member_limit ?? 0)) + 1 : 1);
      if (participantHeadError && !isMissingTableError(participantHeadError)) {
        return { ok: false, error: String(participantHeadError.message ?? "participant_count_failed") };
      }
      const memberLimit = Number(room.member_limit ?? 0);
      if (memberLimit > 0 && (participantHead?.length ?? 0) > memberLimit) return { ok: false, error: "room_full" };
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
      isArchived: false,
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

export async function updateCommunityMessengerParticipantSettings(input: {
  userId: string;
  roomId: string;
  isMuted?: boolean;
  isPinned?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: participant, error: participantError } = await (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (participantError && !isMissingTableError(participantError)) {
      return { ok: false, error: String(participantError.message ?? "participant_lookup_failed") };
    }
    if (participant) {
      const patch: Record<string, boolean> = {};
      if (typeof input.isMuted === "boolean") patch.is_muted = input.isMuted;
      if (typeof input.isPinned === "boolean") patch.is_pinned = input.isPinned;
      if (Object.keys(patch).length === 0) return { ok: true };
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .update(patch)
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_settings_update_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  if (typeof input.isMuted === "boolean") participant.isMuted = input.isMuted;
  if (typeof input.isPinned === "boolean") participant.isPinned = input.isPinned;
  return { ok: true };
}

/**
 * 거래/배달 목록용 `rooms.summary` JSON(v1) 갱신 — 참가자만, direct·그룹만.
 * 스토어 주문 쪽에서는 `buildMessengerContextMetaFromStoreOrder` 로 만든 뒤 호출.
 */
export async function updateCommunityMessengerRoomContextMeta(input: {
  userId: string;
  roomId: string;
  contextMeta: CommunityMessengerRoomContextMetaV1;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const payload = serializeCommunityMessengerRoomContextMeta(input.contextMeta);
  if (!parseCommunityMessengerRoomContextMeta(payload)) {
    return { ok: false, error: "invalid_context_meta" };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: room }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_type, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !room) return { ok: false, error: "room_not_found" };
    const rt = trimText((room as { room_type?: string | null }).room_type);
    if (rt !== "direct" && rt !== "private_group") {
      return { ok: false, error: "context_meta_room_type" };
    }
    const roomStatus = normalizeRoomStatus((room as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((room as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (isReadonly) return { ok: false, error: "room_readonly" };

    const { error } = await (sb as any)
      .from("community_messenger_rooms")
      .update({ summary: payload, updated_at: nowIso() })
      .eq("id", roomId);
    if (!error) return { ok: true };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "summary_update_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  const r = dev.rooms.find((item) => item.id === roomId);
  if (!r) return { ok: false, error: "room_not_found" };
  if (r.roomType !== "direct" && r.roomType !== "private_group") {
    return { ok: false, error: "context_meta_room_type" };
  }
  if (r.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (r.isReadonly) return { ok: false, error: "room_readonly" };
  r.summary = payload;
  return { ok: true };
}

export async function markCommunityMessengerRoomAsRead(input: {
  userId: string;
  roomId: string;
  lastReadMessageId?: string;
}): Promise<{ ok: boolean; error?: string; lastReadAt?: string | null; lastReadMessageId?: string | null }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const requestedLastReadMessageId = trimText(input.lastReadMessageId);
  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant, error: participantError }, latestMessageResult] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      requestedLastReadMessageId
        ? (sb as any)
            .from("community_messenger_messages")
            .select("id")
            .eq("room_id", roomId)
            .eq("id", requestedLastReadMessageId)
            .maybeSingle()
        : (sb as any)
            .from("community_messenger_messages")
            .select("id")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    if (participantError && !isMissingTableError(participantError)) {
      return { ok: false, error: String(participantError.message ?? "participant_lookup_failed") };
    }
    if (participant) {
      const cursorId = trimText((latestMessageResult?.data as { id?: unknown } | null)?.id ?? "") || null;
      const readAt = nowIso();
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .update({ unread_count: 0, last_read_at: readAt, ...(cursorId ? { last_read_message_id: cursorId } : {}) })
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) {
        await syncItemTradeReadWithMessengerRoomMark(sb as any, {
          userId: input.userId,
          communityMessengerRoomId: roomId,
        });
        invalidateOwnerHubBadgeCache(input.userId);
        return { ok: true, lastReadAt: readAt, lastReadMessageId: cursorId };
      }
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_read_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  participant.unreadCount = 0;
  participant.lastReadAt = nowIso();
  const latest = requestedLastReadMessageId
    ? dev.messages.find((item) => item.roomId === roomId && item.id === requestedLastReadMessageId)
    : [...dev.messages]
        .filter((item) => item.roomId === roomId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  participant.lastReadMessageId = latest?.id ?? null;
  invalidateOwnerHubBadgeCache(input.userId);
  return { ok: true, lastReadAt: participant.lastReadAt, lastReadMessageId: participant.lastReadMessageId ?? null };
}

export async function updateCommunityMessengerRoomArchiveState(input: {
  userId: string;
  roomId: string;
  archived: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: participant, error: participantError } = await (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (participantError && !isMissingTableError(participantError)) {
      return { ok: false, error: String(participantError.message ?? "participant_lookup_failed") };
    }
    if (participant) {
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .update({ is_archived: input.archived })
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_archive_update_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!room || !participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  if ("room_type" in room) return { ok: false, error: "room_not_found" };
  participant.isArchived = input.archived;
  return { ok: true };
}

export async function upsertCommunityMessengerPresenceSnapshot(input: {
  userId: string;
  lastSeenAt?: string | null;
  lastPingAt?: string | null;
  lastActivityAt?: string | null;
  appVisibility?: string | null;
  /** 탭/앱 종료 비콘 — DB에서 즉시 OFFLINE 처리 */
  sessionEnd?: boolean;
}): Promise<{ ok: boolean; error?: string; lastSeenAt?: string | null }> {
  const userId = trimText(input.userId);
  if (!userId) return { ok: false, error: "user_required" };
  const now = nowIso();
  const lastSeenAt = trimText(input.lastSeenAt) || now;
  const sb = getSupabaseOrNull();
  if (sb) {
    const sessionEnd = input.sessionEnd === true;
    const row = sessionEnd
      ? {
          user_id: userId,
          last_seen_at: lastSeenAt,
          updated_at: now,
          last_ping_at: null as string | null,
          presence_state_cached: "offline" satisfies CommunityMessengerPresenceState,
          app_visibility: "background",
        }
      : (() => {
          const lastPingAt = trimText(input.lastPingAt) || now;
          const lastActivityAt = trimText(input.lastActivityAt) || lastPingAt;
          const v = trimText(input.appVisibility).toLowerCase();
          const appVisibility =
            v === "foreground" || v === "background" || v === "unknown" ? v : "unknown";
          const derived = derivePresenceFromDbRow({
            nowMs: Date.now(),
            lastPingAtIso: lastPingAt,
            lastActivityAtIso: lastActivityAt,
            lastSeenAtIso: null,
            updatedAtIso: now,
            appVisibility,
          });
          return {
            user_id: userId,
            updated_at: now,
            last_ping_at: lastPingAt,
            last_activity_at: lastActivityAt,
            app_visibility: appVisibility,
            presence_state_cached: derived,
          };
        })();
    const { error } = await (sb as any).from("community_messenger_presence_snapshots").upsert(row, { onConflict: "user_id" });
    if (!error) return { ok: true, lastSeenAt };
    if (!isMissingTableError(error)) {
      return { ok: false, error: String(error.message ?? "presence_upsert_failed") };
    }
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  return { ok: true, lastSeenAt };
}

const COMMUNITY_MESSENGER_SNAPSHOT_MESSAGE_HARD_MAX = 100;

function firstPostThumbnailForTradeMeta(images: unknown): string | null {
  if (images == null) return null;
  if (Array.isArray(images) && images.length > 0) {
    const x = images[0];
    if (typeof x === "string" && x.trim()) return x.trim();
    if (x && typeof x === "object" && "url" in x && typeof (x as { url?: unknown }).url === "string") {
      return String((x as { url: string }).url).trim() || null;
    }
  }
  return null;
}

/** product_chats → CM 방 연결 직후 `summary` 에 거래 메타를 넣어 목록·방 UI(`productChatId`)가 맞도록 한다. */
async function hydrateTradeMessengerRoomSummaryFromProductChat(
  userId: string,
  productChatId: string,
  cmRoomId: string,
  prefetchedPc?: ProductChatRow | null
): Promise<void> {
  const sb = getSupabaseOrNull();
  if (!sb) return;
  const pc =
    prefetchedPc && String(prefetchedPc.id ?? "").trim() === productChatId.trim()
      ? prefetchedPc
      : (await resolveProductChat(sb as never, productChatId))?.productChat;
  if (!pc) return;
  const postId = String(pc.post_id ?? "").trim();
  const { data: post } = await (sb as any)
    .from(POSTS_TABLE_READ)
    .select("title, price, currency, images, status, seller_listing_state")
    .eq("id", postId)
    .maybeSingle();
  const title = typeof post?.title === "string" ? post.title.trim() : "";
  const priceRaw = post?.price;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw)
      ? priceRaw
      : priceRaw != null
        ? Number(priceRaw)
        : null;
  const currency = typeof post?.currency === "string" && post.currency.trim() ? post.currency.trim() : "PHP";
  const seller = trimText((pc as { seller_id?: unknown }).seller_id);
  const role: "seller" | "buyer" = userId === seller ? "seller" : "buyer";
  const meta = buildMessengerContextMetaFromProductChatSnapshot({
    productChatId: productChatId.trim(),
    productTitle: title || "거래",
    price: price != null && !Number.isNaN(price) ? price : null,
    currency,
    role,
    sellerListingStateRaw: (post as any)?.seller_listing_state,
    postStatus: (post as any)?.status ?? null,
    tradeFlowStatus: String(pc.trade_flow_status ?? "chatting"),
    thumbnailUrl: firstPostThumbnailForTradeMeta(post?.images),
  });
  await updateCommunityMessengerRoomContextMeta({
    userId,
    roomId: cmRoomId,
    contextMeta: meta,
  });
}

export type GetCommunityMessengerRoomSnapshotOptions = {
  /** 기본: `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT` (30) */
  initialMessageLimit?: number;
  /**
   * 기본 true. false면 참가자 전원 프로필 하이드레이션을 생략하고
   * 메시지 발신자·방장·DM 상대 등 최소 집합만 로드한다(`membersDeferred`).
   */
  hydrateFullMemberList?: boolean;
  /**
   * true면 `fetchRoomProfilesByRoomIds`·통화·거래 도크·presence·trade unread 보강을 (대부분의 방에서) 생략하고
   * `bootstrapEnrichmentPending` 을 싣는다. **거래/배달 메신저 방**(summary `contextMeta` 또는 `product_chats` 브리지)은
   * 통화·거래 도크·presence 를 첫 스냅샷에 포함한다.
   */
  deferSnapshotSecondary?: boolean;
  diagnostics?: {
    roomBootstrapFetchMs?: number;
    messagesFetchMs?: number;
    participantsProfilesFetchMs?: number;
    normalizeMergeMs?: number;
  };
};

const TRADE_ROOM_DETAIL_ENTRY_CACHE_TTL_MS = 8000;
const tradeRoomDetailEntryCache = new Map<string, { expiresAt: number; room: ChatRoom | null }>();

/** CM 방 `summary` JSON 에서 trade + productChatId 를 읽어 거래 상세(상품 카드)를 로드 — 반복 입장 TTL 캐시 */
function tradeChatRoomDetailPromiseFromMessengerRoomRow(
  room: RoomRow | DevRoom,
  userId: string
): Promise<ChatRoom | null> {
  const raw =
    "room_type" in room
      ? trimText(room.summary ?? "")
      : trimText((room as DevRoom).summary ?? "");
  const meta = parseCommunityMessengerRoomContextMeta(raw);
  if (meta?.kind !== "trade" || !meta.productChatId?.trim()) return Promise.resolve(null);
  const pcid = meta.productChatId.trim();
  const uid = trimText(userId);
  const cacheKey = `${uid}\0${pcid}`;
  const hit = tradeRoomDetailEntryCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.room);
  return loadChatRoomDetailForUser({
    roomId: pcid,
    userId,
    detailScope: "entry",
  })
    .then((res) => {
      const r = res.ok ? res.room : null;
      tradeRoomDetailEntryCache.set(cacheKey, { expiresAt: Date.now() + TRADE_ROOM_DETAIL_ENTRY_CACHE_TTL_MS, room: r });
      if (tradeRoomDetailEntryCache.size > 200) {
        const now = Date.now();
        for (const k of [...tradeRoomDetailEntryCache.keys()].slice(0, 80)) {
          const e = tradeRoomDetailEntryCache.get(k);
          if (!e || e.expiresAt <= now) tradeRoomDetailEntryCache.delete(k);
        }
      }
      return r;
    })
    .catch(() => null);
}

function clampCommunityMessengerSnapshotMessageLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT;
  return Math.min(COMMUNITY_MESSENGER_SNAPSHOT_MESSAGE_HARD_MAX, Math.max(1, n));
}

/** 동일 방·옵션으로 동시에 들어온 스냅샷 요청을 한 번의 로드로 합침(결과 TTL 캐시는 최신 메시지 누락 방지로 두지 않음) */
const roomSnapshotInflight = new Map<string, Promise<CommunityMessengerRoomSnapshot | null>>();

function messengerRoomSnapshotCacheKey(
  userId: string,
  roomId: string,
  messageLimit: number,
  hydrateFullMemberList: boolean,
  deferSnapshotSecondary: boolean
): string {
  return `${trimText(userId)}\0${trimText(roomId).toLowerCase()}\0${messageLimit}\0${hydrateFullMemberList ? "1" : "0"}\0${
    deferSnapshotSecondary ? "1" : "0"
  }`;
}

/** 부트스트랩에서 전원 멤버 프로필을 생략할 때 — 말풍선·헤더에 필요한 최소 user id */
function collectMinimalSnapshotUserIdsForRoomSnapshot(
  userId: string,
  room: RoomRow | DevRoom,
  participants: Array<ParticipantRow | DevParticipant>,
  messages: Array<MessageRow | DevMessage>
): string[] {
  const ids = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = trimText(raw);
    if (t) ids.add(t);
  };
  add(userId);
  const isDbRoom = "room_type" in room;
  const roomType = (isDbRoom ? room.room_type : room.roomType) as CommunityMessengerRoomType;
  const ownerUserId = trimText(
    isDbRoom ? (room.owner_user_id ?? room.created_by) : (room.ownerUserId ?? room.createdBy)
  );
  if (ownerUserId) add(ownerUserId);
  if (roomType === "direct") {
    const peer = dedupeParticipantUserIds(participants).find((uid) => uid !== userId);
    if (peer) add(peer);
  }
  for (const message of messages) {
    const sid = "sender_id" in message ? message.sender_id : message.senderId;
    add(sid);
  }
  return [...ids];
}

/**
 * API·Realtime bump 가 항상 `community_messenger_rooms.id`(원장 UUID)를 쓰도록 URL `roomId` 를 단일화한다.
 * 거래·레거시 키(`product_chats` / `chat_rooms` id 등)는 `resolveProductChat`·`ensureCommunityMessengerDirectRoomFromProductChat` 과 동일 규칙으로 CM 방으로 접는다.
 */
export async function resolveCommunityMessengerCanonicalRoomIdForUser(
  userId: string,
  roomId: string
): Promise<{ ok: true; canonicalRoomId: string } | { ok: false; error: "bad_request" | "room_not_found" }> {
  const id = trimText(roomId);
  if (!id) return { ok: false, error: "bad_request" };
  const sb = getSupabaseOrNull();
  if (!sb) {
    const dev = getDevState();
    const ok = dev.participants.some((p) => p.roomId === id && p.userId === userId);
    return ok ? { ok: true, canonicalRoomId: id } : { ok: false, error: "room_not_found" };
  }
  const { data: participantAt } = await (sb as any)
    .from("community_messenger_participants")
    .select("room_id")
    .eq("room_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const atRoom = trimText((participantAt as { room_id?: unknown } | null)?.room_id as string);
  if (atRoom) {
    return { ok: true, canonicalRoomId: atRoom };
  }
  const { data: roomAtId } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (roomAtId?.id) {
    return { ok: false, error: "room_not_found" };
  }
  const tradeResolved = await resolveProductChat(sb as never, id);
  const bridgedMessengerId = tradeResolved?.messengerRoomId ? trimText(tradeResolved.messengerRoomId) : "";
  if (bridgedMessengerId) {
    const { data: p2 } = await (sb as any)
      .from("community_messenger_participants")
      .select("room_id")
      .eq("room_id", bridgedMessengerId)
      .eq("user_id", userId)
      .maybeSingle();
    if (p2?.room_id) {
      return { ok: true, canonicalRoomId: bridgedMessengerId };
    }
  }
  const bridged = await ensureCommunityMessengerDirectRoomFromProductChat(userId, id);
  if (bridged.ok && bridged.roomId) {
    return { ok: true, canonicalRoomId: bridged.roomId };
  }
  return { ok: false, error: "room_not_found" };
}

/** 스냅샷에 담는 최근 메시지 개수 — `listCommunityMessengerRoomMessagesBefore`와 함께 동작 */
export async function getCommunityMessengerRoomSnapshot(
  userId: string,
  roomId: string,
  options?: GetCommunityMessengerRoomSnapshotOptions
): Promise<CommunityMessengerRoomSnapshot | null> {
  const messageLimit = clampCommunityMessengerSnapshotMessageLimit(options?.initialMessageLimit);
  const hydrateFullMemberList = options?.hydrateFullMemberList !== false;
  const deferSnapshotSecondary = options?.deferSnapshotSecondary === true;
  const id = trimText(roomId);
  if (!id) return null;
  const cacheKey = messengerRoomSnapshotCacheKey(
    userId,
    id,
    messageLimit,
    hydrateFullMemberList,
    deferSnapshotSecondary
  );
  let inflight = roomSnapshotInflight.get(cacheKey);
  if (!inflight) {
    inflight = loadCommunityMessengerRoomSnapshotUncached(userId, roomId, options).finally(() => {
      roomSnapshotInflight.delete(cacheKey);
    });
    roomSnapshotInflight.set(cacheKey, inflight);
  }
  return await inflight;
}

async function loadCommunityMessengerRoomSnapshotUncached(
  userId: string,
  roomId: string,
  options?: GetCommunityMessengerRoomSnapshotOptions
): Promise<CommunityMessengerRoomSnapshot | null> {
  const tBootstrap0 = performance.now();
  const messageLimit = clampCommunityMessengerSnapshotMessageLimit(options?.initialMessageLimit);
  const hydrateFullMemberList = options?.hydrateFullMemberList !== false;
  const diagnostics = options?.diagnostics;
  /** `true` 이면 통화·거래도크·presence 등 2차 묶음을 생략 — 첫 진입은 seed 위주 */
  const deferSecondaryRequested = options?.deferSnapshotSecondary === true;
  let deferSecondary = false;
  let participantsProfilesFetchMs = 0;
  let messagesFetchMs = 0;
  let normalizeMergeMs = 0;
  const id = trimText(roomId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  let room: RoomRow | DevRoom | null = null;
  let participants: Array<ParticipantRow | DevParticipant> = [];
  let messages: Array<MessageRow | DevMessage> = [];
  let roomTotalMemberCount: number | undefined;
  let membersTruncated = false;
  if (sb) {
    const participantSelectCols =
      "id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at, last_read_at, last_read_message_id";
    const participantsQuery = hydrateFullMemberList
      ? (sb as any)
          .from("community_messenger_participants")
          .select(participantSelectCols)
          .eq("room_id", id)
      : (sb as any)
          .from("community_messenger_participants")
          .select(participantSelectCols)
          .eq("room_id", id)
          .limit(COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP + 1);

    const myParticipantQuery = !hydrateFullMemberList
      ? (sb as any)
          .from("community_messenger_participants")
          .select(participantSelectCols)
          .eq("room_id", id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null });

    const roomQuery = (sb as any)
      .from("community_messenger_rooms")
      .select(
        "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type"
      )
      .eq("id", id)
      .maybeSingle();
    const participantsFetch = (async () => {
      const tParticipants0 = performance.now();
      const [participantRes, myParticipantRes] = await Promise.all([participantsQuery, myParticipantQuery]);
      participantsProfilesFetchMs += performance.now() - tParticipants0;
      return {
        participantData: participantRes.data,
        myParticipantData: myParticipantRes.data,
      };
    })();
    const messagesFetch = (async () => {
      const tMessages0 = performance.now();
      const messageRes = await (sb as any)
        .from("community_messenger_messages")
        .select("id, room_id, sender_id, message_type, content, metadata, created_at")
        .eq("room_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(messageLimit);
      messagesFetchMs = performance.now() - tMessages0;
      return messageRes;
    })();
    const [{ data: roomData }, { participantData, myParticipantData }, { data: messageData }] = await Promise.all([
      roomQuery,
      participantsFetch,
      messagesFetch,
    ]);
    room = (roomData as RoomRow | null) ?? null;
    let rawParticipantRows = (participantData ?? []) as ParticipantRow[];
    const myRow = (myParticipantData ?? null) as ParticipantRow | null;
    if (myRow?.user_id === userId && !rawParticipantRows.some((p) => p.user_id === userId)) {
      rawParticipantRows = [...rawParticipantRows, myRow];
    }
    // capped 쿼리만 쓸 때도 `user_id = viewer` 단건으로 멤버십을 확정(그룹·비결정적 limit 조합에서 room 을 잘못 null 처리하지 않음)
    if (room && !rawParticipantRows.some((p) => p.user_id === userId)) {
      room = null;
    } else if (room) {
      // `count: exact` 는 불필요하게 비싸다. 부트스트랩은 표시용이므로 기본은 로드된 rows 수로 충분.
      roomTotalMemberCount = rawParticipantRows.length;
      const roomType = (roomData as RoomRow | null)?.room_type as CommunityMessengerRoomType | undefined;
      if (
        roomData &&
        roomType &&
        isCommunityMessengerGroupRoomType(roomType) &&
        rawParticipantRows.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
      ) {
        const sliced = sliceGroupParticipantsForRoomBootstrap(
          rawParticipantRows,
          userId,
          COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
        );
        participants = sliced.rows;
        membersTruncated = sliced.truncated;
      } else if (!hydrateFullMemberList && rawParticipantRows.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP) {
        participants = rawParticipantRows.slice(0, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP);
        membersTruncated = true;
      } else {
        participants = rawParticipantRows;
      }
      messages = ((messageData ?? []) as MessageRow[]).slice().reverse();
      /** 읽음 처리는 `PATCH ... mark_read`(클라) 단일 경로 — 부트스트랩 GET 은 읽기 전용 */
    }
  }

  /**
   * 거래 URL이 `chat_rooms` / `product_chats` id 인 경우 — 원장 `community_messenger_room_id` 가 있으면
   * 브리지·ensure 없이 CM 방으로 바로 스냅샷. 없으면 기존 ensure 경로.
   */
  if (!room && sb) {
    const tradeResolved = await resolveProductChat(sb as never, id);
    if (tradeResolved?.messengerRoomId) {
      return getCommunityMessengerRoomSnapshot(userId, tradeResolved.messengerRoomId, options);
    }
    const bridged = await ensureCommunityMessengerDirectRoomFromProductChat(userId, id);
    if (bridged.ok && bridged.roomId && bridged.roomId !== id) {
      return getCommunityMessengerRoomSnapshot(userId, bridged.roomId, options);
    }
  }

  if (!room) {
    const dev = getDevState();
    room = dev.rooms.find((row) => row.id === id) ?? null;
    if (!room) return null;
    const allRoomParticipants = dev.participants.filter((row) => row.roomId === id);
    if (!allRoomParticipants.some((row) => ("user_id" in row ? row.user_id : row.userId) === userId)) return null;
    roomTotalMemberCount = allRoomParticipants.length;
    if (
      isCommunityMessengerGroupRoomType(room.roomType) &&
      allRoomParticipants.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
    ) {
      const sliced = sliceGroupParticipantsForRoomBootstrap(
        allRoomParticipants,
        userId,
        COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
      );
      participants = sliced.rows;
      membersTruncated = sliced.truncated;
    } else {
      participants = allRoomParticipants;
    }
    {
      const sorted = dev.messages.filter((row) => row.roomId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      messages =
        sorted.length <= messageLimit ? sorted : sorted.slice(sorted.length - messageLimit);
    }
    const mine = participants.find((row) => ("user_id" in row ? row.user_id : row.userId) === userId);
    if (mine && !("user_id" in mine)) mine.unreadCount = 0;
  }

  if (deferSecondaryRequested && room) {
    deferSecondary = true;
  }

  const allMemberIds = dedupeParticipantUserIds(participants);
  const hydrationUserIds = hydrateFullMemberList
    ? allMemberIds
    : collectMinimalSnapshotUserIdsForRoomSnapshot(userId, room, participants, messages);
  /** 1:1 방 peer presence — summary 이후가 아니라 참가자 행만으로 결정해 `hydrateProfiles` 와 동시에 조회(직렬 대기 제거) */
  const earlyDirectPeerUserId = (() => {
    if (!room) return "";
    const rt = ("room_type" in room ? room.room_type : room.roomType) as string;
    if (rt !== "direct") return "";
    for (const p of participants) {
      const uid = trimText(("user_id" in p ? p.user_id : p.userId) ?? "");
      if (uid && uid !== userId) return uid;
    }
    return "";
  })();
  const roomProfileMapPromise = deferSecondary
    ? Promise.resolve(new Map<string, RoomProfileRow | DevRoomProfile>())
    : fetchRoomProfilesByRoomIds([id]);
  /** 첫 페인트: 관계 집합(`getViewerRelationSets`) 없이 라벨·아바타만 — 통화/거래도크/presence 는 아래 2차에서 */
  const tProfileHydration0 = performance.now();
  const [roomProfileMap, hydratedLabels] = await Promise.all([
    roomProfileMapPromise,
    hydrateProfilesLabelsOnlyWithMap(userId, hydrationUserIds, { includeSelf: true }),
  ]);
  participantsProfilesFetchMs += performance.now() - tProfileHydration0;
  const tSummary0 = performance.now();
  const summary = buildRoomSummaryFromHydratedMembers(userId, room, participants, roomProfileMap, hydratedLabels.members, {
    totalMemberCount: roomTotalMemberCount ?? participants.length,
  });
  normalizeMergeMs += performance.now() - tSummary0;
  let activeCall: CommunityMessengerCallSession | null = null;
  let tradeChatRoomDetail: ChatRoom | null = null;
  let presenceMap = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
  if (!deferSecondary) {
    const peerFromSummary = trimText(summary.peerUserId ?? "");
    const presenceIds = dedupeIds(
      [earlyDirectPeerUserId, peerFromSummary].map((x) => trimText(x)).filter(Boolean)
    );
    /** trade unread 보강과 통화·도크·presence 는 서로 독립 — 직렬보다 병렬로 총 지연 축소 */
    const [, phase2] = await Promise.all([
      (async () => {
        await enrichTradeRoomContextMetaForBootstrap(userId, [summary]);
        if (sb) {
          await enrichMessengerTradeUnreadWithLegacyTrade(sb as any, userId, [summary]).catch(() => {});
        }
      })(),
      Promise.all([
        getActiveCallSessionForRoom(userId, id),
        tradeChatRoomDetailPromiseFromMessengerRoomRow(room, userId),
        presenceIds.length > 0
          ? fetchPresenceSnapshotsByUserIds(presenceIds)
          : Promise.resolve(new Map<string, CommunityMessengerPeerPresenceSnapshot>()),
      ]),
    ]);
    activeCall = phase2[0] as CommunityMessengerCallSession | null;
    tradeChatRoomDetail = phase2[1] as ChatRoom | null;
    presenceMap = phase2[2] as Map<string, CommunityMessengerPeerPresenceSnapshot>;
  } else if (room) {
    /** seed(lite) 부트스트랩 — 통화·presence 는 생략하되 거래 1:1 상단 카드만 즉시 채워 입장 체감 지연을 줄인다. */
    const raw =
      "room_type" in room ? trimText(room.summary ?? "") : trimText((room as DevRoom).summary ?? "");
    const seedTradeMeta = parseCommunityMessengerRoomContextMeta(raw);
    if (seedTradeMeta?.kind === "trade" && seedTradeMeta.productChatId?.trim()) {
      await enrichTradeRoomContextMetaForBootstrap(userId, [summary]);
      if (sb) {
        await enrichMessengerTradeUnreadWithLegacyTrade(sb as any, userId, [summary]).catch(() => {});
      }
      tradeChatRoomDetail = await tradeChatRoomDetailPromiseFromMessengerRoomRow(room, userId);
    }
  }
  const members = hydratedLabels.members.map((profile) =>
    ({
      ...(resolveRoomProfileLite(profile, roomProfileMap.get(roomProfileKey(id, profile.id))) ?? profile),
      memberRole:
        participants.find((item) => ("user_id" in item ? item.user_id : item.userId) === profile.id)?.role ?? undefined,
    }) satisfies CommunityMessengerProfileLite
  );
  const profileMap = hydratedLabels.profileMap;
  const meParticipant = participants.find(
    (item) => ("user_id" in item ? item.user_id : item.userId) === userId
  ) as ParticipantRow | DevParticipant | undefined;
  const meRole = meParticipant?.role ?? "member";
  const peerParticipant =
    summary.roomType === "direct"
      ? participants.find((item) => ("user_id" in item ? item.user_id : item.userId) !== userId)
      : undefined;
  const peerUserId = trimText(summary.peerUserId ?? "");
  const resolvedPresenceMap = presenceMap;
  const readReceipt: CommunityMessengerReadReceipt | null =
    summary.roomType === "direct" && peerParticipant
      ? {
          roomId: id,
          readerUserId: peerUserId || ("user_id" in peerParticipant ? peerParticipant.user_id : peerParticipant.userId),
          lastReadAt: participantLastReadAt(peerParticipant),
          lastReadMessageId: participantLastReadMessageId(peerParticipant),
        }
      : null;
  const peerPresence =
    deferSecondary || !peerUserId ? null : (resolvedPresenceMap.get(peerUserId) ?? null);

  const tMappedMessages0 = performance.now();
  const mappedMessages: CommunityMessengerMessage[] = messages.map((message) => {
    const isDbMessage = "sender_id" in message;
    const senderId = (isDbMessage ? message.sender_id : message.senderId) ?? null;
    const metadata = ((isDbMessage ? message.metadata : message.metadata) ?? {}) as Record<string, unknown>;
    const clientMessageId =
      typeof metadata.client_message_id === "string" && metadata.client_message_id.trim()
        ? metadata.client_message_id.trim()
        : null;
    const safeMt = (isDbMessage ? message.message_type : message.messageType) as CommunityMessengerMessage["messageType"];
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
      messageType: safeMt,
      content: trimText(isDbMessage ? message.content : message.content),
      createdAt: trimText(isDbMessage ? message.created_at : message.createdAt) || nowIso(),
      clientMessageId,
      isMine: senderId === userId,
      callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
      callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
      callSessionId: trimText(metadata.sessionId as string) || null,
      ...(safeMt === "voice"
        ? {
            voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
            voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
            voiceMimeType: trimText(metadata.mimeType as string) || null,
          }
        : {}),
      ...messengerImageClientFieldsFromMetadata(safeMt, metadata, trimText(message.content)),
    };
  });
  normalizeMergeMs += performance.now() - tMappedMessages0;

  const snapshot = {
    viewerUserId: userId,
    room: {
      ...summary,
      description:
        summary.roomType === "direct"
          ? "친구와 1:1로 대화하는 메신저 방"
          : summary.summary ||
            `${summary.memberCount}명이 함께 있는 ${summary.roomType === "open_group" ? "공개" : "비공개"} 그룹 채팅`,
    },
    members,
    ...(hydrateFullMemberList ? {} : { membersDeferred: true as const }),
    ...(membersTruncated ? { membersTruncated: true as const } : {}),
    ...(deferSecondary ? { bootstrapEnrichmentPending: true as const } : {}),
    messages: mappedMessages,
    myRole: meRole,
    ...(readReceipt ? { readReceipt } : {}),
    ...(peerPresence ? { peerPresence } : {}),
    activeCall,
    ...(tradeChatRoomDetail ? { tradeChatRoomDetail } : {}),
  };
  if (diagnostics) {
    diagnostics.roomBootstrapFetchMs = Math.round(performance.now() - tBootstrap0);
    diagnostics.messagesFetchMs = Math.round(messagesFetchMs);
    diagnostics.participantsProfilesFetchMs = Math.round(participantsProfilesFetchMs);
    diagnostics.normalizeMergeMs = Math.round(normalizeMergeMs);
  }
  return snapshot;
}

const COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_DEFAULT = 40;
const COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_MAX = 100;

/** 참가자 목록 페이지 — `sortParticipantsForRoomMemberList` 순서로 offset 슬라이스 (부트스트랩과 동일) */
export async function listCommunityMessengerRoomMembersPage(input: {
  userId: string;
  roomId: string;
  offset?: number;
  limit?: number;
}): Promise<
  | { ok: true; members: CommunityMessengerProfileLite[]; total: number; nextOffset: number | null }
  | { ok: false; error: "room_not_found" | "bad_request" }
> {
  const roomId = trimText(input.roomId);
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const pageLimit = Math.min(
    COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_MAX,
    Math.max(1, Math.floor(Number(input.limit) || COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_DEFAULT))
  );
  if (!roomId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();

  const mapPageRowsToMembers = async (
    pageRows: Array<ParticipantRow | DevParticipant>
  ): Promise<CommunityMessengerProfileLite[]> => {
    const memberIds = dedupeParticipantUserIds(pageRows);
    const roomProfileMap = await fetchRoomProfilesByRoomIds([roomId]);
    const hydrated = await hydrateProfilesWithProfileMap(input.userId, memberIds, { includeSelf: true });
    return hydrated.members.map((profile) =>
      ({
        ...(resolveRoomProfileLite(profile, roomProfileMap.get(roomProfileKey(roomId, profile.id))) ?? profile),
        memberRole: pageRows.find((item) => participantRowUserId(item) === profile.id)?.role ?? undefined,
      }) satisfies CommunityMessengerProfileLite
    );
  };

  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: "bad_request" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const all = dev.participants.filter((p) => p.roomId === roomId);
    const sorted = sortParticipantsForRoomMemberList(all);
    const total = sorted.length;
    const pageRows = sorted.slice(offset, offset + pageLimit);
    const members = await mapPageRowsToMembers(pageRows);
    const nextOffset = offset + pageRows.length < total ? offset + pageRows.length : null;
    return { ok: true, members, total, nextOffset };
  }

  const { data: myParticipant } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!myParticipant) return { ok: false, error: "room_not_found" };

  const { data: participantData, error: partErr } = await (sb as any)
    .from("community_messenger_participants")
    .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at")
    .eq("room_id", roomId);
  if (partErr && !isMissingTableError(partErr)) {
    return { ok: false, error: "bad_request" };
  }
  const raw = (participantData ?? []) as ParticipantRow[];
  const sorted = sortParticipantsForRoomMemberList(raw);
  const total = sorted.length;
  const pageRows = sorted.slice(offset, offset + pageLimit);
  const members = await mapPageRowsToMembers(pageRows);
  const nextOffset = offset + pageRows.length < total ? offset + pageRows.length : null;
  return { ok: true, members, total, nextOffset };
}

const COMMUNITY_MESSENGER_MESSAGE_PAGE_DEFAULT = 50;
const COMMUNITY_MESSENGER_MESSAGE_PAGE_MAX = 100;

/** 스냅샷 초기 윈도우보다 오래된 메시지를 커서(`beforeMessageId`) 기준으로 페이지 로드 */
export async function listCommunityMessengerRoomMessagesBefore(input: {
  userId: string;
  roomId: string;
  beforeMessageId: string;
  limit?: number;
}): Promise<
  { ok: true; messages: CommunityMessengerMessage[]; hasMore: boolean } | { ok: false; error: string }
> {
  const roomId = trimText(input.roomId);
  const beforeMessageId = trimText(input.beforeMessageId);
  const pageLimit = Math.min(
    COMMUNITY_MESSENGER_MESSAGE_PAGE_MAX,
    Math.max(1, Math.floor(Number(input.limit) || COMMUNITY_MESSENGER_MESSAGE_PAGE_DEFAULT))
  );
  if (!roomId || !beforeMessageId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();

  const mapDbRows = (
    rows: MessageRow[],
    profileById: Map<string, CommunityMessengerProfileLite>
  ): CommunityMessengerMessage[] => {
    return rows.map((message) => {
      const senderId = trimText(message.sender_id) || null;
      const metadata = (message.metadata ?? {}) as Record<string, unknown>;
      const isMine = senderId === input.userId;
      const mt = trimText(message.message_type) as CommunityMessengerMessage["messageType"];
      const safeMt: CommunityMessengerMessage["messageType"] =
        mt === "image" ||
        mt === "file" ||
        mt === "system" ||
        mt === "call_stub" ||
        mt === "voice" ||
        mt === "sticker"
          ? mt
          : "text";
      return {
        id: message.id,
        roomId: message.room_id,
        senderId,
        senderLabel: isMine ? "나" : senderId ? profileLabel(profileById.get(senderId), senderId) : "시스템",
        messageType: safeMt,
        content: trimText(message.content),
        createdAt: trimText(message.created_at) || nowIso(),
        clientMessageId:
          typeof metadata.client_message_id === "string" && metadata.client_message_id.trim()
            ? metadata.client_message_id.trim()
            : null,
        isMine,
        callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
        callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
        callSessionId: trimText(metadata.sessionId as string) || null,
        ...(safeMt === "voice"
          ? {
              voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
              voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
              voiceMimeType: trimText(metadata.mimeType as string) || null,
            }
          : {}),
        ...(safeMt === "file"
          ? {
              fileName: trimText(metadata.fileName as string) || null,
              fileMimeType: trimText(metadata.mimeType as string) || null,
              fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
            }
          : {}),
        ...messengerImageClientFieldsFromMetadata(safeMt, metadata, trimText(message.content)),
      };
    });
  };

  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const anchor = dev.messages.find((m) => m.id === beforeMessageId && m.roomId === roomId);
    if (!anchor) return { ok: false, error: "not_found" };
    const pool = dev.messages
      .filter((m) => m.roomId === roomId && m.createdAt.localeCompare(anchor.createdAt) < 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = pool.slice(0, pageLimit + 1);
    const hasMore = page.length > pageLimit;
    const sliced = page.slice(0, pageLimit).reverse();
    const senderIds = dedupeIds(sliced.map((m) => m.senderId).filter((id): id is string => Boolean(id)));
    const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const messages: CommunityMessengerMessage[] = sliced.map((message) => {
      const senderId = message.senderId;
      const isMine = senderId === input.userId;
      const metadata = message.metadata ?? {};
      const safeMt = message.messageType;
      return {
        id: message.id,
        roomId: message.roomId,
        senderId,
        senderLabel: isMine ? "나" : senderId ? profileLabel(profileById.get(senderId), senderId) : "시스템",
        messageType: safeMt,
        content: trimText(message.content),
        createdAt: message.createdAt,
        isMine,
        callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
        callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
        callSessionId: trimText(metadata.sessionId as string) || null,
        ...(safeMt === "voice"
          ? {
              voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
              voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
              voiceMimeType: trimText(metadata.mimeType as string) || null,
            }
          : {}),
        ...(safeMt === "file"
          ? {
              fileName: trimText(metadata.fileName as string) || null,
              fileMimeType: trimText(metadata.mimeType as string) || null,
              fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
            }
          : {}),
        ...messengerImageClientFieldsFromMetadata(safeMt, metadata as Record<string, unknown>, trimText(message.content)),
      };
    });
    return { ok: true, messages, hasMore };
  }

  const { data: myParticipant } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!myParticipant) return { ok: false, error: "room_not_found" };

  const { data: anchorRow, error: anchorErr } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, created_at")
    .eq("id", beforeMessageId)
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .maybeSingle();
  if (anchorErr || !anchorRow) return { ok: false, error: "not_found" };

  const anchorCreatedAt = trimText((anchorRow as { created_at?: string | null }).created_at);
  if (!anchorCreatedAt) return { ok: false, error: "not_found" };

  const { data: rows, error: msgErr } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, room_id, sender_id, message_type, content, metadata, created_at")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .lt("created_at", anchorCreatedAt)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageLimit + 1);
  if (msgErr && !isMissingTableError(msgErr)) {
    return { ok: false, error: "load_failed" };
  }

  const raw = (rows ?? []) as MessageRow[];
  const hasMore = raw.length > pageLimit;
  const pageRows = raw.slice(0, pageLimit).reverse();
  const senderIds = dedupeIds(pageRows.map((r) => trimText(r.sender_id)).filter(Boolean));
  const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  return { ok: true, messages: mapDbRows(pageRows, profileById), hasMore };
}

/** `afterMessageId` 보다 새 메시지만 (증분 동기·탭 복귀 갭 메우기). 전체 목록 전송 회피 */
export async function listCommunityMessengerRoomMessagesAfter(input: {
  userId: string;
  roomId: string;
  afterMessageId: string;
  limit?: number;
}): Promise<
  { ok: true; messages: CommunityMessengerMessage[]; hasMore: boolean } | { ok: false; error: string }
> {
  const roomId = trimText(input.roomId);
  const afterMessageId = trimText(input.afterMessageId);
  const pageLimit = Math.min(
    COMMUNITY_MESSENGER_MESSAGE_PAGE_MAX,
    Math.max(1, Math.floor(Number(input.limit) || COMMUNITY_MESSENGER_MESSAGE_PAGE_DEFAULT))
  );
  if (!roomId || !afterMessageId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();

  const mapDbRows = (
    rows: MessageRow[],
    profileById: Map<string, CommunityMessengerProfileLite>
  ): CommunityMessengerMessage[] => {
    return rows.map((message) => {
      const senderId = trimText(message.sender_id) || null;
      const metadata = (message.metadata ?? {}) as Record<string, unknown>;
      const isMine = senderId === input.userId;
      const mt = trimText(message.message_type) as CommunityMessengerMessage["messageType"];
      const safeMt: CommunityMessengerMessage["messageType"] =
        mt === "image" ||
        mt === "file" ||
        mt === "system" ||
        mt === "call_stub" ||
        mt === "voice" ||
        mt === "sticker"
          ? mt
          : "text";
      return {
        id: message.id,
        roomId: message.room_id,
        senderId,
        senderLabel: isMine ? "나" : senderId ? profileLabel(profileById.get(senderId), senderId) : "시스템",
        messageType: safeMt,
        content: trimText(message.content),
        createdAt: trimText(message.created_at) || nowIso(),
        isMine,
        callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
        callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
        callSessionId: trimText(metadata.sessionId as string) || null,
        ...(safeMt === "voice"
          ? {
              voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
              voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
              voiceMimeType: trimText(metadata.mimeType as string) || null,
            }
          : {}),
        ...(safeMt === "file"
          ? {
              fileName: trimText(metadata.fileName as string) || null,
              fileMimeType: trimText(metadata.mimeType as string) || null,
              fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
            }
          : {}),
        ...messengerImageClientFieldsFromMetadata(safeMt, metadata, trimText(message.content)),
      };
    });
  };

  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const anchor = dev.messages.find((m) => m.id === afterMessageId && m.roomId === roomId);
    if (!anchor) return { ok: false, error: "not_found" };
    const pool = dev.messages
      .filter((m) => {
        if (m.roomId !== roomId) return false;
        if (m.createdAt > anchor.createdAt) return true;
        if (m.createdAt === anchor.createdAt) return m.id.localeCompare(anchor.id) > 0;
        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const page = pool.slice(0, pageLimit + 1);
    const hasMore = page.length > pageLimit;
    const sliced = page.slice(0, pageLimit);
    const senderIds = dedupeIds(sliced.map((m) => m.senderId).filter((id): id is string => Boolean(id)));
    const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const messages: CommunityMessengerMessage[] = sliced.map((message) => {
      const senderId = message.senderId;
      const isMine = senderId === input.userId;
      const metadata = message.metadata ?? {};
      const safeMt = message.messageType;
      return {
        id: message.id,
        roomId: message.roomId,
        senderId,
        senderLabel: isMine ? "나" : senderId ? profileLabel(profileById.get(senderId), senderId) : "시스템",
        messageType: safeMt,
        content: trimText(message.content),
        createdAt: message.createdAt,
        isMine,
        callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
        callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
        callSessionId: trimText(metadata.sessionId as string) || null,
        ...(safeMt === "voice"
          ? {
              voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
              voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
              voiceMimeType: trimText(metadata.mimeType as string) || null,
            }
          : {}),
        ...(safeMt === "file"
          ? {
              fileName: trimText(metadata.fileName as string) || null,
              fileMimeType: trimText(metadata.mimeType as string) || null,
              fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
            }
          : {}),
        ...messengerImageClientFieldsFromMetadata(safeMt, metadata as Record<string, unknown>, trimText(message.content)),
      };
    });
    return { ok: true, messages, hasMore };
  }

  const { data: rpcRows, error: rpcErr } = await (sb as any).rpc("community_messenger_room_messages_after", {
    p_user_id: input.userId,
    p_room_id: roomId,
    p_after_message_id: afterMessageId,
    p_limit: pageLimit + 1,
  });
  if (rpcErr) {
    if (isMissingTableError(rpcErr) || String(rpcErr.message ?? "").includes("function") || String(rpcErr.code ?? "") === "42883") {
      return { ok: false, error: "migration_required" };
    }
    return { ok: false, error: "load_failed" };
  }
  const raw = ((rpcRows ?? []) as MessageRow[]).slice();
  const hasMore = raw.length > pageLimit;
  const pageRows = raw.slice(0, pageLimit);
  const senderIds = dedupeIds(pageRows.map((r) => trimText(r.sender_id)).filter(Boolean));
  const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  return { ok: true, messages: mapDbRows(pageRows, profileById), hasMore };
}

/** Broadcast bump 의 `messageId` 힌트로 1건 증분 로드 — 전체 `after` 페이지보다 가볍다. */
export async function getCommunityMessengerRoomMessageById(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: true; message: CommunityMessengerMessage } | { ok: false; error: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  if (!roomId || !messageId) return { ok: false, error: "bad_request" };
  const sb = getSupabaseOrNull();
  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const row = dev.messages.find((m) => m.id === messageId && m.roomId === roomId);
    if (!row) return { ok: false, error: "not_found" };
    const senderIds = dedupeIds([row.senderId].filter((id): id is string => Boolean(id && String(id).trim())));
    const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const senderId = trimText(row.senderId) || null;
    const metadata = row.metadata ?? {};
    const isMine = senderId === input.userId;
    const mt = trimText(row.messageType) as CommunityMessengerMessage["messageType"];
    const safeMt: CommunityMessengerMessage["messageType"] =
      mt === "image" || mt === "file" || mt === "system" || mt === "call_stub" || mt === "voice" || mt === "sticker"
        ? mt
        : "text";
    const clientRaw = metadata.client_message_id;
    const clientMessageId =
      typeof clientRaw === "string" && clientRaw.trim()
        ? clientRaw.trim()
        : typeof metadata.clientMessageId === "string" && metadata.clientMessageId.trim()
          ? metadata.clientMessageId.trim()
          : null;
    const message: CommunityMessengerMessage = {
      id: row.id,
      roomId: row.roomId,
      senderId,
      senderLabel: isMine ? "나" : senderId ? profileLabel(profileById.get(senderId), senderId) : "시스템",
      messageType: safeMt,
      content: trimText(row.content),
      createdAt: row.createdAt,
      clientMessageId,
      isMine,
      callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
      callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
      callSessionId: trimText(metadata.sessionId as string) || null,
      ...(safeMt === "voice"
        ? {
            voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
            voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
            voiceMimeType: trimText(metadata.mimeType as string) || null,
          }
        : {}),
      ...(safeMt === "file"
        ? {
            fileName: trimText(metadata.fileName as string) || null,
            fileMimeType: trimText(metadata.mimeType as string) || null,
            fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
          }
        : {}),
      ...messengerImageClientFieldsFromMetadata(safeMt, metadata as Record<string, unknown>, trimText(row.content)),
    };
    return { ok: true, message };
  }

  const { data: myParticipant } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!myParticipant) return { ok: false, error: "room_not_found" };

  const { data: row, error } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, room_id, sender_id, message_type, content, metadata, created_at")
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (error && !isMissingTableError(error)) {
    return { ok: false, error: "load_failed" };
  }
  if (!row) return { ok: false, error: "not_found" };

  const r = row as MessageRow;
  const senderIds = dedupeIds([trimText(r.sender_id)].filter(Boolean));
  const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const senderId = trimText(r.sender_id) || null;
  const metadata = (r.metadata ?? {}) as Record<string, unknown>;
  const isMine = senderId === input.userId;
  const mt = trimText(r.message_type) as CommunityMessengerMessage["messageType"];
  const safeMt: CommunityMessengerMessage["messageType"] =
    mt === "image" || mt === "file" || mt === "system" || mt === "call_stub" || mt === "voice" || mt === "sticker"
      ? mt
      : "text";
  const clientRaw = metadata.client_message_id;
  const clientMessageId =
    typeof clientRaw === "string" && clientRaw.trim()
      ? clientRaw.trim()
      : typeof metadata.clientMessageId === "string" && metadata.clientMessageId.trim()
        ? String(metadata.clientMessageId).trim()
        : null;
  const message: CommunityMessengerMessage = {
    id: String(r.id ?? ""),
    roomId: String(r.room_id ?? roomId),
    senderId,
    senderLabel: isMine ? "나" : senderId ? profileLabel(profileById.get(senderId), senderId) : "시스템",
    messageType: safeMt,
    content: trimText(r.content),
    createdAt: trimText(r.created_at) || nowIso(),
    clientMessageId,
    isMine,
    callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
    callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
    callSessionId: trimText(metadata.sessionId as string) || null,
    ...(safeMt === "voice"
      ? {
          voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
          voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
          voiceMimeType: trimText(metadata.mimeType as string) || null,
        }
      : {}),
    ...(safeMt === "file"
      ? {
          fileName: trimText(metadata.fileName as string) || null,
          fileMimeType: trimText(metadata.mimeType as string) || null,
          fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
        }
      : {}),
    ...messengerImageClientFieldsFromMetadata(safeMt, metadata, trimText(r.content)),
  };
  return { ok: true, message };
}

function parseRpcRecipientUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function communityMessengerTextMessageFromRpcRow(
  roomId: string,
  userId: string,
  msg: Record<string, unknown>
): CommunityMessengerMessage {
  const metadata = (msg.metadata ?? {}) as Record<string, unknown>;
  const clientRaw = metadata.client_message_id;
  const cmid = typeof clientRaw === "string" && clientRaw.trim() ? clientRaw.trim() : null;
  return {
    id: String(msg.id ?? ""),
    roomId: String(msg.room_id ?? roomId),
    senderId: typeof msg.sender_id === "string" ? msg.sender_id : userId,
    senderLabel: "나",
    messageType: "text",
    content: trimText(String(msg.content ?? "")),
    createdAt: trimText(String(msg.created_at ?? "")) || nowIso(),
    clientMessageId: cmid,
    isMine: true,
    callKind: null,
    callStatus: null,
  };
}

function isCommunityMessengerSendTextRpcMissing(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: string }).message ?? "")
      : String(err ?? "");
  return /community_messenger_send_text_message|does not exist|schema cache|Could not find|function|42883|PGRST202/i.test(
    msg
  );
}

async function trySendCommunityMessengerTextAtomic(
  sb: any,
  input: { userId: string },
  roomId: string,
  content: string,
  clientMessageId: string
): Promise<{ ok: true; message: CommunityMessengerMessage } | { ok: false; error: string } | null> {
  const createdAt = nowIso();
  const { data: rpcRaw, error: rpcErr } = await sb.rpc("community_messenger_send_text_message", {
    p_room_id: roomId,
    p_sender_id: input.userId,
    p_content: content,
    p_client_message_id: clientMessageId.length > 0 ? clientMessageId : null,
    p_created_at: createdAt,
  });
  if (rpcErr) {
    if (isCommunityMessengerSendTextRpcMissing(rpcErr)) return null;
    return { ok: false, error: String(rpcErr.message ?? "message_send_failed") };
  }
  if (rpcRaw == null || typeof rpcRaw !== "object") {
    return { ok: false, error: "message_send_failed" };
  }
  const payload = rpcRaw as Record<string, unknown>;
  if (payload.ok !== true) {
    return { ok: false, error: typeof payload.error === "string" ? payload.error : "message_send_failed" };
  }
  const msgRow = payload.message;
  if (!msgRow || typeof msgRow !== "object") {
    return { ok: false, error: "message_send_failed" };
  }
  const message = communityMessengerTextMessageFromRpcRow(roomId, input.userId, msgRow as Record<string, unknown>);
  const deduped = payload.deduped === true;
  if (!deduped) {
    const recipientUserIds = parseRpcRecipientUserIds(payload.recipient_user_ids);
    const dk = payload.room_direct_key;
    const directKeyStr = typeof dk === "string" ? dk : dk == null ? null : String(dk);
    const itemTradeLedgerId = itemTradeChatRoomIdFromMessengerDirectKey(directKeyStr);
    if (itemTradeLedgerId) {
      void mirrorCommunityMessengerTextToItemTradeLedger(sb, {
        itemTradeChatRoomId: itemTradeLedgerId,
        senderUserId: input.userId,
        textContent: content,
        createdAt: message.createdAt,
      }).catch(() => {});
    }
    const preview = content.length > 120 ? `${content.slice(0, 117)}…` : content || "메시지";
    void notifyCommunityChatInAppForRecipients(sb as SupabaseLike, {
      roomId,
      senderUserId: input.userId,
      preview,
      recipientUserIds,
      hasMention: /@\S/.test(content),
    }).catch(() => {});
    invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, recipientUserIds);
  }
  return { ok: true, message };
}

export async function sendCommunityMessengerMessage(input: {
  userId: string;
  roomId: string;
  content: string;
  clientMessageId?: string;
  /**
   * `POST .../messages` 가 `messengerRoomCanonicalOrJsonError` 로 참가·방 식별을 마친 뒤 호출할 때 true.
   * 동일 RTT 내 `community_messenger_participants` 존재 조회를 한 번 줄인다.
   */
  membershipPreflightDone?: boolean;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const clientMessageId = trimText(input.clientMessageId ?? "");
  const membershipPreflightDone = input.membershipPreflightDone === true;
  const sb = getSupabaseOrNull();
  if (sb) {
    const atomic = await trySendCommunityMessengerTextAtomic(sb, { userId: input.userId }, roomId, content, clientMessageId);
    if (atomic !== null) {
      if (atomic.ok) return { ok: true, message: atomic.message };
      return { ok: false, error: atomic.error };
    }
    const roomQ = (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_status, is_readonly, direct_key")
      .eq("id", roomId)
      .maybeSingle();
    const dedupeQ =
      clientMessageId !== ""
        ? (sb as any)
            .from("community_messenger_messages")
            .select("id, room_id, sender_id, message_type, content, metadata, created_at")
            .eq("room_id", roomId)
            .eq("sender_id", input.userId)
            .filter("metadata->>client_message_id", "eq", clientMessageId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });
    const participantQ = membershipPreflightDone
      ? Promise.resolve({ data: { id: "_" }, error: null })
      : (sb as any)
          .from("community_messenger_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("user_id", input.userId)
          .maybeSingle();
    const [participantRes, roomRes, dedupeRes] = await Promise.all([participantQ, roomQ, dedupeQ]);
    const participant = participantRes.data;
    const roomData = roomRes.data;
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    if (clientMessageId) {
      const existingRow = dedupeRes.data;
      const existingError = dedupeRes.error;
      if (!existingError && existingRow) {
        return {
          ok: true,
          message: {
            id: String((existingRow as { id?: unknown }).id ?? ""),
            roomId,
            senderId: input.userId,
            senderLabel: "나",
            messageType: "text",
            content: String((existingRow as { content?: unknown }).content ?? content),
            createdAt: String((existingRow as { created_at?: unknown }).created_at ?? nowIso()),
            clientMessageId,
            isMine: true,
            callKind: null,
            callStatus: null,
          },
        };
      }
    }
    const createdAt = nowIso();
    const recipientPrefetch = (sb as any)
      .from("community_messenger_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("user_id", input.userId);
    const insertPromise = (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "text",
        content,
        metadata: clientMessageId ? { client_message_id: clientMessageId } : {},
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    const [{ data: insertedMessage, error: insertError }, { data: recipientRowsPrefetch }] = await Promise.all([
      insertPromise,
      recipientPrefetch,
    ]);
    if (!insertError && insertedMessage) {
      const insertedMessageId = String((insertedMessage as { id?: unknown }).id ?? "");
      const roomUpdate = (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: content,
          last_message_at: createdAt,
          last_message_type: "text",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const unreadRpc = (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      const senderReadUpdate =
        insertedMessageId !== ""
          ? (sb as any)
              .from("community_messenger_participants")
              .update({
                last_read_at: createdAt,
                last_read_message_id: insertedMessageId,
              })
              .eq("room_id", roomId)
              .eq("user_id", input.userId)
          : Promise.resolve({ data: null, error: null });
      const itemTradeLedgerId = itemTradeChatRoomIdFromMessengerDirectKey(
        (roomData as { direct_key?: unknown }).direct_key
      );
      const postInsertBatch = await Promise.all([roomUpdate, unreadRpc, senderReadUpdate]);
      const unreadRpcError = (postInsertBatch[1] as { error?: { message?: string } | null })?.error;
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      if (itemTradeLedgerId) {
        void mirrorCommunityMessengerTextToItemTradeLedger(sb as any, {
          itemTradeChatRoomId: itemTradeLedgerId,
          senderUserId: input.userId,
          textContent: content,
          createdAt,
        }).catch(() => {
          /* 원장은 베스트에포트 — 전송 RTT 에 chat_* 연쇄 쿼리를 끌어들이지 않음 */
        });
      }
      const recipientUserIds = ((recipientRowsPrefetch ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      const preview =
        content.length > 120 ? `${content.slice(0, 117)}…` : content || "메시지";
      const hasMention = /@\S/.test(content);
      void notifyCommunityChatInAppForRecipients(sb as SupabaseLike, {
        roomId,
        senderUserId: input.userId,
        preview,
        recipientUserIds,
        hasMention,
      }).catch(() => {});
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, recipientUserIds);
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
          clientMessageId: clientMessageId || null,
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
    metadata: clientMessageId ? { client_message_id: clientMessageId } : {},
    createdAt,
  });
  if (room) {
    room.lastMessage = content;
    room.lastMessageAt = createdAt;
    room.lastMessageType = "text";
  }
  for (const participant of dev.participants.filter((row) => row.roomId === roomId)) {
    if (participant.userId === input.userId) {
      participant.unreadCount = 0;
      participant.lastReadAt = createdAt;
      participant.lastReadMessageId = messageId;
    } else {
      participant.unreadCount += 1;
    }
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
      clientMessageId: clientMessageId || null,
      isMine: true,
      callKind: null,
      callStatus: null,
    },
  };
}

async function appendCommunityMessengerSystemMessage(input: {
  userId: string;
  roomId: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const createdAt = nowIso();
    const { error: insertError } = await (sb as any).from("community_messenger_messages").insert({
      room_id: roomId,
      sender_id: null,
      message_type: "system",
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
          last_message_type: "system",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      return { ok: true };
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
  const createdAt = nowIso();
  dev.messages.push({
    id: randomUUID(),
    roomId,
    senderId: null,
    messageType: "system",
    content,
    metadata: {},
    createdAt,
  });
  room.lastMessage = content;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "system";
  for (const participant of dev.participants.filter((row) => row.roomId === roomId)) {
    participant.unreadCount = participant.userId === input.userId ? 0 : participant.unreadCount + 1;
  }
  return { ok: true };
}

const COMMUNITY_MESSENGER_IMAGE_ALBUM_MAX = 10;

const VOICE_LAST_PREVIEW = "음성 메시지";
const IMAGE_LAST_PREVIEW = "사진";
const FILE_LAST_PREVIEW = "파일";
const STICKER_LAST_PREVIEW = "스티커";

function communityMessengerImageMessageMetadata(items: CommunityMessengerImageSendItem[]): Record<string, unknown> {
  if (items.length === 1) {
    const f = items[0]!;
    return {
      storagePath: f.originalStoragePath,
      mimeType: f.originalMimeType,
      image_thumb_url: f.chatPublicUrl,
      image_preview_url: f.previewPublicUrl,
      image_original_url: f.originalPublicUrl,
    };
  }
  return {
    image_thumb_urls: items.map((i) => i.chatPublicUrl),
    image_preview_urls: items.map((i) => i.previewPublicUrl),
    image_urls: items.map((i) => i.originalPublicUrl),
    storage_paths: items.map((i) => i.originalStoragePath),
    mime_types: items.map((i) => i.originalMimeType),
    storagePath: items[0]!.originalStoragePath,
    mimeType: items[0]!.originalMimeType,
  };
}

function communityMessengerBuiltImageClientMessage(
  items: CommunityMessengerImageSendItem[],
  createdAt: string,
  id: string,
  roomId: string,
  userId: string
): CommunityMessengerMessage {
  const first = items[0]!;
  const base: CommunityMessengerMessage = {
    id,
    roomId,
    senderId: userId,
    senderLabel: "나",
    messageType: "image",
    content: first.chatPublicUrl,
    createdAt,
    isMine: true,
    callKind: null,
    callStatus: null,
  };
  if (items.length > 1) {
    return {
      ...base,
      imageAlbumUrls: items.map((i) => i.chatPublicUrl),
      imageAlbumPreviewUrls: items.map((i) => i.previewPublicUrl),
      imageAlbumOriginalUrls: items.map((i) => i.originalPublicUrl),
    };
  }
  return {
    ...base,
    imagePreviewUrl: first.previewPublicUrl,
    imageOriginalUrl: first.originalPublicUrl,
  };
}

export async function sendCommunityMessengerImageMessage(input: {
  userId: string;
  roomId: string;
  items: CommunityMessengerImageSendItem[];
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const items = (input.items ?? [])
    .map((it) => ({
      chatPublicUrl: trimText(it.chatPublicUrl),
      previewPublicUrl: trimText(it.previewPublicUrl),
      originalPublicUrl: trimText(it.originalPublicUrl),
      originalStoragePath: trimText(it.originalStoragePath),
      originalMimeType: trimText(it.originalMimeType) || "image/jpeg",
    }))
    .filter(
      (it) =>
        it.chatPublicUrl &&
        it.previewPublicUrl &&
        it.originalPublicUrl &&
        it.originalStoragePath
    );
  if (!roomId || items.length === 0) return { ok: false, error: "content_required" };
  if (items.length > COMMUNITY_MESSENGER_IMAGE_ALBUM_MAX) return { ok: false, error: "too_many_images" };

  const first = items[0]!;
  const metadata = communityMessengerImageMessageMetadata(items);
  const lastPreview = items.length > 1 ? `사진 ${items.length}장` : IMAGE_LAST_PREVIEW;
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
        message_type: "image",
        content: first.chatPublicUrl,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      const [, unreadRpcResult] = await Promise.all([
        (sb as any)
          .from("community_messenger_rooms")
          .update({
            last_message: lastPreview,
            last_message_at: createdAt,
            last_message_type: "image",
            updated_at: createdAt,
          })
          .eq("id", roomId),
        (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
          p_room_id: roomId,
          p_sender_id: input.userId,
          p_read_at: createdAt,
        }),
      ]);
      const unreadRpcError = unreadRpcResult?.error;
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: imageRecipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId);
      const imageRecipientUserIds = ((imageRecipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityChatInAppForRecipients(sb as SupabaseLike, {
        roomId,
        senderUserId: input.userId,
        preview: lastPreview,
        recipientUserIds: imageRecipientUserIds,
      }).catch(() => {});
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, imageRecipientUserIds);
      const mid = String((insertedMessage as { id?: unknown }).id ?? "");
      return {
        ok: true,
        message: communityMessengerBuiltImageClientMessage(items, createdAt, mid, roomId, input.userId),
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
    messageType: "image",
    content: first.chatPublicUrl,
    metadata,
    createdAt,
  });
  room.lastMessage = lastPreview;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "image";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: communityMessengerBuiltImageClientMessage(items, createdAt, messageId, roomId, input.userId),
  };
}

export async function sendCommunityMessengerStickerMessage(input: {
  userId: string;
  roomId: string;
  content: string;
  clientMessageId?: string;
  stickerItemId?: string;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const path = normalizeCommunityMessengerStickerContent(input.content);
  if (!roomId || !path) return { ok: false, error: "content_required" };
  const clientMessageId = trimText(input.clientMessageId ?? "");
  const stickerItemId = trimText(input.stickerItemId ?? "");
  const metadata: Record<string, unknown> = {};
  if (clientMessageId) metadata.client_message_id = clientMessageId;
  if (stickerItemId) metadata.sticker_item_id = stickerItemId;

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

    if (clientMessageId) {
      const { data: existingRow, error: existingError } = await (sb as any)
        .from("community_messenger_messages")
        .select("id, room_id, sender_id, message_type, content, metadata, created_at")
        .eq("room_id", roomId)
        .eq("sender_id", input.userId)
        .filter("metadata->>client_message_id", "eq", clientMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!existingError && existingRow) {
        return {
          ok: true,
          message: {
            id: String((existingRow as { id?: unknown }).id ?? ""),
            roomId,
            senderId: input.userId,
            senderLabel: "나",
            messageType: "sticker",
            content: String((existingRow as { content?: unknown }).content ?? path),
            createdAt: String((existingRow as { created_at?: unknown }).created_at ?? nowIso()),
            clientMessageId,
            isMine: true,
            callKind: null,
            callStatus: null,
          },
        };
      }
    }

    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "sticker",
        content: path,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: STICKER_LAST_PREVIEW,
          last_message_at: createdAt,
          last_message_type: "sticker",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: recipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId);
      const recipientUserIds = ((recipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityChatInAppForRecipients(sb as SupabaseLike, {
        roomId,
        senderUserId: input.userId,
        preview: STICKER_LAST_PREVIEW,
        recipientUserIds,
      }).catch(() => {});
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, recipientUserIds);
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: "나",
          messageType: "sticker",
          content: path,
          createdAt,
          clientMessageId: clientMessageId || null,
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
    messageType: "sticker",
    content: path,
    metadata,
    createdAt,
  });
  room.lastMessage = STICKER_LAST_PREVIEW;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "sticker";
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
      messageType: "sticker",
      content: path,
      createdAt,
      clientMessageId: clientMessageId || null,
      isMine: true,
      callKind: null,
      callStatus: null,
    },
  };
}

export async function sendCommunityMessengerFileMessage(input: {
  userId: string;
  roomId: string;
  filePublicUrl: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const filePublicUrl = trimText(input.filePublicUrl);
  const storagePath = trimText(input.storagePath);
  const fileName = trimText(input.fileName);
  if (!roomId || !filePublicUrl || !storagePath || !fileName) return { ok: false, error: "content_required" };
  const mimeType = trimText(input.mimeType) || "application/octet-stream";
  const fileSizeBytes = Math.max(0, Math.floor(Number(input.fileSizeBytes ?? 0)) || 0);
  const metadata: Record<string, unknown> = { storagePath, mimeType, fileName, fileSizeBytes };
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
        message_type: "file",
        content: filePublicUrl,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: FILE_LAST_PREVIEW,
          last_message_at: createdAt,
          last_message_type: "file",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: fileRecipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId);
      const fileRecipientUserIds = ((fileRecipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityChatInAppForRecipients(sb as SupabaseLike, {
        roomId,
        senderUserId: input.userId,
        preview: FILE_LAST_PREVIEW,
        recipientUserIds: fileRecipientUserIds,
      }).catch(() => {});
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, fileRecipientUserIds);
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: "나",
          messageType: "file",
          content: filePublicUrl,
          createdAt,
          isMine: true,
          callKind: null,
          callStatus: null,
          fileName,
          fileMimeType: mimeType,
          fileSizeBytes,
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
    messageType: "file",
    content: filePublicUrl,
    metadata,
    createdAt,
  });
  room.lastMessage = FILE_LAST_PREVIEW;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "file";
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
      messageType: "file",
      content: filePublicUrl,
      createdAt,
      isMine: true,
      callKind: null,
      callStatus: null,
      fileName,
      fileMimeType: mimeType,
      fileSizeBytes,
    },
  };
}

function messengerLastPreviewFromRow(row: {
  message_type?: string;
  content?: string;
  metadata?: unknown;
}): { preview: string; messageType: string } {
  const mt = trimText(row.message_type);
  if (mt === "voice") return { preview: VOICE_LAST_PREVIEW, messageType: "voice" };
  if (mt === "call_stub") return { preview: trimText(row.content) || "통화", messageType: "call_stub" };
  if (mt === "image") return { preview: trimText(row.content) || "사진", messageType: "image" };
  if (mt === "sticker") return { preview: STICKER_LAST_PREVIEW, messageType: "sticker" };
  if (mt === "file") return { preview: trimText((row.metadata as { fileName?: string } | undefined)?.fileName) || FILE_LAST_PREVIEW, messageType: "file" };
  if (mt === "system") return { preview: trimText(row.content) || "알림", messageType: "system" };
  const c = trimText(row.content);
  const preview = c.length > 120 ? `${c.slice(0, 117)}…` : c || "메시지";
  return { preview, messageType: mt || "text" };
}

async function recomputeCommunityMessengerRoomLastMessage(sb: SupabaseLike, roomId: string) {
  const { data: rows } = await (sb as any)
    .from("community_messenger_messages")
    .select("content, created_at, message_type, metadata")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = (rows ?? [])[0] as
    | { content?: string; created_at?: string; message_type?: string; metadata?: unknown }
    | undefined;
  const now = nowIso();
  if (!latest) {
    await (sb as any)
      .from("community_messenger_rooms")
      .update({
        last_message: "",
        last_message_at: now,
        last_message_type: "text",
        updated_at: now,
      })
      .eq("id", roomId);
    return;
  }
  const { preview, messageType } = messengerLastPreviewFromRow(latest);
  const at = trimText(latest.created_at) || now;
  await (sb as any)
    .from("community_messenger_rooms")
    .update({
      last_message: preview,
      last_message_at: at,
      last_message_type: messageType,
      updated_at: now,
    })
    .eq("id", roomId);
}

/** 보낸 사람만 — 음성 메시지 삭제(스토리지 파일 포함) 후 방 미리보기 갱신 */
export async function deleteCommunityMessengerVoiceMessage(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  if (!roomId || !messageId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: part } = await (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!part) return { ok: false, error: "forbidden" };

    const { data: msg, error: msgErr } = await (sb as any)
      .from("community_messenger_messages")
      .select("id, room_id, sender_id, message_type, content, metadata")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr || !msg) return { ok: false, error: "not_found" };
    if (trimText((msg as { room_id?: string }).room_id) !== roomId) return { ok: false, error: "not_found" };
    if (trimText((msg as { sender_id?: string }).sender_id) !== input.userId) return { ok: false, error: "forbidden" };
    if (trimText((msg as { message_type?: string }).message_type) !== "voice") {
      return { ok: false, error: "unsupported_type" };
    }

    const metadata = (
      (msg as { metadata?: unknown }).metadata && typeof (msg as { metadata?: unknown }).metadata === "object"
        ? ((msg as { metadata?: unknown }).metadata as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    const content = trimText((msg as { content?: string }).content);
    let storagePath = trimText(metadata.storagePath as string);
    if (!storagePath) storagePath = legacyPostImagesPathFromPublicUrl(content) ?? "";
    if (storagePath) {
      await (sb as any).storage.from("post-images").remove([storagePath]);
    }

    const { error: delErr } = await (sb as any).from("community_messenger_messages").delete().eq("id", messageId);
    if (delErr) return { ok: false, error: "delete_failed" };

    await recomputeCommunityMessengerRoomLastMessage(sb, roomId);
    return { ok: true };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const idx = dev.messages.findIndex((row) => row.id === messageId && row.roomId === roomId);
  if (idx === -1) return { ok: false, error: "not_found" };
  const row = dev.messages[idx]!;
  if (row.senderId !== input.userId) return { ok: false, error: "forbidden" };
  if (row.messageType !== "voice") return { ok: false, error: "unsupported_type" };
  dev.messages.splice(idx, 1);
  const latest = [...dev.messages].filter((m) => m.roomId === roomId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
  if (latest) {
    const { preview, messageType } = messengerLastPreviewFromRow({
      message_type: latest.messageType,
      content: latest.content,
      metadata: latest.metadata,
    });
    room.lastMessage = preview;
    room.lastMessageAt = latest.createdAt;
    room.lastMessageType = messageType as (typeof room)["lastMessageType"];
  } else {
    room.lastMessage = "";
    room.lastMessageAt = nowIso();
    room.lastMessageType = "text";
  }
  return { ok: true };
}

function legacyPostImagesPathFromPublicUrl(url: string): string | null {
  const raw = trimText(url);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const key = "/storage/v1/object/public/post-images/";
    const i = u.pathname.indexOf(key);
    if (i === -1) return null;
    return decodeURIComponent(u.pathname.slice(i + key.length));
  } catch {
    return null;
  }
}

/** 방 멤버만 스트리밍 재생 — Storage 비공개·CORS 이슈 회피 */
export async function fetchCommunityMessengerVoicePlaybackBytes(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<
  | { ok: true; data: Uint8Array; contentType: string; storagePath: string }
  | { ok: false; status: number; error: string }
> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  if (!roomId || !messageId) return { ok: false, status: 400, error: "bad_request" };

  const sb = getSupabaseServer();
  const { data: msg, error: msgErr } = await sb
    .from("community_messenger_messages")
    .select("id, room_id, message_type, content, metadata")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr || !msg || trimText((msg as { room_id?: string }).room_id) !== roomId) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (trimText((msg as { message_type?: string }).message_type) !== "voice") {
    return { ok: false, status: 404, error: "not_found" };
  }
  const { data: part } = await sb
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!part) return { ok: false, status: 403, error: "forbidden" };

  const metadata = (
    (msg as { metadata?: unknown }).metadata && typeof (msg as { metadata?: unknown }).metadata === "object"
      ? ((msg as { metadata?: unknown }).metadata as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;
  const content = trimText((msg as { content?: string }).content);
  let storagePath = trimText(metadata.storagePath as string);
  if (!storagePath) storagePath = legacyPostImagesPathFromPublicUrl(content) ?? "";
  if (!storagePath) return { ok: false, status: 404, error: "no_audio_path" };

  const { data: file, error: dlErr } = await sb.storage.from("post-images").download(storagePath);
  if (dlErr || !file) return { ok: false, status: 502, error: "download_failed" };

  const buf = new Uint8Array(await file.arrayBuffer());
  const contentType = trimText(metadata.mimeType as string) || "application/octet-stream";
  return { ok: true, data: buf, contentType, storagePath };
}

export async function sendCommunityMessengerVoiceMessage(input: {
  userId: string;
  roomId: string;
  audioPublicUrl: string;
  storagePath: string;
  durationSeconds: number;
  mimeType: string;
  waveformPeaks?: number[] | null;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const audioPublicUrl = trimText(input.audioPublicUrl);
  const storagePath = trimText(input.storagePath);
  if (!roomId || !audioPublicUrl || !storagePath) return { ok: false, error: "content_required" };
  const durationSeconds = Math.max(0, Math.min(600, Math.floor(Number(input.durationSeconds) || 0)));
  const mimeType = trimText(input.mimeType) || "audio/webm";
  const rawPeaks = Array.isArray(input.waveformPeaks)
    ? input.waveformPeaks
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.min(1, Math.max(0, n)))
    : [];
  const waveformPeaksStored =
    rawPeaks.length > 0
      ? rawPeaks.length === COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS
        ? rawPeaks
        : downsampleVoiceWaveformPeaks(rawPeaks, COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS)
      : undefined;
  const metadata: Record<string, unknown> = { durationSeconds, mimeType, storagePath };
  if (waveformPeaksStored && waveformPeaksStored.length > 0) {
    metadata.waveformPeaks = waveformPeaksStored;
  }
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
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: voiceRecipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId);
      const voiceRecipientUserIds = ((voiceRecipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityChatInAppForRecipients(sb as SupabaseLike, {
        roomId,
        senderUserId: input.userId,
        preview: VOICE_LAST_PREVIEW,
        recipientUserIds: voiceRecipientUserIds,
      }).catch(() => {});
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, voiceRecipientUserIds);
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
          voiceWaveformPeaks: waveformPeaksStored ?? null,
          voiceMimeType: mimeType,
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
      voiceWaveformPeaks: waveformPeaksStored ?? null,
      voiceMimeType: mimeType,
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
        durationSeconds: input.durationSeconds,
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
    durationSeconds: input.durationSeconds,
  });
  return { ok: true };
}

/**
 * 1:1 DM 통화 발신: `getCommunityMessengerRoomSnapshot`(메시지·프로필 전체) 없이
 * 방 메타·참가자 id·진행 중 세션만 병렬 조회해 TTFB 를 줄인다. 그룹방은 기존 스냅샷 경로 유지.
 */
type CallSessionStartResolve =
  | { kind: "fullSnapshot"; snapshot: CommunityMessengerRoomSnapshot }
  | {
      kind: "directLight";
      peerUserId: string;
      activeCall: CommunityMessengerCallSession | null;
      roomStatus: CommunityMessengerRoomStatus;
      isReadonly: boolean;
    };

async function resolveRoomContextForCallSessionStart(
  userId: string,
  roomId: string
): Promise<CallSessionStartResolve | null> {
  const id = trimText(roomId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  if (!sb) {
    const snapshot = await getCommunityMessengerRoomSnapshot(userId, roomId);
    return snapshot ? { kind: "fullSnapshot", snapshot } : null;
  }

  const [{ data: roomData, error: roomErr }, activeCall] = await Promise.all([
    (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, room_status, is_readonly")
      .eq("id", id)
      .maybeSingle(),
    getActiveCallSessionForRoom(userId, id),
  ]);

  if (roomErr || !roomData) return null;
  const roomType = (roomData as RoomRow).room_type;
  if (isCommunityMessengerGroupRoomType(roomType)) {
    const snapshot = await getCommunityMessengerRoomSnapshot(userId, roomId);
    return snapshot ? { kind: "fullSnapshot", snapshot } : null;
  }

  const { data: pRows } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", id);
  const memberIds = dedupeIds(
    ((pRows ?? []) as Array<{ user_id?: string | null }>)
      .map((r) => r.user_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
  );
  if (!memberIds.includes(userId)) return null;
  const peers = memberIds.filter((uid) => uid !== userId);
  const peerUserId = peers[0] ?? null;
  if (!peerUserId) return null;

  const rawStatus = (roomData as RoomRow).room_status;
  const roomStatus = (rawStatus ?? "active") as CommunityMessengerRoomStatus;
  const isReadonly = (roomData as { is_readonly?: boolean | null }).is_readonly === true;

  return {
    kind: "directLight",
    peerUserId,
    activeCall,
    roomStatus,
    isReadonly,
  };
}

export async function startCommunityMessengerCallSession(input: {
  userId: string;
  roomId: string;
  callKind: CommunityMessengerCallKind;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_required" };

  const resolved = await resolveRoomContextForCallSessionStart(input.userId, roomId);
  if (!resolved) return { ok: false, error: "room_not_found" };

  let snapshot: CommunityMessengerRoomSnapshot | null = null;
  let isGroupRoom: boolean;
  let peerUserId: string | null;

  if (resolved.kind === "fullSnapshot") {
    snapshot = resolved.snapshot;
    if (snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly) {
      return { ok: false, error: "room_unavailable" };
    }
    if (snapshot.activeCall && !isTerminalCallSessionStatus(snapshot.activeCall.status)) {
      return { ok: true, session: snapshot.activeCall };
    }
    isGroupRoom = isCommunityMessengerGroupRoomType(snapshot.room.roomType);
    peerUserId = isGroupRoom
      ? null
      : trimText(snapshot.room.peerUserId ?? "") || snapshot.members.find((item) => item.id !== input.userId)?.id || null;
    if (!isGroupRoom && !peerUserId) return { ok: false, error: "peer_not_found" };
    if (isGroupRoom && snapshot.members.length > 4) {
      return { ok: false, error: "group_call_limit_exceeded" };
    }
  } else {
    if (resolved.roomStatus !== "active" || resolved.isReadonly) {
      return { ok: false, error: "room_unavailable" };
    }
    if (resolved.activeCall && !isTerminalCallSessionStatus(resolved.activeCall.status)) {
      return { ok: true, session: resolved.activeCall };
    }
    peerUserId = resolved.peerUserId;
    isGroupRoom = false;
  }

  if (isGroupRoom && !snapshot) {
    return { ok: false, error: "room_not_found" };
  }

  const sb = getSupabaseOrNull();
  if (!isGroupRoom && sb) {
    const tradeCallGate = await assertMessengerTradeDirectRoomAllowsCallKind({
      supabase: sb,
      roomId,
      callKind: input.callKind,
    });
    if (!tradeCallGate.ok) {
      return { ok: false, error: tradeCallGate.error };
    }
  }

  const startedAt = nowIso();
  if (sb) {
    if (!isGroupRoom && peerUserId) {
      const peerBusy = await userHasActiveDirectCallSession(sb, peerUserId);
      if (peerBusy) {
        return { ok: false, error: "peer_busy" };
      }
    }
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
        ? snapshot!.members.map((member) => ({
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
      await appendCommunityMessengerCallSessionEvent(sb, {
        sessionId: inserted.id,
        actorUserId: input.userId,
        eventType: "ringing",
        payload: { call_kind: input.callKind, session_mode: isGroupRoom ? "group" : "direct" },
      });
      if (!isGroupRoom && peerUserId) {
        void (async () => {
          try {
            const pol = await getMessengerCallAdminPolicyCached();
            if (pol.suppress_incoming_local_notifications) return;
            const profileMap = await fetchProfilesByIds([input.userId]);
            const callerLabel = profileLabel(profileMap.get(input.userId), input.userId);
            await sendWebPushForCommunityMessengerIncomingCall({
              recipientUserId: peerUserId,
              sessionId: inserted.id,
              callKind: input.callKind,
              callerDisplayName: callerLabel,
            });
          } catch {
            /* Web Push 실패는 통화 발신 성공과 분리 */
          }
        })();
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
      return {
        ok: true,
        session: await mapCallSession(
          input.userId,
          inserted as CallSessionRow,
          syntheticParticipantRows,
          undefined,
          true,
          "labels_only"
        ),
      };
    }
    if (error && isUniqueViolationError(error)) {
      const existing = await getActiveCallSessionForRoom(input.userId, roomId);
      if (existing) {
        return { ok: true, session: existing };
      }
    }
    if (!isMissingTableError(error)) {
      return { ok: false, error: String(error.message ?? "call_session_start_failed") };
    }
  }

  if (!snapshot && !isGroupRoom) {
    snapshot = await getCommunityMessengerRoomSnapshot(input.userId, roomId);
  }

  const existingDevLive = await getActiveCallSessionForRoom(input.userId, roomId);
  if (existingDevLive) {
    return { ok: true, session: existingDevLive };
  }

  if (!snapshot) {
    return { ok: false, error: "room_not_found" };
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

/** 1:1 voice → video: `call_kind` 를 video 로 (링 중 발신자가 바꾸거나, 연결 후 인콜 업그레이드). */
export async function upgradeCommunityMessengerCallSessionToVideo(input: {
  userId: string;
  sessionId: string;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  if (!sessionId) return { ok: false, error: "session_required" };
  const uid = trimText(input.userId);
  if (!uid) return { ok: false, error: "forbidden" };

  const sessionSelect =
    "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at";

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(sessionSelect)
      .eq("id", sessionId)
      .maybeSingle();
    if (!row) return { ok: false, error: "not_found" };
    const session = row as CallSessionRow;
    if ((session.session_mode ?? "direct") !== "direct") {
      return { ok: false, error: "bad_action" };
    }
    const recip = trimText(session.recipient_user_id ?? "");
    const isParty =
      messengerUserIdsEqual(session.initiator_user_id, uid) || (recip.length > 0 && messengerUserIdsEqual(recip, uid));
    if (!isParty) return { ok: false, error: "forbidden" };
    if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
    if (session.call_kind === "video") {
      return { ok: true, session: await mapCallSession(uid, session) };
    }
    if (session.call_kind !== "voice") return { ok: false, error: "bad_action" };

    const tradeVideoGate = await assertMessengerTradeDirectRoomAllowsCallKind({
      supabase: sb,
      roomId: trimText(session.room_id ?? ""),
      callKind: "video",
    });
    if (!tradeVideoGate.ok) {
      return { ok: false, error: tradeVideoGate.error };
    }

    const now = nowIso();
    const { data: updated, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .update({ call_kind: "video", updated_at: now })
      .eq("id", sessionId)
      .select(sessionSelect)
      .single();
    if (error || !updated) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";
      return { ok: false, error: message || "call_session_update_failed" };
    }
    return { ok: true, session: await mapCallSession(uid, updated as CallSessionRow) };
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };
  if (session.sessionMode !== "direct") return { ok: false, error: "bad_action" };
  const r = session.recipientUserId ? trimText(session.recipientUserId) : "";
  const isParty =
    messengerUserIdsEqual(session.initiatorUserId, uid) || (r.length > 0 && messengerUserIdsEqual(r, uid));
  if (!isParty) return { ok: false, error: "forbidden" };
  if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
  if (session.callKind === "video") {
    return { ok: true, session: await mapCallSession(uid, session) };
  }
  if (session.callKind !== "voice") return { ok: false, error: "bad_action" };
  session.callKind = "video";
  return { ok: true, session: await mapCallSession(uid, session) };
}

/** 1:1 video → voice: 세션 call_kind 를 voice 로 (영상만 끄는 UX 의 서버 상태) */
export async function downgradeCommunityMessengerCallSessionToVoice(input: {
  userId: string;
  sessionId: string;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  if (!sessionId) return { ok: false, error: "session_required" };
  const uid = trimText(input.userId);
  if (!uid) return { ok: false, error: "forbidden" };

  const sessionSelect =
    "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at";

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(sessionSelect)
      .eq("id", sessionId)
      .maybeSingle();
    if (!row) return { ok: false, error: "not_found" };
    const session = row as CallSessionRow;
    if ((session.session_mode ?? "direct") !== "direct") {
      return { ok: false, error: "bad_action" };
    }
    const recip = trimText(session.recipient_user_id ?? "");
    const isParty =
      messengerUserIdsEqual(session.initiator_user_id, uid) || (recip.length > 0 && messengerUserIdsEqual(recip, uid));
    if (!isParty) return { ok: false, error: "forbidden" };
    if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
    if (session.call_kind === "voice") {
      return { ok: true, session: await mapCallSession(uid, session) };
    }
    if (session.call_kind !== "video") return { ok: false, error: "bad_action" };

    const now = nowIso();
    const { data: updated, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .update({ call_kind: "voice", updated_at: now })
      .eq("id", sessionId)
      .select(sessionSelect)
      .single();
    if (error || !updated) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";
      return { ok: false, error: message || "call_session_update_failed" };
    }
    return { ok: true, session: await mapCallSession(uid, updated as CallSessionRow) };
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };
  if (session.sessionMode !== "direct") return { ok: false, error: "bad_action" };
  const r = session.recipientUserId ? trimText(session.recipientUserId) : "";
  const isParty =
    messengerUserIdsEqual(session.initiatorUserId, uid) || (r.length > 0 && messengerUserIdsEqual(r, uid));
  if (!isParty) return { ok: false, error: "forbidden" };
  if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
  if (session.callKind === "voice") {
    return { ok: true, session: await mapCallSession(uid, session) };
  }
  if (session.callKind !== "video") return { ok: false, error: "bad_action" };
  session.callKind = "voice";
  return { ok: true, session: await mapCallSession(uid, session) };
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
      if (!messengerUserIdsEqual(initiatorUserId, input.userId)) return null;
      if (status === "ringing") return { nextStatus: "cancelled", endedAt: nowIso() };
      /* 이미 연결된 뒤에도 일부 클라이언트가 cancel 만 보내면 bad_action 이 되고 세션이 active 에 고정될 수 있음 */
      if (status === "active") return { nextStatus: "ended", endedAt: nowIso() };
      return null;
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
  const resolveHangupReason = (
    action: "accept" | "reject" | "cancel" | "end" | "missed",
    nextStatus: CommunityMessengerCallSessionStatus
  ): "reject" | "cancel" | "missed" | "end" | null => {
    if (!isTerminalCallSessionStatus(nextStatus)) return null;
    if (nextStatus === "rejected" || action === "reject") return "reject";
    if (nextStatus === "cancelled" || action === "cancel") return "cancel";
    if (nextStatus === "missed" || action === "missed") return "missed";
    return "end";
  };
  const publishDirectTerminalHangupSignalBestEffort = async (
    toUserId: string | null | undefined,
    nextStatus: CommunityMessengerCallSessionStatus
  ) => {
    const to = trimText(toUserId ?? "");
    if (!to || !isTerminalCallSessionStatus(nextStatus)) return;
    const reason = resolveHangupReason(input.action, nextStatus);
    if (!reason) return;
    try {
      await createCommunityMessengerCallSignal({
        userId: input.userId,
        sessionId,
        toUserId: to,
        signalType: "hangup",
        payload: { reason, source: "session_patch" },
      });
    } catch {
      /* best-effort: 세션 상태가 authoritative */
    }
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
            .update({ status: "cancelled", ended_at: now, updated_at: now, ended_reason: "canceled" })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
            )
            .single();
          if (updated) {
            const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
            await finalizeLog(session, mapped);
            await appendCommunityMessengerCallSessionEvent(sb, {
              sessionId,
              actorUserId: input.userId,
              eventType: "canceled",
              payload: { scope: "group" },
            });
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
          /** 발신 취소 등으로 이미 종료된 뒤 수신 측 거절이 늦게 오는 경우 — bad_action 반복 방지 */
          if (isTerminalCallSessionStatus(session.status)) {
            const mapped = await mapCallSession(input.userId, session);
            return { ok: true, session: mapped };
          }
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
            .update({ status: "missed", ended_at: now, updated_at: now, ended_reason: "missed" })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, created_at"
            )
            .single();
          if (updated) {
            const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
            await finalizeLog(session, mapped);
            await appendCommunityMessengerCallSessionEvent(sb, {
              sessionId,
              actorUserId: input.userId,
              eventType: "missed",
              payload: { scope: "group" },
            });
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
        const erG = endedReasonForSessionDelta(input.action, nextStatus as CommunityMessengerCallSessionStatus);
        if (erG) updatePayload.ended_reason = erG;
        else if (nextStatus === "active") updatePayload.ended_reason = null;
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
        await appendCommunityMessengerCallSessionEvent(sb, {
          sessionId,
          actorUserId: input.userId,
          eventType: auditEventTypeForAction(input.action, nextStatus as CommunityMessengerCallSessionStatus),
          payload: { next_status: nextStatus, scope: "group" },
        });
        return { ok: true, session: mapped };
      }

      const next = resolveDirectNextStatus(session);
      if (!next) {
        if (
          input.action === "reject" &&
          messengerUserIdsEqual(session.recipient_user_id, input.userId) &&
          isTerminalCallSessionStatus(session.status)
        ) {
          const mapped = await mapCallSession(input.userId, session);
          return { ok: true, session: mapped };
        }
        return { ok: false, error: "bad_action" };
      }
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
        const er = endedReasonForSessionDelta(input.action, next.nextStatus);
        if (er) updatePayload.ended_reason = er;
        else if (next.nextStatus === "active") updatePayload.ended_reason = null;
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
        await appendCommunityMessengerCallSessionEvent(sb, {
          sessionId,
          actorUserId: input.userId,
          eventType: auditEventTypeForAction(input.action, next.nextStatus),
          payload: { next_status: next.nextStatus, scope: "direct" },
        });
        if (isTerminalCallSessionStatus(next.nextStatus)) {
          const peerUserId = messengerUserIdsEqual(updated.initiator_user_id, input.userId)
            ? updated.recipient_user_id
            : updated.initiator_user_id;
          await publishDirectTerminalHangupSignalBestEffort(peerUserId, next.nextStatus);
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
  if (!next) {
    if (
      input.action === "reject" &&
      session.sessionMode === "direct" &&
      messengerUserIdsEqual(session.recipientUserId, input.userId) &&
      isTerminalCallSessionStatus(session.status)
    ) {
      const mapped = await mapCallSession(input.userId, session);
      return { ok: true, session: mapped };
    }
    return { ok: false, error: "bad_action" };
  }
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
  if (isTerminalCallSessionStatus(next.nextStatus)) {
    const peerUserId = messengerUserIdsEqual(session.initiatorUserId, input.userId)
      ? session.recipientUserId
      : session.initiatorUserId;
    await publishDirectTerminalHangupSignalBestEffort(peerUserId, next.nextStatus);
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
  const policy = await getMessengerCallAdminPolicyCached();
  const sb = getSupabaseOrNull();
  if (sb && policy.busy_auto_reject_enabled) {
    if (await userHasActiveDirectCallSession(sb, userId)) {
      return [];
    }
  }

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
        const filtered = await filterDirectIncomingRowsForPolicy(sb, userId, (directRows ?? []) as CallSessionRow[], policy);
        if (filtered.length) {
          return mapIncomingCallSessionsBatch(userId, filtered);
        }
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
      const directFiltered = (directRows ?? []).length
        ? await filterDirectIncomingRowsForPolicy(sb, userId, (directRows ?? []) as CallSessionRow[], policy)
        : [];
      const merged = [...directFiltered, ...groupRows]
        .sort((a, b) => (trimText(b.created_at) || "").localeCompare(trimText(a.created_at) || ""))
        .slice(0, 10);
      return mapIncomingCallSessionsBatch(userId, merged);
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
