import type { MemberOrderTab } from "@/lib/member-orders/types";

/** 내 주문 탭 분류 — 화면 필터와 서버 탭 개수가 같은 규칙을 쓴다 */
export function memberOrderStatusInTab(status: string, tab: MemberOrderTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "active":
      return ["pending", "accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(status);
    case "done":
      return status === "completed";
    case "issue":
      return ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(status);
    default:
      return true;
  }
}

export const MEMBER_ORDER_TABS: MemberOrderTab[] = ["all", "active", "done", "issue"];

export function countMemberOrderTabs(statuses: string[]): Record<MemberOrderTab, number> {
  const out: Record<MemberOrderTab, number> = { all: 0, active: 0, done: 0, issue: 0 };
  for (const s of statuses) {
    for (const tab of MEMBER_ORDER_TABS) if (memberOrderStatusInTab(s, tab)) out[tab] += 1;
  }
  return out;
}
