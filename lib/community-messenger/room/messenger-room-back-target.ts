/**
 * P5 (Owner 구현 승인 2026-11-18) — 메신저 방 「뒤로 목적지」 단일 정의.
 * 설계: docs/audit/messenger-chat-audit-2026-11-18/appendix-P5-back-navigation-first-tap-design.md §B1·§B3
 *
 * 머리글 ‹ · 웹 가장자리 스와이프 · 「방 없음」 버튼 · Android ◁(페이지 뒤로 주인) 가 모두 이 함수 하나를 쓴다(Up = Back).
 * 규칙(순서 고정):
 * 1. 앱 안에서 열린 방(`in_app`) → 직전 화면으로 `router.back()` 1회. 폴백·타이머 없음(오픈 그룹·분할 포함).
 * 2. 알림·첫 기록으로 열린 방(`push`·`first_entry`) → 방 종류 목록으로 `router.replace` 1회.
 *    `cm_return` → 오픈 그룹 = 모임 허브 → `cm_list` → 방 종류(거래 = 거래 채팅, 주문 = 주문 채팅, 그 외 = 대화 목록).
 *
 * 매장 사장님(주문 방 `myRole === "owner"` — `messengerDeliveryViewerRole` 기존 계약)이 알림으로 들어온 주문 방은
 * 「사장님 주문 채팅 목록」(`OwnerRoutes.orderChats(storeId)` = `/stores/owner/order-chats`)으로 간다
 * (Owner 2026-11-18 「권장안대로 반영」 — 레거시 Telegram: 알림으로 연 대화의 뒤로 = 그 대화가 들어 있는 목록).
 * `storeId` 가 메타에 없으면 서버가 대표 매장으로 해석한다(`lib/business/owner-routes.ts`).
 */
import {
  buildMessengerRoomListBackHref,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY,
  MESSENGER_ROOM_RETURN_QUERY_KEY,
  messengerRoomListDestination,
  parseMessengerEntryOrigin,
  sanitizeMessengerRoomReturnHref,
} from "@/lib/community-messenger/messenger-entry-origin";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import {
  resolveCommunityMessengerDeliveryContextMeta,
  type CommunityMessengerRoomDeliveryDetectSource,
} from "@/lib/community-messenger/room-context-meta";
import {
  resolveMessengerRoomEntryOrigin,
  type MessengerRoomEntryOrigin,
} from "@/lib/community-messenger/room/messenger-room-entry-origin-store";
import { clearPushNavigationMarkBeforeListReplace } from "@/lib/push/push-navigation-back";

/** 방 종류 목록 — `communityMessengerRoomInboxGroupKind`(목록 분류 SSOT) 값 그대로. 스냅샷 전이면 null. */
export type MessengerRoomListKind = "trade" | "delivery" | "general";

export type MessengerRoomBackTarget =
  /** 앱 안 직전 화면이 있음 → `router.back()` 1회(폴백 없음) */
  | { kind: "history_back" }
  /** 직전 화면 없음·알림 진입 → 방 종류 목록으로 `router.replace` 1회 */
  | { kind: "replace"; href: string };

type SearchParamsLike = { get: (key: string) => string | null };

/**
 * 주문 방을 매장 사장님이 볼 때의 목록 주소(사장님 주문 채팅 목록). 그 밖(구매자·주문 방 아님)은 null.
 * 스냅샷의 방 메타·`myRole` 만 쓴다(새 API 없음).
 */
export function resolveOwnerOrderChatsBackHref(
  room: CommunityMessengerRoomDeliveryDetectSource | null | undefined,
  myRole: string | null | undefined
): string | null {
  if (!room) return null;
  const meta = resolveCommunityMessengerDeliveryContextMeta(room);
  if (messengerDeliveryViewerRole(meta, myRole) !== "seller") return null;
  const storeId = typeof meta?.storeId === "string" ? meta.storeId.trim() : "";
  return OwnerRoutes.orderChats(storeId || null);
}

/** 알림·첫 기록 진입 방의 목록 주소(규칙 2). */
export function resolveMessengerRoomListHref(args: {
  roomType: string | null | undefined;
  listKind: MessengerRoomListKind | null | undefined;
  searchParams: SearchParamsLike;
  /** 주문 방 + 사장님일 때만(`resolveOwnerOrderChatsBackHref`) */
  ownerOrderChatsHref?: string | null;
}): string {
  const explicitReturn = sanitizeMessengerRoomReturnHref(args.searchParams.get(MESSENGER_ROOM_RETURN_QUERY_KEY));
  if (explicitReturn) return explicitReturn;
  if (args.ownerOrderChatsHref) return args.ownerOrderChatsHref;
  if (args.roomType === "open_group") return SAMARKET_ROUTES.chat.messengerMeetingsHub;
  if (args.searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY)?.trim()) {
    return buildMessengerRoomListBackHref(args.searchParams);
  }
  const origin = parseMessengerEntryOrigin(args.searchParams.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY));
  if (args.listKind === "trade") return messengerRoomListDestination("trade", origin);
  if (args.listKind === "delivery") return messengerRoomListDestination("delivery", origin ?? "delivery");
  return messengerRoomListDestination("inbox", origin);
}

export function resolveMessengerRoomBackTarget(args: {
  roomType: string | null | undefined;
  listKind: MessengerRoomListKind | null | undefined;
  searchParams: SearchParamsLike;
  ownerOrderChatsHref?: string | null;
  entry: MessengerRoomEntryOrigin;
}): MessengerRoomBackTarget {
  if (args.entry === "in_app") return { kind: "history_back" };
  return { kind: "replace", href: resolveMessengerRoomListHref(args) };
}

/**
 * 목적지 실행 — 이동 1회(back 또는 replace 중 하나).
 * replace(목록) 직전에 바로 앞 「알림으로 떠난 항목」 표시를 정리한다(N1 — 목록의 ◁ 가 이전 방·같은 목록으로 가지 않게).
 */
export function runMessengerRoomBackTarget(
  router: { back: () => void; replace: (href: string, options?: { scroll?: boolean }) => void },
  target: MessengerRoomBackTarget
): void {
  if (target.kind === "history_back") {
    router.back();
    return;
  }
  clearPushNavigationMarkBeforeListReplace();
  router.replace(target.href, { scroll: false });
}

/** 지금 기록 항목의 진입 출처로 목적지를 정한다(누른 순간 판정). */
export function resolveMessengerRoomBackTargetNow(args: {
  roomType: string | null | undefined;
  listKind: MessengerRoomListKind | null | undefined;
  searchParams: SearchParamsLike;
  ownerOrderChatsHref?: string | null;
}): MessengerRoomBackTarget {
  return resolveMessengerRoomBackTarget({ ...args, entry: resolveMessengerRoomEntryOrigin() });
}
