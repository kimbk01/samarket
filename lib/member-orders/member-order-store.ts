/**
 * 회원 UI facade — 원본: @/lib/shared-orders/shared-order-store
 */
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import {
  findSharedOrder,
  getSharedOrdersVersion,
  listSharedOrdersRaw,
  resetSharedOrders,
  sharedMemberRequestCancel,
  sharedMemberRequestRefund,
  subscribeSharedOrders,
} from "@/lib/shared-orders/shared-order-store";
import { sharedOrderToMember } from "@/lib/shared-orders/shared-to-member";
import type { MemberOrder, MemberOrderLog, MemberOrderTab } from "./types";

/** 여러 주문의 단계 로그를 한 목록으로 볼 때 (내정보 > 주문 상태 이력) */
export type MemberOrderStatusEventRow = MemberOrderLog & {
  store_name: string;
  order_no: string;
};

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export const subscribeMemberOrders = subscribeSharedOrders;
export const getMemberOrdersVersion = getSharedOrdersVersion;

/** 세션이 member 일 때만 buyer userId 반환, 아니면 null */
export function getDemoBuyerUserId(): string | null {
  const s = getMockSession();
  return s.role === "member" ? s.userId : null;
}

export function listSimulationBuyers(): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const o of listSharedOrdersRaw()) {
    m.set(o.buyer_user_id, o.buyer_name);
  }
  return [...m.entries()].map(([id, name]) => ({ id, name }));
}

export function listMemberOrdersForBuyer(buyerUserId: string | null): MemberOrder[] {
  if (!buyerUserId) return [];
  return listSharedOrdersRaw()
    .filter((o) => o.buyer_user_id === buyerUserId)
    .map(sharedOrderToMember)
    .map(clone);
}

export function getMemberOrder(buyerUserId: string | null, orderId: string): MemberOrder | undefined {
  if (!buyerUserId) return undefined;
  const o = findSharedOrder(orderId);
  if (!o || o.buyer_user_id !== buyerUserId) return undefined;
  return clone(sharedOrderToMember(o));
}

export function filterMemberOrdersByTab(rows: MemberOrder[], tab: MemberOrderTab): MemberOrder[] {
  return rows.filter((o) => {
    const s = o.order_status;
    switch (tab) {
      case "all":
        return true;
      case "active":
        return ["pending", "accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(s);
      case "done":
        return s === "completed";
      case "issue":
        return ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(s);
      default:
        return true;
    }
  });
}

export function requestMemberOrderCancel(
  buyerUserId: string | null,
  orderId: string,
  reasonLabel: string,
  detail?: string
): { ok: true } | { ok: false; error: string } {
  if (!buyerUserId) return { ok: false, error: "회원 계정으로 전환해 주세요." };
  const o = findSharedOrder(orderId);
  if (!o || o.buyer_user_id !== buyerUserId) return { ok: false, error: "주문을 찾을 수 없어요." };
  const reason = [reasonLabel, detail?.trim()].filter(Boolean).join(" — ");
  return sharedMemberRequestCancel(orderId, buyerUserId, reason);
}

export function requestMemberOrderRefund(
  buyerUserId: string | null,
  orderId: string,
  reason: string
): { ok: true } | { ok: false; error: string } {
  if (!buyerUserId) return { ok: false, error: "회원 계정으로 전환해 주세요." };
  const o = findSharedOrder(orderId);
  if (!o || o.buyer_user_id !== buyerUserId) return { ok: false, error: "주문을 찾을 수 없어요." };
  return sharedMemberRequestRefund(orderId, buyerUserId, reason);
}

export function resetMemberOrdersMock() {
  resetSharedOrders();
}

/** 접수·조리 등 단계별 기록을 최신순으로 합친 목록 */
export function listMemberOrderStatusEventsForBuyer(
  buyerUserId: string | null
): MemberOrderStatusEventRow[] {
  if (!buyerUserId) return [];
  const orders = listMemberOrdersForBuyer(buyerUserId);
  const out: MemberOrderStatusEventRow[] = [];
  for (const o of orders) {
    for (const log of o.logs) {
      out.push({
        ...log,
        store_name: o.store_name,
        order_no: o.order_no,
      });
    }
  }
  return out.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
