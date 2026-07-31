import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  resolveNotificationSoundEventKeyFromRowWithFallback,
  resolveNotificationSoundGateDomainFromRow,
  type NotificationSoundRowInput,
} from "@/lib/notifications/notification-sound-event-key-from-row";
import { shouldSkipNotificationInsertSoundForCmParticipant } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import {
  isNotificationDomain,
  type NotificationDomain,
} from "@/lib/notifications/notification-domains";
import { isChatRoomMessageSoundMuted } from "@/lib/chats/chat-room-message-sound-mute";

/** `NotificationSurfaceProvider` 가 매 렌더 동기 갱신 — Realtime 콜백은 컨텍스트 리렌더 없이 읽는다. */
export type NotificationSoundGateSnapshot = {
  userNotificationSettings: {
    trade_chat_enabled: boolean;
    community_chat_enabled: boolean;
    order_enabled: boolean;
    store_enabled: boolean;
    sound_enabled: boolean;
    vibration_enabled: boolean;
  };
  activeTradeChatRoomId: string | null;
  activeCommunityChatRoomId: string | null;
  activeGroupChatRoomId: string | null;
  isWindowFocused: boolean;
};

let gateSnapshot: NotificationSoundGateSnapshot | null = null;

function isCommunityChatSoundDomain(domain: NotificationDomain): boolean {
  return domain === "community_chat" || domain === "community_direct_chat" || domain === "community_group_chat";
}

