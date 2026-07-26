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

export function filterOrdersByHubFilter<T extends { order_status: string }>(
  rows: T[],
  filter: StoreOrdersHubFilter
): T[] {
  if (filter === "all") return rows;
  return rows.filter((o) => {
    const s = String(o.order_status ?? "");
    switch (filter) {
      case "receiving":
        return s === "pending" || s === "accepted";
      case "preparing":
        return s === "preparing";
      case "delivering":
        return s === "delivering" || s === "ready_for_pickup" || s === "arrived";
      case "done":
        return s === "completed";
      case "issue":
        return ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(s);
      default:
        return true;
    }
  });
}
