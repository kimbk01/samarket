import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  isNotificationDomain,
  type NotificationDomain,
} from "@/lib/notifications/notification-domains";
import { OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";

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

/**
 * INSERT 알림 행에 대한 인앱 알림음 라우팅.
 * 게이트가 없으면 `undefined` — `useSupabaseNotificationsRealtime` 기본 재생 경로로 넘김.
 */
export function routeNotificationInsertSound(row: Record<string, unknown>): boolean | void {
  const surface = gateSnapshot;
  if (!surface) return undefined;

  const domainRaw = row.domain;
  const refId = typeof row.ref_id === "string" ? row.ref_id : null;
  if (typeof domainRaw === "string" && isNotificationDomain(domainRaw)) {
    const metaAny = row.meta as { kind?: string; room_id?: string } | undefined;
    if (metaAny?.kind === "group_chat" && typeof metaAny.room_id === "string") {
      if (!shouldPlayGroupChatInAppSoundFromGate(surface, metaAny.room_id)) {
        return false;
      }
      void playDomainNotificationSound("community_group_chat");
      return true;
    }
    const routedDomain =
      domainRaw === "community_chat" ? "community_direct_chat" : (domainRaw as NotificationDomain);
    if (!shouldPlayInAppSoundFromGate(surface, routedDomain, refId)) {
      return false;
    }
    void playDomainNotificationSound(routedDomain);
    return true;
  }
  const meta = row.meta as { kind?: string; room_id?: string } | undefined;
  if (row.notification_type === "chat" && meta?.kind === "trade_chat" && meta?.room_id) {
    if (!shouldPlayInAppSoundFromGate(surface, "trade_chat", meta.room_id)) {
      return false;
    }
    void playDomainNotificationSound("trade_chat");
    return true;
  }
  if (row.notification_type === "chat" && meta?.kind === "community_chat" && meta?.room_id) {
    if (!shouldPlayInAppSoundFromGate(surface, "community_direct_chat", String(meta.room_id))) {
      return false;
    }
    void playDomainNotificationSound("community_direct_chat");
    return true;
  }
  if (row.notification_type === "commerce" && row.meta && typeof row.meta === "object") {
    const m = row.meta as { kind?: string; order_id?: string };
    const oid = typeof m.order_id === "string" ? m.order_id.trim() : "";
    const k = m.kind;
    if (oid && typeof k === "string") {
      const domain = OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(k) ? "store" : "order";
      if (!shouldPlayInAppSoundFromGate(surface, domain, oid)) {
        return false;
      }
      void playDomainNotificationSound(domain);
      return true;
    }
  }
  return undefined;
}