/** Provider 리렌더 전 Realtime 콜백용 — URL 이 이미 방이면 동일 방 음 억제 */
function communityRoomIdFromWindowPath(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function syncNotificationSoundGateSnapshot(next: NotificationSoundGateSnapshot | null): void {
  gateSnapshot = next;
}

/** Realtime 콜백 등 Provider 바깥에서 현재 게이트 스냅샷 읽기 */
export function getNotificationSoundGateSnapshot(): NotificationSoundGateSnapshot | null {
  return gateSnapshot;
}

export function shouldPlayInAppSoundFromGate(
  snap: NotificationSoundGateSnapshot,
  domain: NotificationDomain,
  refId: string | null | undefined
): boolean {
  if (!snap.userNotificationSettings.sound_enabled) return false;
  // Background/unfocused surfaces yield sound ownership to OS push.
  if (!snap.isWindowFocused) return false;
  if (domain === "trade_chat" && snap.userNotificationSettings.trade_chat_enabled === false) {
    return false;
  }
  if (isCommunityChatSoundDomain(domain) && snap.userNotificationSettings.community_chat_enabled === false) {
    return false;
  }
  if (domain === "order" && snap.userNotificationSettings.order_enabled === false) return false;
  if (domain === "store" && snap.userNotificationSettings.store_enabled === false) return false;

  const ref = refId != null ? String(refId).trim() : "";
  if (domain === "trade_chat" && ref && snap.activeTradeChatRoomId === ref) {
    return false;
  }
  if (isCommunityChatSoundDomain(domain) && ref) {
    if (snap.activeCommunityChatRoomId === ref) return false;
  }
  return true;
}

export function shouldPlayGroupChatInAppSoundFromGate(
  snap: NotificationSoundGateSnapshot,
  roomId: string | null | undefined
): boolean {
  if (!snap.userNotificationSettings.sound_enabled) return false;
  if (!snap.isWindowFocused) return false;
  if (snap.userNotificationSettings.community_chat_enabled === false) return false;
  const ref = roomId != null ? String(roomId).trim() : "";
  if (ref && snap.activeGroupChatRoomId === ref) return false;
  return true;
}

function rowInputFromRecord(row: Record<string, unknown>): NotificationSoundRowInput {
  return {
    notification_type: typeof row.notification_type === "string" ? row.notification_type : null,
    domain: typeof row.domain === "string" ? row.domain : null,
    meta: row.meta,
    ref_id: typeof row.ref_id === "string" ? row.ref_id : null,
  };
}

function playRowEventSound(row: Record<string, unknown>): void {
  const eventKey = resolveNotificationSoundEventKeyFromRowWithFallback(rowInputFromRecord(row));
  void playEventNotificationSound(eventKey);
}

function hasSoundSuppression(row: Record<string, unknown>): boolean {
  if (row.muted_snapshot === true) return true;
  return typeof row.sound_suppressed_reason === "string" && row.sound_suppressed_reason.trim().length > 0;
}

/**
 * INSERT 알림 행에 대한 인앱 알림음 라우팅.
 * 게이트가 없으면 `undefined` — `useSupabaseNotificationsRealtime` 기본 재생 경로로 넘김.
 */
export function routeNotificationInsertSound(row: Record<string, unknown>): boolean | void {
  const surface = gateSnapshot;
  if (!surface) return undefined;

  if (hasSoundSuppression(row)) return false;

  const rowInput = rowInputFromRecord(row);
  const metaKind = (row.meta as { kind?: string; room_id?: string } | undefined)?.kind;
  const metaAny = row.meta as { kind?: string; room_id?: string } | undefined;
  const refId = typeof row.ref_id === "string" ? row.ref_id : null;
  const roomRef =
    metaAny?.room_id && typeof metaAny.room_id === "string" ? metaAny.room_id : refId;

  /** 해당 방 세션/로컬 mute — polling 과 INSERT 공통 */
  if (roomRef && isChatRoomMessageSoundMuted(String(roomRef))) {
    return false;
  }

  /**
   * CM participants Realtime 이 이미 인앱 음을 냈으면 notifications INSERT 중복음 스킵.
   * (INSERT 가 participants 보다 늦게 도착해 "늦게 울림"으로 체감되는 경로)
   * 방 URL 진입 직후·동일 방 화면이면 Provider 스냅샷 지연과 무관하게 INSERT 음 차단.
   * activeRoom store(gate) + pathname 둘 다 검사.
   */
  const pathActiveRoom = communityRoomIdFromWindowPath();
  const roomRefNorm = roomRef != null ? String(roomRef).trim() : "";
  const gateActiveCm =
    surface.activeCommunityChatRoomId != null ? String(surface.activeCommunityChatRoomId).trim() : "";
  const gateActiveTrade =
    surface.activeTradeChatRoomId != null ? String(surface.activeTradeChatRoomId).trim() : "";
  if (roomRefNorm) {
    if (pathActiveRoom && pathActiveRoom === roomRefNorm) return false;
    if (gateActiveCm && gateActiveCm === roomRefNorm) return false;
    if (gateActiveTrade && gateActiveTrade === roomRefNorm) return false;
  }
  const gateDomainEarly = resolveNotificationSoundGateDomainFromRow(rowInput);
  if (
    (gateDomainEarly == null || isCommunityChatSoundDomain(gateDomainEarly) || metaKind === "community_chat" || metaKind === "group_chat") &&
    shouldSkipNotificationInsertSoundForCmParticipant(roomRef)
  ) {
    return false;
  }

  if (metaKind === "community_group_invite") {
    const roomId = (row.meta as { room_id?: string } | undefined)?.room_id;
    if (typeof roomId === "string" && roomId.trim()) {
      if (!shouldPlayGroupChatInAppSoundFromGate(surface, roomId)) {
        return false;
      }
      playRowEventSound(row);
      return true;
    }
    return false;
  }

  if (metaAny?.kind === "group_chat" && typeof metaAny.room_id === "string") {
    if (!shouldPlayGroupChatInAppSoundFromGate(surface, metaAny.room_id)) {
      return false;
    }
    playRowEventSound(row);
    return true;
  }

  const gateDomain = gateDomainEarly;

  if (gateDomain === "community_group_chat") {
    if (!shouldPlayGroupChatInAppSoundFromGate(surface, roomRef)) {
      return false;
    }
    playRowEventSound(row);
    return true;
  }

  if (gateDomain) {
    if (!shouldPlayInAppSoundFromGate(surface, gateDomain, roomRef)) {
      return false;
    }
    playRowEventSound(row);
    return true;
  }

  const domainRaw = row.domain;
  if (typeof domainRaw === "string" && isNotificationDomain(domainRaw)) {
    const routedDomain =
      domainRaw === "community_chat" ? "community_direct_chat" : (domainRaw as NotificationDomain);
    if (!shouldPlayInAppSoundFromGate(surface, routedDomain, refId)) {
      return false;
    }
    playRowEventSound(row);
    return true;
  }

  return undefined;
}
