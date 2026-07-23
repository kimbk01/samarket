/**
 * 채팅방 도메인 구분 — 거래/배달 카드는 메신저 목록에서 **표시용 메타**로만 쓰인다.
 * 사용자 대면 「채팅 3종」 정의·Philife·스토어 스트림·통화와의 혼동 금지는
 * `lib/chat-domain/samarket-three-chat-pillars.ts` 를 따른다.
 */

import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type CommunityMessengerInboxGroupKind = "trade" | "delivery" | "general";

/** Sorted user pair — `community_messenger_rooms.direct_key` for plain 1:1 DM. */
export function messengerDirectKeyForUserPair(userA: string, userB: string): string {
  return [userA.trim(), userB.trim()].filter(Boolean).sort().join(":");
}

/** 거래·배달 commerce direct_key — general friend DM 과 혼동 금지. */
export function isMessengerCommerceDirectKey(directKey: string | null | undefined): boolean {
  const dk = directKey?.trim() ?? "";
  if (!dk) return false;
  return (
    dk.startsWith("trade_pc:") ||
    dk.startsWith("trade_item:") ||
    dk.startsWith("store_order:") ||
    dk.startsWith("trade_order:")
  );
}

/**
 * general_friend_dm SSOT direct_key — sorted user pair only.
 * Phase D trade enrich·친구 메시지 ensure 가 commerce 키가 아닌 pair row 만 대상으로 삼는다.
 */
export function isMessengerGeneralFriendDirectKey(directKey: string | null | undefined): boolean {
  const dk = directKey?.trim() ?? "";
  if (!dk || isMessengerCommerceDirectKey(dk)) return false;
  const parts = dk.split(":");
  return parts.length === 2 && parts.every((part) => part.length > 0);
}

/** Phase D peer-pair trade enrich 대상에서 general friend DM row 제외. */
export function communityMessengerSummaryEligibleForPhaseDTradeEnrich(
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta" | "messengerDirectKey">
): boolean {
  if (room.roomType !== "direct") return false;
  if (room.contextMeta?.kind === "delivery") return false;
  if (isMessengerCommerceDirectKey(room.messengerDirectKey)) return false;
  if (isMessengerGeneralFriendDirectKey(room.messengerDirectKey)) return false;
  return true;
}

export function communityMessengerRoomIsConfirmedTrade(room: CommunityMessengerRoomSummary): boolean {
  /** Domain identity SSOT when present — fail-closed for other domains. */
  if (room.chatDomain === "trade") return true;
  if (
    room.chatDomain === "general_direct" ||
    room.chatDomain === "group" ||
    room.chatDomain === "store_order"
  ) {
    return false;
  }
  if (room.contextMeta?.kind === "trade") return true;
  const dk = room.messengerDirectKey?.trim() ?? "";
  return dk.startsWith("trade_pc:") || dk.startsWith("trade_item:");
}

export function communityMessengerRoomIsConfirmedDelivery(room: CommunityMessengerRoomSummary): boolean {
  if (room.chatDomain === "store_order") return true;
  if (
    room.chatDomain === "general_direct" ||
    room.chatDomain === "group" ||
    room.chatDomain === "trade"
  ) {
    return false;
  }
  if (room.contextMeta?.kind === "delivery") return true;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return false;
  return dk.startsWith("store_order:") || dk.startsWith("trade_order:");
}

export function communityMessengerRoomInboxGroupKind(
  room: CommunityMessengerRoomSummary
): CommunityMessengerInboxGroupKind {
  if (communityMessengerRoomIsConfirmedTrade(room)) return "trade";
  if (communityMessengerRoomIsConfirmedDelivery(room)) return "delivery";
  return "general";
}

export function communityMessengerRoomIsTrade(room: CommunityMessengerRoomSummary): boolean {
  if (room.contextMeta?.kind === "trade") return true;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return true;
  // 키워드 폴백: contextMeta·directKey 가 모두 없을 때만 사용.
  // 단어 경계 정규식으로 "거래처" 등 복합어 오분류 방지.
  // DO NOT: contextMeta 가 있는데 kind 가 다른 방에 이 폴백을 적용하면 필터 정합이 깨진다.
  if (room.contextMeta?.kind || dk) return false;
  const text = `${room.title ?? ""} ${room.summary ?? ""} ${room.subtitle ?? ""}`;
  return /(?<![가-힣])거래(?![가-힣])/.test(text);
}

