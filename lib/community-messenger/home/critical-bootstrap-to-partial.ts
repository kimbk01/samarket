import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
  CommunityMessengerCriticalRoomRow,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/** critical API `context_meta` — string(JSON) 또는 v1 객체 → client `contextMeta`. */
function mapCriticalRowContextMeta(
  raw: CommunityMessengerCriticalRoomRow["context_meta"]
): CommunityMessengerRoomContextMetaV1 | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    return parseCommunityMessengerRoomContextMeta(raw);
  }
  if (typeof raw === "object") {
    return parseCommunityMessengerRoomContextMeta(JSON.stringify(raw));
  }
  return null;
}

function peerUserIdFromCriticalDirectRow(row: CommunityMessengerCriticalRoomRow, meId: string | null): string | null {
  if (row.room_type !== "direct") return null;
  const me = meId?.trim() ?? "";
  const ids = row.participant_labels_minimal.map((p) => p.user_id.trim()).filter(Boolean);
  if (!ids.length) return null;
  if (me) {
    const other = ids.find((id) => id !== me);
    if (other) return other;
  }
  return ids[0] ?? null;
}

/**
 * 서버 `tier=critical` 페이로드를 목록 렌더용 `CommunityMessengerBootstrap` 으로만 승격한다.
 * 결측 필드는 중립 기본값 — 이후 lite/full 부트스트랩이 동일 id 를 덮어쓴다.
 */
export function criticalRoomRowToRoomSummary(
  row: CommunityMessengerCriticalRoomRow,
  meId: string | null
): CommunityMessengerRoomSummary {
  const gm = row.group_meta;
  const joinPolicy = gm?.join_policy ?? "invite_only";
  return {
    id: row.room_id,
    roomType: row.room_type,
    roomStatus: "active",
    visibility: row.room_type === "open_group" ? "public" : "private",
    joinPolicy,
    identityPolicy: "real_name",
    isReadonly: false,
    title: row.title,
    subtitle: "",
    summary: "",
    avatarUrl: row.avatar_url,
    unreadCount: row.unread_count,
    lastMessage: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    memberCount: gm?.member_count ?? (row.room_type === "direct" ? 2 : 0),
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: gm?.member_limit ?? null,
    isDiscoverable: gm?.is_discoverable ?? false,
    requiresPassword: joinPolicy === "password",
    allowMemberInvite: true,
    messengerDirectKey: row.direct_key,
    peerUserId: peerUserIdFromCriticalDirectRow(row, meId),
    contextMeta: mapCriticalRowContextMeta(row.context_meta),
    /** A-16: 서버가 준 viewer 값만 싣는다(구 응답은 필드 없음 → 지금처럼 lite 가 채움) */
    ...(typeof row.is_archived_by_viewer === "boolean" ? { isArchivedByViewer: row.is_archived_by_viewer } : {}),
    ...(typeof row.is_blocked_hidden_by_viewer === "boolean"
      ? { isBlockedHiddenByViewer: row.is_blocked_hidden_by_viewer }
      : {}),
    ...(typeof row.is_pinned === "boolean" ? { isPinned: row.is_pinned } : {}),
    ...(typeof row.is_muted === "boolean" ? { isMuted: row.is_muted } : {}),
  };
}

export function communityMessengerBootstrapFromCriticalPayload(
  payload: CommunityMessengerBootstrapCritical
): CommunityMessengerBootstrap {
  const meId = payload.me?.id?.trim() ?? null;
  const chats = payload.chats.map((r) => criticalRoomRowToRoomSummary(r, meId));
  const groups = payload.groups.map((r) => criticalRoomRowToRoomSummary(r, meId));
  return {
    me: payload.me,
    tabs: {
      friends: 0,
      chats: payload.tabs.chats,
      groups: payload.tabs.groups,
      calls: 0,
    },
    friends: [],
    following: [],
    /**
     * critical tier 는 숨김·차단 목록을 모른다 → unknown(undefined). `[]` 를 넣으면
     * `bootstrap_apply_full` 이 authoritative 빈 목록으로 보고 매 refresh 마다 기존 목록을 지운다.
     * (friends·following·requests 의 기존 merge 의미는 변경하지 않음)
     */
    hidden: undefined,
    blocked: undefined,
    requests: [],
    chats,
    groups,
    discoverableGroups: [],
    calls: [],
    deferredCallLog: true,
    clientHydrationTier: "critical",
    ...(typeof payload.archived_count === "number" ? { criticalArchivedChatsCount: payload.archived_count } : {}),
  };
}
