/**
 * 관리자 배달 주문 UI용 facade — 실제 원본은 @/lib/shared-orders/shared-order-store
 */
import {
  adminLogsForOrder,
  sharedOrderToAdminDelivery,
  sharedLogToAdminTimeline,
} from "@/lib/shared-orders/shared-order-adapters";
import {
  findSharedOrder,
  getSharedOrdersVersion,
  listSharedOrdersRaw,
  notifySharedOrdersChanged,
  resetSharedOrders,
  sharedAdminApproveCancel,
  sharedAdminApproveRefund,
  sharedAdminHoldSettlement,
  sharedAdminMarkSettlementPaid,
  sharedAdminRejectCancel,
  sharedAdminRejectRefund,
  sharedAdminReleaseSettlement,
  sharedAdminSetMemo,
  sharedAdminSetOrderStatus,
  subscribeSharedOrders,
  validateSharedOrderTransition,
} from "@/lib/shared-orders/shared-order-store";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type {
  AdminDeliveryOrder,
  AdminActionStatus,
  OrderListFilters,
  OrderReport,
  OrderStatus,
  OrderStatusLog,
  PaymentStatus,
  SettlementStatus,
} from "./types";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

let reports: OrderReport[] = [];

export const subscribeDeliveryMock = subscribeSharedOrders;
export const getDeliveryMockVersion = getSharedOrdersVersion;

function bumpReports() {
  notifySharedOrdersChanged();
}

function toAdminList(): AdminDeliveryOrder[] {
  return listSharedOrdersRaw().map(sharedOrderToAdminDelivery);
}

function findOrder(id: string): AdminDeliveryOrder | undefined {
  const o = findSharedOrder(id);
  return o ? sharedOrderToAdminDelivery(o) : undefined;
}

export function getDeliveryOrders(): AdminDeliveryOrder[] {
  return clone(toAdminList());
}

export function getDeliveryOrder(id: string): AdminDeliveryOrder | undefined {
  const o = findOrder(id);
  return o ? clone(o) : undefined;
}