export function communityMessengerRoomIsDelivery(room: CommunityMessengerRoomSummary): boolean {
  if (room.contextMeta?.kind === "delivery") return true;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return false;
  if (dk.startsWith("store_order:")) return true;
  if (dk.startsWith("trade_order:")) return true;
  // 키워드 폴백: contextMeta·directKey 가 모두 없을 때만 사용.
  // "주문" 단어는 일반 대화에서도 쓰이므로 "배달"만 단독 검사, "주문" 은 더 좁은 맥락에서만.
  if (room.contextMeta?.kind || dk) return false;
  const text = `${room.title ?? ""} ${room.summary ?? ""} ${room.subtitle ?? ""}`;
  return /(?<![가-힣])배달(?![가-힣])/.test(text) || /배달[^\s]*주문|주문[^\s]*배달/.test(text);
}

/**
 * 메신저 채팅 탭 목록에서 1:1 행을 합칠 때의 그룹 키.
 * 거래·배달 맥락이 있는 방은 **동일 peer 의 친구 DM 과 합치지 않음** —
 * 그렇지 않으면 `kind=trade` 필터에서 줄이 사라지고 item_trade 쪽 미읽음 뱃지만 남는 정합 깨짐이 난다.
 */
export function messengerDirectThreadListCollapseKey(room: CommunityMessengerRoomSummary): string {
  if (room.roomType !== "direct") return `id:${room.id}`;
  const peer = room.peerUserId?.trim();
  if (!peer) return `id:${room.id}`;
  if (communityMessengerRoomIsTrade(room) || communityMessengerRoomIsDelivery(room)) {
    return `id:${room.id}`;
  }
  return `direct:${peer}`;
}

/**
 * 친구 general_friend_dm — SSOT는 sorted-pair `direct_key` (basePairKey).
 * legacy `summary`/contextMeta.trade 잔재로 commerce 오판 금지 (trade_pc:/store_order: 키는 제외).
 */
export function isGeneralFriendDirectRoom(room: CommunityMessengerRoomSummary): boolean {
  if (room.roomType !== "direct") return false;
  if (!room.peerUserId?.trim()) return false;
  return isMessengerGeneralFriendDirectKey(room.messengerDirectKey);
}

/**
 * PeerNotice·friendship sync·presentation — `messengerDirectKey` 누락 시 viewer+peer pair fallback.
 * commerce direct_key(`trade_pc:`/`store_order:` 등) 만 제외 — `isGeneralFriendDirectRoom` 의미는 유지.
 */
export function generalFriendDirectRoomGate(
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta" | "messengerDirectKey" | "peerUserId">,
  viewerUserId?: string | null
): boolean {
  if (isGeneralFriendDirectRoom(room as CommunityMessengerRoomSummary)) return true;
  if (room.roomType !== "direct") return false;
  const peer = room.peerUserId?.trim() ?? "";
  if (!peer) return false;
  if (isMessengerCommerceDirectKey(room.messengerDirectKey)) return false;
  if (communityMessengerRoomIsConfirmedDelivery(room as CommunityMessengerRoomSummary)) return false;
  const viewer = viewerUserId?.trim() ?? "";
  if (!viewer) return false;
  return isMessengerGeneralFriendDirectKey(messengerDirectKeyForUserPair(viewer, peer));
}

/** basePairKey general DM — legacy `contextMeta.kind=trade` 거래 UI·dock 억제 */
export function messengerRoomShowsConfirmedTradePresentation(
  room: CommunityMessengerRoomSummary,
  viewerUserId?: string | null
): boolean {
  if (generalFriendDirectRoomGate(room, viewerUserId)) return false;
  return communityMessengerRoomIsConfirmedTrade(room);
}

