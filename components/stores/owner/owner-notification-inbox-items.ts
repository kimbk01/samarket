import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import {
  commerceMetaKindLabel,
  notificationTypeLabel,
} from "@/lib/notifications/notification-display-labels";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { buildOwnerStoreOrderNotificationHref } from "@/lib/business/owner-store-order-notification-href";

/** `GET /api/me/notifications?owner_store_id=` 행 (형태 유지). */
export type OwnerNotificationRow = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

export type OwnerNotifTab = "all" | "new_orders" | "cancel_payment" | "refund";

function metaKind(r: OwnerNotificationRow): string {
  return String((r.meta as { kind?: string } | undefined)?.kind ?? "");
}

export const OWNER_NOTIF_GROUPS: {
  id: Exclude<OwnerNotifTab, "all">;
  labelKey: MessageKey;
  match: (r: OwnerNotificationRow) => boolean;
}[] = [
  {
    id: "new_orders",
    labelKey: "store_owner_notif_group_new_orders",
    match: (r) => metaKind(r) === "store_order_created",
  },
  {
    id: "cancel_payment",
    labelKey: "store_owner_notif_group_cancel_payment",
    match: (r) =>
      ["store_order_buyer_cancelled", "store_order_payment_completed", "store_order_payment_failed"].includes(
        metaKind(r)
      ),
  },
  {
    id: "refund",
    labelKey: "store_owner_notif_group_refund",
    match: (r) => ["store_order_refund_requested", "store_order_refund_approved"].includes(metaKind(r)),
  },
];

export const OWNER_NOTIF_TABS: readonly OwnerNotifTab[] = ["all", ...OWNER_NOTIF_GROUPS.map((g) => g.id)];

/** URL `?tab=` → 탭 (알 수 없는 값 = 전체). */
export function parseOwnerNotifTab(raw: string | null | undefined): OwnerNotifTab {
  const v = String(raw ?? "").trim();
  return (OWNER_NOTIF_TABS as readonly string[]).includes(v) ? (v as OwnerNotifTab) : "all";
}

export function filterOwnerNotificationRows(
  rows: OwnerNotificationRow[],
  tab: OwnerNotifTab
): OwnerNotificationRow[] {
  if (tab === "all") return rows;
  const g = OWNER_NOTIF_GROUPS.find((x) => x.id === tab);
  return g ? rows.filter((r) => g.match(r)) : rows;
}

/** 기존 「주문 보기」 목적지 그대로 (주문 id 있으면 주문 상세 + ack, 없으면 link_url → 주문 관리). */
export function resolveOwnerNotificationHref(r: OwnerNotificationRow, storeId: string): string {
  const meta = (r.meta ?? {}) as { kind?: string; order_id?: string; order_status?: string };
  const orderId = String(meta.order_id ?? "").trim();
  const orderStatus = String(meta.order_status ?? "").trim();
  if (orderId.length > 0) {
    return buildOwnerStoreOrderNotificationHref({
      storeId,
      orderId,
      kind: meta.kind,
      orderStatus: orderStatus || undefined,
      ackOwnerNotifications: true,
    });
  }
  return r.link_url?.trim() || buildStoreOrdersHref({ storeId });
}

/**
 * 오너 행 → 회원 알림센터 공용 목록(`InboxGroupCardList`) 표시 항목. 1행 = 1항목 (묶음 없음).
 *
 * 표시 전용 변환:
 * - `notification_type` 은 `owner_store_commerce` 로 둔다. 원본 `commerce` 를 넘기면 회원 분류 규칙이
 *   칩을 「주문·배달」로 고정해 오너 종류(신규 주문·취소 등) 라벨이 사라진다 → 칩 = `surfaceBadge`(종류 라벨).
 * - `meta` 는 주문번호 줄만 넘긴다(가게 이름·분류 필드가 회원 규칙에 끼어들지 않도록).
 * 이동·읽음·삭제는 호출자가 `notification_id`(= 원본 id)로 처리한다.
 */
export function ownerRowToInboxItem(
  r: OwnerNotificationRow,
  storeId: string,
  language: AppLanguageCode,
  orderNoLabel: (orderNo: string) => string
): InboxGroupItem {
  const kind = metaKind(r) || undefined;
  const kindLabel = commerceMetaKindLabel(kind, language);
  const typeLabel = notificationTypeLabel(r.notification_type, language);
  const orderNo = String((r.meta as { order_no?: string } | undefined)?.order_no ?? "").trim();
  return {
    key: r.id,
    notification_id: r.id,
    ids: [r.id],
    isThread: false,
    isOrderGroup: orderNo.length > 0,
    notification_type: "owner_store_commerce",
    title: r.title,
    displayTitle: r.title,
    body: r.body,
    href: resolveOwnerNotificationHref(r, storeId),
    created_at: r.created_at,
    unreadCount: r.is_read ? 0 : 1,
    meta: orderNo ? { order_no: orderNoLabel(orderNo) } : null,
    kindLabel: kindLabel ?? typeLabel,
    surfaceBadge: kindLabel ?? typeLabel,
    groupSortKey: r.id,
  };
}
