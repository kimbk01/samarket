import type { SharedOrder } from "@/lib/shared-orders/types";

/**
 * 레거시 인메모리 주문 채팅 알림 — 상용은 `/api/me/notifications` 원장만 사용합니다.
 * `shared-chat-store`가 호출하는 훅 시그니처는 유지합니다.
 */
export function notifyChatMessageFromMember(_order: SharedOrder, _preview: string): void {}

export function notifyChatMessageFromOwner(_order: SharedOrder, _preview: string): void {}

export function notifyAdminChatMessages(_order: SharedOrder, _preview: string): void {}

export function notifyOrderSystemChatLine(_order: SharedOrder, _line: string): void {}

export function notifyChatRoomBlocked(_order: SharedOrder, _blocked: boolean): void {}

export function notifyAdminInterventionRoom(_order: SharedOrder): void {}
