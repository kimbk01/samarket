import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import {
  commerceMetaKindLabel,
  notificationTypeLabel,
} from "@/lib/notifications/notification-display-labels";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { buildOwnerStoreOrderNotificationHref } from "@/lib/business/owner-store-order-notification-href";
import { OWNER_STORE_OPS_NOTICE_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";

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

export type OwnerNotifTab = "all" | "new_orders" | "cancel" | "refund" | "store_ops";

function metaKind(r: OwnerNotificationRow): string {
  return String((r.meta as { kind?: string } | undefined)?.kind ?? "");
}

/**
 * 매장 알림함 탭 (재감사 2026-11-02 O5) — 사장님이 받는 종류만(구매자 종류 없음).
 * 종류 목록 = owner-store-commerce-notification-meta (DB owner_store_commerce_notification_kinds 짝).
 * 신규 주문 = 접수·결제 완료·접수 리마인더(알림음 항목표의 「신규 주문」과 같은 묶음).
 */
export const OWNER_NOTIF_GROUPS: {
  id: Exclude<OwnerNotifTab, "all">;
  labelKey: MessageKey;
  match: (r: OwnerNotificationRow) => boolean;
}[] = [
  {
    id: "new_orders",
    labelKey: "store_owner_notif_group_new_orders",
    match: (r) =>
      [
        "store_order_created",
        "store_order_payment_completed",
        "store_order_accept_reminder_30s",
        "store_order_accept_reminder_60s",
      ].includes(metaKind(r)),
  },
  {
    id: "cancel",
    labelKey: "store_owner_notif_group_cancel",
    match: (r) => ["store_order_buyer_cancelled", "store_order_accept_timeout_cancelled"].includes(metaKind(r)),
  },
  {
    id: "refund",
    labelKey: "store_owner_notif_group_refund",
    match: (r) => metaKind(r) === "store_order_refund_requested",
  },
  {
    id: "store_ops",
    labelKey: "store_owner_notif_group_store_ops",
    match: (r) => {
      const k = metaKind(r);
      return k === "store_order_sold_out" || k.startsWith("store_point_") || OWNER_STORE_OPS_NOTICE_META_KINDS.has(k);
    },
  },
];

export const OWNER_NOTIF_TABS: readonly OwnerNotifTab[] = ["all", ...OWNER_NOTIF_GROUPS.map((g) => g.id)];

/** URL `?tab=` → 탭 (알 수 없는 값 = 전체). 예전 `cancel_payment` 링크 = 취소. */
export function parseOwnerNotifTab(raw: string | null | undefined): OwnerNotifTab {
  const v = String(raw ?? "").trim();
  if (v === "cancel_payment") return "cancel";
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

/**
 * 목적지 = 저장된 목적지(`link_url`) — 매장 종·푸시와 같은 값 (재감사 2026-11-02 O3).
 * 저장 목적지가 없는 옛 행만 주문 id → 주문 상세, 그것도 없으면 주문 관리.
 */
export function resolveOwnerNotificationHref(r: OwnerNotificationRow, storeId: string): string {
  const stored = r.link_url?.trim() ?? "";
  if (stored.startsWith("/")) return stored;
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
  return buildStoreOrdersHref({ storeId });
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
