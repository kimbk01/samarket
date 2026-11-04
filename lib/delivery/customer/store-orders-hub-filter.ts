import { orderStagePosition } from "@/lib/stores/store-order-process-model";
/**
 * 매장 탭 주문 대시보드 → `/orders` 허브 연동용 필터.
 * URL: `?orderFilter=receiving|preparing|delivering|done|issue|all`
 */
export type StoreOrdersHubFilter =
  | "all"
  | "receiving"
  | "preparing"
  | "delivering"
  | "done"
  | "issue";

export function parseStoreOrdersHubFilter(raw: string | null | undefined): StoreOrdersHubFilter {
  const x = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    x === "receiving" ||
    x === "preparing" ||
    x === "delivering" ||
    x === "done" ||
    x === "issue" ||
    x === "all"
  ) {
    return x;
  }
  return "all";
}

export function ordersHubHref(filter: StoreOrdersHubFilter): string {
  if (filter === "all") return "/orders";
  return `/orders?orderFilter=${encodeURIComponent(filter)}`;
}

/** 손님 주문 묶음 — 4단계 정본 위치 (접수 대기·주문접수 / 조리중 / 배달중·픽업대기 / 완료 / 취소·환불) */
export function filterOrdersByHubFilter<T extends { order_status: string; fulfillment_type?: string | null }>(
  rows: T[],
  filter: StoreOrdersHubFilter
): T[] {
  if (filter === "all") return rows;
  return rows.filter((o) => {
    const s = String(o.order_status ?? "");
    const pos = orderStagePosition(s, String(o.fulfillment_type ?? "local_delivery"));
    switch (filter) {
      case "receiving":
        return pos === 0 || pos === 1;
      case "preparing":
        return pos === 2;
      case "delivering":
        return pos === 3;
      case "done":
        return pos === 4;
      case "issue":
        return pos === -1;
      default:
        return true;
    }
  });
}