/** basePairKey general DM — 배달 dock 억제 */
export function messengerRoomShowsConfirmedDeliveryPresentation(
  room: CommunityMessengerRoomSummary,
  viewerUserId?: string | null
): boolean {
  if (generalFriendDirectRoomGate(room, viewerUserId)) return false;
  return communityMessengerRoomIsConfirmedDelivery(room);
}

/** peer 기준 general friend direct room 1개 — lastMessageAt 최신 우선. */
export function pickGeneralDirectRoomForPeer(
  chats: readonly CommunityMessengerRoomSummary[],
  peerId: string
): CommunityMessengerRoomSummary | null {
  const peer = peerId.trim();
  if (!peer) return null;
  let best: CommunityMessengerRoomSummary | null = null;
  for (const room of chats) {
    if (!isGeneralFriendDirectRoom(room) || room.peerUserId !== peer) continue;
    if (!best || new Date(room.lastMessageAt).getTime() >= new Date(best.lastMessageAt).getTime()) {
      best = room;
    }
  }
  return best;
}

/** 친구 탭 peer→room 맵 — trade/delivery room 미포함. */
export function buildGeneralDirectRoomByPeerMap(
  chats: readonly CommunityMessengerRoomSummary[]
): Map<string, CommunityMessengerRoomSummary> {
  const map = new Map<string, CommunityMessengerRoomSummary>();
  for (const room of chats) {
    if (!isGeneralFriendDirectRoom(room)) continue;
    const peer = room.peerUserId!.trim();
    const prev = map.get(peer);
    if (!prev || new Date(room.lastMessageAt).getTime() >= new Date(prev.lastMessageAt).getTime()) {
      map.set(peer, room);
    }
  }
  return map;
}

/** 점세개(dot) 메뉴 통화 노출 축 — roomType direct 폴백 금지. */
export type MessengerDotMenuCallKind = "general" | "trade" | "delivery";

export type MessengerRoomFeatureGate = {
  allowVoiceMessage: boolean;
  allowVoiceCall: boolean;
  allowVideoCall: boolean;
};

export function resolveMessengerDotMenuCallKind(
  room: CommunityMessengerRoomSummary,
  opts?: { isDeliveryRoom?: boolean }
): MessengerDotMenuCallKind {
  if (opts?.isDeliveryRoom || communityMessengerRoomIsConfirmedDelivery(room)) return "delivery";
  if (communityMessengerRoomIsConfirmedTrade(room)) return "trade";
  return "general";
}

export function resolveMessengerRoomFeatureGate(input: {
  callKind: MessengerDotMenuCallKind;
  tradeAllowCall?: boolean;
  tradeVideoCallEnabled?: boolean;
  deliveryAllowVoiceMessage?: boolean;
  deliveryAllowVoiceCall?: boolean;
  deliveryAllowVideoCall?: boolean;
}): MessengerRoomFeatureGate {
  if (input.callKind === "delivery") {
    return {
      allowVoiceMessage: input.deliveryAllowVoiceMessage ?? true,
      allowVoiceCall: input.deliveryAllowVoiceCall ?? true,
      allowVideoCall: input.deliveryAllowVideoCall ?? true,
    };
  }
  if (input.callKind === "general") {
    return { allowVoiceMessage: true, allowVoiceCall: true, allowVideoCall: true };
  }
  const allow = Boolean(input.tradeAllowCall);
  return {
    allowVoiceMessage: allow,
    allowVoiceCall: allow,
    allowVideoCall: allow && Boolean(input.tradeVideoCallEnabled),
  };
}

/** dot menu 음성/영상 행 노출 — 공통 feature gate 의 통화 축만 사용. */
export function resolveMessengerDotMenuCallVisibility(input: {
  callKind: MessengerDotMenuCallKind;
  tradeAllowCall?: boolean;
  tradeVideoCallEnabled?: boolean;
  deliveryAllowVoiceCall?: boolean;
  deliveryAllowVideoCall?: boolean;
}): { showVoice: boolean; showVideo: boolean } {
  const gate = resolveMessengerRoomFeatureGate(input);
  return { showVoice: gate.allowVoiceCall, showVideo: gate.allowVideoCall };
}
