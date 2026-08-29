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
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  extractCanonicalSoundIdentity,
  ingestCanonicalNotificationSound,
} from "@/lib/notifications/notification-sound-decision";
import {
  getNotificationSoundGateSnapshot,
  syncNotificationSoundGateSnapshot,
  type NotificationSoundGateSnapshot,
} from "@/lib/notifications/notification-sound-gate-snapshot";
import { normalizeNotificationPreferenceStorage } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import {
  resolveMemberSoundFromPreferences,
  resolveSoundPreferenceRecipientRole,
} from "@/lib/notifications/notification-sound-member-preference-gate";
import { resolveOwnerSoundFromPreferences } from "@/lib/notifications/notification-sound-owner-preference-gate";

export type { NotificationSoundGateSnapshot };
export { getNotificationSoundGateSnapshot, syncNotificationSoundGateSnapshot };

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

function playRowEventSound(
  row: Record<string, unknown>,
  extra?: { muted?: boolean; sameRoomForeground?: boolean }
): boolean {
  const identity = extractCanonicalSoundIdentity(row);
  if (!identity) return false;
  const eventKey = resolveNotificationSoundEventKeyFromRowWithFallback(rowInputFromRecord(row));
  const recipientId =
    (typeof row.user_id === "string" && row.user_id.trim() ? row.user_id.trim() : "") ||
    getBoundAuthUserId() ||
    "";
  const decision = ingestCanonicalNotificationSound({
    identityKind: identity.identityKind,
    canonicalEventId: identity.canonicalEventId,
    recipientId,
    eventType: eventKey,
    source: "realtime",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    muted: extra?.muted === true || row.muted_snapshot === true,
    sameRoomForeground: extra?.sameRoomForeground,
    gate: getNotificationSoundGateSnapshot(),
  });
  return decision.action === "PLAY";
}

function hasSoundSuppression(row: Record<string, unknown>): boolean {
  if (row.muted_snapshot === true) return true;
  return typeof row.sound_suppressed_reason === "string" && row.sound_suppressed_reason.trim().length > 0;
}

/**
 * INSERT 알림 행에 대한 인앱 알림음 라우팅.
 * 게이트가 없으면 `undefined` — `useSupabaseNotificationsRealtime` 기본 재생 경로로 넘김.
 */
function explainShouldPlayInAppSoundFromGate(
  snap: NotificationSoundGateSnapshot,
  domain: NotificationDomain,
  refId: string | null | undefined,
): { play: boolean; skipReason: string | null } {
  if (!snap.userNotificationSettings.sound_enabled) {
    return { play: false, skipReason: "sound_disabled" };
  }
  if (!snap.isWindowFocused) {
    return { play: false, skipReason: "window_unfocused_os_owns_sound" };
  }
  if (domain === "trade_chat" && snap.userNotificationSettings.trade_chat_enabled === false) {
    return { play: false, skipReason: "trade_chat_disabled" };
  }
  if (isCommunityChatSoundDomain(domain) && snap.userNotificationSettings.community_chat_enabled === false) {
    return { play: false, skipReason: "community_chat_disabled" };
  }
  if (domain === "order" && snap.userNotificationSettings.order_enabled === false) {
    return { play: false, skipReason: "order_disabled" };
  }
  if (domain === "store" && snap.userNotificationSettings.store_enabled === false) {
    return { play: false, skipReason: "store_disabled" };
  }
  const ref = refId != null ? String(refId).trim() : "";
  if (domain === "trade_chat" && ref && snap.activeTradeChatRoomId === ref) {
    return { play: false, skipReason: "active_trade_room" };
  }
  if (isCommunityChatSoundDomain(domain) && ref && snap.activeCommunityChatRoomId === ref) {
    return { play: false, skipReason: "active_community_room" };
  }
  return { play: true, skipReason: null };
}