export function getDeliveryLogs(): OrderStatusLog[] {
  return listSharedOrdersRaw()
    .flatMap((o) => o.logs.map(sharedLogToAdminTimeline))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getDeliveryLogsForOrder(orderId: string): OrderStatusLog[] {
  const o = findSharedOrder(orderId);
  if (!o) return [];
  return adminLogsForOrder(o);
}

export function getDeliveryReports(): OrderReport[] {
  return clone(reports);
}

function matchesFilters(o: AdminDeliveryOrder, f: OrderListFilters): boolean {
  if (f.orderNoQuery.trim() && !o.orderNo.toLowerCase().includes(f.orderNoQuery.trim().toLowerCase()))
    return false;
  const buyerQ = f.buyerQuery.trim().toLowerCase();
  if (buyerQ) {
    const buyerHay = [o.buyerName, o.buyerPhone, o.buyerUserId].join(" ").toLowerCase();
    if (!buyerHay.includes(buyerQ)) return false;
  }
  const storeQ = f.storeQuery.trim().toLowerCase();
  if (storeQ) {
    const storeHay = [
      o.storeName,
      o.storeSlug,
      o.storeId,
      o.storeOwnerName,
      o.storeOwnerUserId,
    ]
      .join(" ")
      .toLowerCase();
    if (!storeHay.includes(storeQ)) return false;
  }
  if (f.pipelineBucket === "in_progress") {
    const ing: OrderStatus[] = ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived"];
    if (!ing.includes(o.orderStatus)) return false;
  } else if (f.pipelineBucket === "issues") {
    const iss: OrderStatus[] = ["cancel_requested", "cancelled", "refund_requested", "refunded"];
    if (!iss.includes(o.orderStatus)) return false;
  }
  if (f.orderStatus && o.orderStatus !== f.orderStatus) return false;
  if (f.paymentStatus && o.paymentStatus !== f.paymentStatus) return false;
  if (f.settlementStatus && o.settlementStatus !== f.settlementStatus) return false;
  if (f.orderType && o.orderType !== f.orderType) return false;
  if (f.reportsOnly && !o.hasReport) return false;
  if (f.heldSettlementOnly && o.settlementStatus !== "held") return false;
  if (f.dateFrom) {
    const t = new Date(o.createdAt).getTime();
    if (t < new Date(f.dateFrom).getTime()) return false;
  }
  if (f.dateTo) {
    const t = new Date(o.createdAt).getTime();
    const end = new Date(f.dateTo);
    end.setHours(23, 59, 59, 999);
    if (t > end.getTime()) return false;
  }
  return true;
}

/** 배달 주문 운영 화면: DB 병합 행에도 동일 필터 적용 */
export function adminDeliveryOrderMatchesFilters(o: AdminDeliveryOrder, f: OrderListFilters): boolean {
  return matchesFilters(o, f);
}

export function listFilteredDeliveryOrders(f: OrderListFilters): AdminDeliveryOrder[] {
  return toAdminList()
    .filter((o) => matchesFilters(o, f))
    .map(clone);
}

export function validateOrderTransition(
  o: AdminDeliveryOrder,
  next: OrderStatus,
  force: boolean
): string | null {
  const raw = findSharedOrder(o.id);
  if (!raw) return "주문 없음";
  return validateSharedOrderTransition(raw, next as SharedOrderStatus, force);
}

export function setOrderStatus(
  orderId: string,
  nextOrder: OrderStatus,
  opts: {
    actorId: string;
    actorType: OrderStatusLog["actorType"];
    reason?: string;
    force?: boolean;
    paymentStatus?: PaymentStatus;
    settlementStatus?: SettlementStatus;
    adminActionStatus?: AdminActionStatus;
  }
): { ok: true } | { ok: false; error: string } {
  return sharedAdminSetOrderStatus(orderId, nextOrder as SharedOrderStatus, {
    force: !!opts.force,
    reason: opts.reason,
    paymentStatus: opts.paymentStatus,
    settlementStatus: opts.settlementStatus,
    adminAction: opts.adminActionStatus,
  });
}

export function setAdminMemo(orderId: string, memo: string) {
  return sharedAdminSetMemo(orderId, memo);
}

export function approveCancelRequest(orderId: string, memo: string) {
  return sharedAdminApproveCancel(orderId, memo);
}

export function rejectCancelRequest(orderId: string, memo: string) {
  return sharedAdminRejectCancel(orderId, memo);
}

export function approveRefund(orderId: string, memo: string) {
  return sharedAdminApproveRefund(orderId, memo);
}

export function rejectRefund(orderId: string, memo: string) {
  return sharedAdminRejectRefund(orderId, memo);
}

export function holdSettlement(orderId: string, reason: string) {
  return sharedAdminHoldSettlement(orderId, reason);
}

export function releaseSettlementHold(orderId: string, memo: string) {
  return sharedAdminReleaseSettlement(orderId, memo);
}

export function markSettlementPaid(orderId: string, memo: string) {
  return sharedAdminMarkSettlementPaid(orderId, memo);
}

export function appendAuditLog(_entry: Omit<OrderStatusLog, "id" | "createdAt"> & { id?: string }) {
  /* 공유 스토어로 이전됨 — 외부에서 직접 호출 시 로그는 shared-order-store 액션 사용 */
}

export function updateReportStatus(
  reportId: string,
  patch: Partial<Pick<OrderReport, "status" | "adminResult">>
) {
  const idx = reports.findIndex((r) => r.id === reportId);
  if (idx < 0) return false;
  reports[idx] = { ...reports[idx]!, ...patch };
  bumpReports();
  return true;
}

export function listCancelPendingOrders(): AdminDeliveryOrder[] {
  return toAdminList()
    .filter((o) => o.orderStatus === "cancel_requested" && o.cancelRequest?.status === "pending")
    .map(clone);
}

export function listRefundPendingOrders(): AdminDeliveryOrder[] {
  return toAdminList()
    .filter((o) => o.orderStatus === "refund_requested" && o.refundRequest?.status === "pending")
    .map(clone);
}

export function listDeliveryOrdersByStore(storeId: string): AdminDeliveryOrder[] {
  return toAdminList()
    .filter((o) => o.storeId === storeId)
    .map(clone);
}

export function listDeliveryOrdersByBuyer(buyerUserId: string): AdminDeliveryOrder[] {
  return toAdminList()
    .filter((o) => o.buyerUserId === buyerUserId)
    .map(clone);
}

export function resetDeliveryMock() {
  resetSharedOrders();
  reports = [];
  notifySharedOrdersChanged();
}
