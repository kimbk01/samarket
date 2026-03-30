/**
 * 매장 오너 주문 관리 화면 — URL `tab` 필터와 목록 필터를 한곳에서 맞춥니다.
 */

export type StoreOrderTabId =
  | "all"
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "shipping"
  | "progress"
  | "done"
  | "cancelled"
  | "refund";

const KNOWN = new Set<string>([
  "all",
  "new",
  "accepted",
  "preparing",
  "ready",
  "shipping",
  "progress",
  "done",
  "cancelled",
  "refund",
]);

export function parseStoreOrderTab(raw: string | null | undefined): StoreOrderTabId {
  const t = (raw ?? "").trim();
  if (t && KNOWN.has(t)) return t as StoreOrderTabId;
  return "all";
}

export function orderMatchesStoreTab(
  order: { order_status: string },
  tab: StoreOrderTabId
): boolean {
  if (tab === "all") return true;
  const s = order.order_status;
  switch (tab) {
    case "new":
      return s === "pending";
    case "accepted":
      return s === "accepted";
    case "preparing":
      return s === "preparing";
    case "ready":
      return s === "ready_for_pickup";
    case "shipping":
      return s === "delivering" || s === "arrived";
    case "progress":
      return (
        s === "accepted" ||
        s === "preparing" ||
        s === "ready_for_pickup" ||
        s === "delivering" ||
        s === "arrived"
      );
    case "done":
      return s === "completed";
    case "cancelled":
      return s === "cancelled" || s === "refunded";
    case "refund":
      return s === "refund_requested";
    default:
      return true;
  }
}

/** 주문 관리 URL (대시보드·사이드바·알림 배지 등에서 공통 사용) */
export function buildStoreOrdersHref(params: {
  storeId: string;
  tab?: StoreOrderTabId;
  orderId?: string;
  ackOwnerNotifications?: boolean;
}): string {
  const p = new URLSearchParams();
  p.set("storeId", params.storeId.trim());
  if (params.tab && params.tab !== "all") p.set("tab", params.tab);
  if (params.orderId?.trim()) p.set("order_id", params.orderId.trim());
  if (params.ackOwnerNotifications) p.set("ack_owner_notifications", "1");
  return `/my/business/store-orders?${p.toString()}`;
}

export const STORE_ORDER_TAB_CHIPS: Array<{ id: StoreOrderTabId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "new", label: "신규" },
  { id: "accepted", label: "접수완료" },
  { id: "preparing", label: "조리·준비" },
  { id: "ready", label: "픽업준비" },
  { id: "shipping", label: "배달중" },
  { id: "done", label: "완료" },
  { id: "refund", label: "환불요청" },
  { id: "cancelled", label: "취소·환불" },
];