function explainShouldPlayGroupChatInAppSoundFromGate(
  snap: NotificationSoundGateSnapshot,
  roomId: string | null | undefined,
): { play: boolean; skipReason: string | null } {
  if (!snap.isWindowFocused) {
    return { play: false, skipReason: "window_unfocused_os_owns_sound" };
  }
  const ref = roomId != null ? String(roomId).trim() : "";
  if (ref && snap.activeGroupChatRoomId === ref) {
    return { play: false, skipReason: "active_group_room" };
  }
  return { play: true, skipReason: null };
}

function memberPreferenceSnapshotFromGate(
  snap: NotificationSoundGateSnapshot,
  now: Date
) {
  const storage = snap.memberPreferenceStorage ?? {
    notificationSettingsRow: null,
    legacyUserSettingsRow: null,
  };
  const ownerStorage = snap.ownerPreferenceStorage ?? { ownerSettingsRow: null };
  return normalizeNotificationPreferenceStorage({
    notificationSettingsRow: storage.notificationSettingsRow,
    legacyUserSettingsRow: storage.legacyUserSettingsRow,
    ownerSettingsRow: ownerStorage.ownerSettingsRow,
    now,
  });
}

function explainMemberSoundPreferenceFromRow(
  snap: NotificationSoundGateSnapshot,
  row: Record<string, unknown>,
  now: Date = new Date()
): { play: boolean; skipReason: string | null } {
  const preferences = memberPreferenceSnapshotFromGate(snap, now);
  const play = resolveMemberSoundFromPreferences(row, preferences, now);
  return {
    play,
    skipReason: play ? null : "member_preference_resolver",
  };
}

function explainOwnerSoundPreferenceFromRow(
  snap: NotificationSoundGateSnapshot,
  row: Record<string, unknown>,
  now: Date = new Date()
): { play: boolean; skipReason: string | null } {
  const preferences = memberPreferenceSnapshotFromGate(snap, now);
  const play = resolveOwnerSoundFromPreferences(row, preferences, now);
  return {
    play,
    skipReason: play ? null : "owner_preference_resolver",
  };
}

function explainPreferenceSoundFromGate(
  snap: NotificationSoundGateSnapshot,
  row: Record<string, unknown>,
  domain: NotificationDomain | null,
  refId: string | null | undefined,
  roomId?: string | null
): { play: boolean; skipReason: string | null } {
  if (!snap.isWindowFocused) {
    return { play: false, skipReason: "window_unfocused_os_owns_sound" };
  }

  if (roomId != null) {
    const groupGate = explainShouldPlayGroupChatInAppSoundFromGate(snap, roomId);
    if (!groupGate.play) return groupGate;
  } else if (domain) {
    const ref = refId != null ? String(refId).trim() : "";
    if (domain === "trade_chat" && ref && snap.activeTradeChatRoomId === ref) {
      return { play: false, skipReason: "active_trade_room" };
    }
    if (isCommunityChatSoundDomain(domain) && ref && snap.activeCommunityChatRoomId === ref) {
      return { play: false, skipReason: "active_community_room" };
    }
  }

  const recipientRole = resolveSoundPreferenceRecipientRole(row);
  if (recipientRole === "member") {
    return explainMemberSoundPreferenceFromRow(snap, row);
  }
  if (recipientRole === "owner") {
    return explainOwnerSoundPreferenceFromRow(snap, row);
  }

  if (domain) {
    return explainShouldPlayInAppSoundFromGate(snap, domain, refId);
  }

  if (roomId != null) {
    return explainShouldPlayGroupChatInAppSoundFromGate(snap, roomId);
  }

  return { play: true, skipReason: null };
}

