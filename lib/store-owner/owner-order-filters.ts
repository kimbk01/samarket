import type { OwnerOrder, OwnerOrderTab } from "./types";

export function filterOwnerOrdersByTab(ordersList: OwnerOrder[], tab: OwnerOrderTab): OwnerOrder[] {
  return ordersList.filter((o) => {
    const s = o.order_status;
    switch (tab) {
      case "all":
        return true;
      case "new":
        return s === "pending";
      case "active":
        return ["pending", "accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(s);
      case "done":
        return s === "completed";
      case "issue":
        return ["cancelled", "refund_requested", "refunded", "cancel_requested"].includes(s);
      default:
        return true;
    }
  });
}
