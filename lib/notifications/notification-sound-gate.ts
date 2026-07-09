import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  resolveNotificationSoundEventKeyFromRowWithFallback,
  resolveNotificationSoundGateDomainFromRow,
  type NotificationSoundRowInput,
} from "@/lib/notifications/notification-sound-event-key-from-row";
import {
  isNotificationDomain,
  type NotificationDomain,
} from "@/lib/notifications/notification-domains";

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
  if (isCommunityChatSoundDomain(domain) && ref && snap.activeCommunityChatRoomId === ref) {
    return false;
  }
  if (!snap.isWindowFocused) {
    return true;
  }
  return true;
}

export function shouldPlayGroupChatInAppSoundFromGate(
  snap: NotificationSoundGateSnapshot,
  roomId: string | null | undefined
): boolean {
  if (!snap.userNotificationSettings.sound_enabled) return false;
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

  const metaAny = row.meta as { kind?: string; room_id?: string } | undefined;
  if (metaAny?.kind === "group_chat" && typeof metaAny.room_id === "string") {
    if (!shouldPlayGroupChatInAppSoundFromGate(surface, metaAny.room_id)) {
      return false;
    }
    playRowEventSound(row);
    return true;
  }

  const gateDomain = resolveNotificationSoundGateDomainFromRow(rowInput);
  const refId = typeof row.ref_id === "string" ? row.ref_id : null;
  const roomRef =
    metaAny?.room_id && typeof metaAny.room_id === "string" ? metaAny.room_id : refId;

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