export function routeNotificationInsertSound(row: Record<string, unknown>): boolean | void {
  const eventId = typeof row.id === "string" ? row.id : null;
  const roomIdFromRow =
    typeof row.room_id === "string"
      ? row.room_id
      : typeof (row.meta as { room_id?: string } | undefined)?.room_id === "string"
        ? (row.meta as { room_id: string }).room_id
        : null;
  const probeBase = {
    eventId,
    roomId: roomIdFromRow,
    type: typeof row.type === "string" ? row.type : null,
    category: typeof row.category === "string" ? row.category : null,
  };
  const surface = getNotificationSoundGateSnapshot();
  logBadgeFdProbe("routeNotificationInsertSound.enter", {
    ...probeBase,
    hasGateSnapshot: Boolean(surface),
    focused: surface?.isWindowFocused ?? null,
    sound_enabled: surface?.userNotificationSettings.sound_enabled ?? null,
    activeCommunityChatRoomId: surface?.activeCommunityChatRoomId ?? null,
    activeTradeChatRoomId: surface?.activeTradeChatRoomId ?? null,
    activeGroupChatRoomId: surface?.activeGroupChatRoomId ?? null,
  });

  const finish = (result: boolean | void, skipReason: string | null, extra?: Record<string, unknown>) => {
    logBadgeFdProbe("routeNotificationInsertSound.exit", {
      ...probeBase,
      result: result === undefined ? "undefined" : result,
      skipReason,
      ...extra,
    });
    return result;
  };

  if (hasSoundSuppression(row)) {
    playRowEventSound(row, { muted: true });
    return finish(false, "row_sound_suppressed", {
      muted_snapshot: row.muted_snapshot === true,
      sound_suppressed_reason:
        typeof row.sound_suppressed_reason === "string" ? row.sound_suppressed_reason : null,
    });
  }

  const rowInput = rowInputFromRecord(row);
  const metaKind = (row.meta as { kind?: string; room_id?: string } | undefined)?.kind;
  const metaAny = row.meta as { kind?: string; room_id?: string } | undefined;
  const refId = typeof row.ref_id === "string" ? row.ref_id : null;
  const roomRef =
    metaAny?.room_id && typeof metaAny.room_id === "string" ? metaAny.room_id : refId;

  if (roomRef && isChatRoomMessageSoundMuted(String(roomRef))) {
    playRowEventSound(row, { muted: true });
    return finish(false, "chat_room_message_sound_muted", { roomRef });
  }

  const pathActiveRoom = communityRoomIdFromWindowPath();
  const roomRefNorm = roomRef != null ? String(roomRef).trim() : "";
  const gateActiveCm =
    surface?.activeCommunityChatRoomId != null ? String(surface.activeCommunityChatRoomId).trim() : "";
  const gateActiveTrade =
    surface?.activeTradeChatRoomId != null ? String(surface.activeTradeChatRoomId).trim() : "";
  const sameRoomForeground = Boolean(
    roomRefNorm &&
      ((pathActiveRoom && pathActiveRoom === roomRefNorm) ||
        (gateActiveCm && gateActiveCm === roomRefNorm) ||
        (gateActiveTrade && gateActiveTrade === roomRefNorm))
  );
  if (sameRoomForeground) {
    playRowEventSound(row, { sameRoomForeground: true });
    return finish(false, "path_active_same_room", { roomRef: roomRefNorm, pathActiveRoom });
  }
  const gateDomainEarly = resolveNotificationSoundGateDomainFromRow(rowInput);
  if (
    (gateDomainEarly == null || isCommunityChatSoundDomain(gateDomainEarly) || metaKind === "community_chat" || metaKind === "group_chat") &&
    shouldSkipNotificationInsertSoundForCmParticipant(roomRef)
  ) {
    playRowEventSound(row, { sameRoomForeground: true });
    return finish(false, "cm_participant_already_played", { roomRef, gateDomainEarly });
  }

  if (!surface) {
    const played = playRowEventSound(row);
    return finish(played, played ? null : "decision_skip");
  }

  if (metaKind === "community_group_invite") {
    const roomId = (row.meta as { room_id?: string } | undefined)?.room_id;
    if (typeof roomId === "string" && roomId.trim()) {
      const gate = explainPreferenceSoundFromGate(surface, row, null, null, roomId);
      logBadgeFdProbe("shouldPlayGroupChatInAppSoundFromGate", {
        ...probeBase,
        roomId,
        play: gate.play,
        skipReason: gate.skipReason,
      });
      if (!gate.play) {
        playRowEventSound(row, { muted: true });
        return finish(false, gate.skipReason ?? "group_invite_gate_false", { roomId });
      }
      const played = playRowEventSound(row);
      return finish(played, played ? null : "decision_skip", { played: "community_group_invite" });
    }
    return finish(false, "group_invite_missing_room");
  }

  if (metaAny?.kind === "group_chat" && typeof metaAny.room_id === "string") {
    const gate = explainPreferenceSoundFromGate(surface, row, null, null, metaAny.room_id);
    logBadgeFdProbe("shouldPlayGroupChatInAppSoundFromGate", {
      ...probeBase,
      roomId: metaAny.room_id,
      play: gate.play,
      skipReason: gate.skipReason,
    });
    if (!gate.play) {
      playRowEventSound(row, { muted: true });
      return finish(false, gate.skipReason ?? "group_chat_gate_false", { roomId: metaAny.room_id });
    }
    const played = playRowEventSound(row);
    return finish(played, played ? null : "decision_skip", { played: "group_chat" });
  }

  const gateDomain = gateDomainEarly;

  if (gateDomain === "community_group_chat") {
    const gate = explainPreferenceSoundFromGate(surface, row, gateDomain, roomRef, roomRef);
    logBadgeFdProbe("shouldPlayGroupChatInAppSoundFromGate", {
      ...probeBase,
      roomId: roomRef,
      play: gate.play,
      skipReason: gate.skipReason,
    });
    if (!gate.play) {
      playRowEventSound(row, { muted: true });
      return finish(false, gate.skipReason ?? "community_group_chat_gate_false", { roomRef });
    }
    const played = playRowEventSound(row);
    return finish(played, played ? null : "decision_skip", { played: "community_group_chat" });
  }

  if (gateDomain) {
    const gate = explainPreferenceSoundFromGate(surface, row, gateDomain, roomRef);
    logBadgeFdProbe("shouldPlayInAppSoundFromGate", {
      ...probeBase,
      domain: gateDomain,
      roomRef,
      play: gate.play,
      skipReason: gate.skipReason,
    });
    if (!gate.play) {
      playRowEventSound(row, { muted: true });
      return finish(false, gate.skipReason ?? "domain_gate_false", { gateDomain, roomRef });
    }
    const played = playRowEventSound(row);
    return finish(played, played ? null : "decision_skip", { played: gateDomain });
  }

  const domainRaw = row.domain;
  if (typeof domainRaw === "string" && isNotificationDomain(domainRaw)) {
    const routedDomain =
      domainRaw === "community_chat" ? "community_direct_chat" : (domainRaw as NotificationDomain);
    const gate = explainPreferenceSoundFromGate(surface, row, routedDomain, refId);
    logBadgeFdProbe("shouldPlayInAppSoundFromGate", {
      ...probeBase,
      domain: routedDomain,
      refId,
      play: gate.play,
      skipReason: gate.skipReason,
    });
    if (!gate.play) {
      playRowEventSound(row, { muted: true });
      return finish(false, gate.skipReason ?? "legacy_domain_gate_false", { routedDomain, refId });
    }
    const played = playRowEventSound(row);
    return finish(played, played ? null : "decision_skip", { played: routedDomain });
  }

  const fallbackGate = explainPreferenceSoundFromGate(surface, row, null, refId);
  if (!fallbackGate.play) {
    playRowEventSound(row, { muted: true });
    return finish(false, fallbackGate.skipReason ?? "member_preference_resolver");
  }

  const played = playRowEventSound(row);
  return finish(played, played ? null : "no_domain_route");
}
