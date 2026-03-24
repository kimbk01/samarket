"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  getDeliveryLogsForOrder,
  getDeliveryOrder,
  getDeliveryReports,
  setAdminMemo,
} from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import {
  AdminActionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  SettlementStatusBadge,
} from "./DeliveryOrderBadges";
import { AdminMemoBox } from "./AdminMemoBox";
import { AdminOrderTimeline } from "./AdminOrderTimeline";
import { OrderActionPanel } from "./OrderActionPanel";
import { OrderAmountCard } from "./OrderAmountCard";
import { OrderDetailCard } from "./OrderDetailCard";
import { OrderItemsTable } from "./OrderItemsTable";
import { formatMoneyPhp } from "@/lib/utils/format";

export function DeliveryOrderDetailClient({ orderId }: { orderId: string }) {
  const v = useDeliveryMockVersion();
  const order = useMemo(() => {
    void v;
    return getDeliveryOrder(orderId);
  }, [orderId, v]);

  const logs = useMemo(() => {
    void v;
    return order ? getDeliveryLogsForOrder(order.id) : [];
  }, [order, v]);

  const orderReports = useMemo(() => {
    void v;
    if (!order) return [];
    return getDeliveryReports().filter((r) => r.orderId === order.id);
  }, [order, v]);

  if (!order) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 상세" backHref="/admin/delivery-orders" />
        <p className="text-sm text-gray-600">주문을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const cancelState =
    order.cancelRequest?.status === "pending"
      ? "취소 요청 대기"
      : order.cancelRequest?.status === "approved"
        ? "취소 승인됨"
        : order.cancelRequest?.status === "rejected"
          ? "취소 요청 거절"
          : order.orderStatus === "cancelled"
            ? "취소 완료"
            : "—";

  const refundState =
    order.refundRequest?.status === "pending"
      ? "환불 요청 대기"
      : order.refundRequest?.status === "approved"
        ? "환불 승인됨"
        : order.refundRequest?.status === "rejected"
          ? "환불 거절"
          : order.orderStatus === "refunded"
            ? "환불 완료"
            : "—";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader title={`주문 ${order.orderNo}`} backHref="/admin/delivery-orders" />

      <div className="flex flex-wrap gap-2 text-sm">
        <PaymentStatusBadge status={order.paymentStatus} />
        <OrderStatusBadge status={order.orderStatus} />
        <SettlementStatusBadge status={order.settlementStatus} />
        <AdminActionStatusBadge status={order.adminActionStatus} />
      </div>

      <p className="text-sm">
        <Link
          href={`/admin/delivery-orders/${encodeURIComponent(order.id)}/chat`}
          className="font-semibold text-signature underline"
        >
          채팅 열람
        </Link>
        <span className="text-gray-500"> · 주문방 대화·시스템 메시지 (시뮬)</span>
      </p>

      <AdminCard title="기본 정보">
        <OrderDetailCard order={order} />
      </AdminCard>

      <AdminCard title="주문 항목">
        <OrderItemsTable items={order.items} />
      </AdminCard>

      <AdminCard title="금액">
        <OrderAmountCard order={order} />
      </AdminCard>

      <AdminCard title="상태 정보">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">결제상태</dt>
            <dd>
              <PaymentStatusBadge status={order.paymentStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">주문상태</dt>
            <dd>
              <OrderStatusBadge status={order.orderStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">취소 상태</dt>
            <dd>{cancelState}</dd>
          </div>
          <div>
            <dt className="text-gray-500">환불 상태</dt>
            <dd>{refundState}</dd>
          </div>
          <div>
            <dt className="text-gray-500">정산상태</dt>
            <dd>
              <SettlementStatusBadge status={order.settlementStatus} />
            </dd>
          </div>
        </dl>
      </AdminCard>

      {(order.cancelRequest || order.refundRequest) && (
        <AdminCard title="취소·환불 요청">
          {order.cancelRequest ? (
            <div className="mb-3 rounded border border-gray-100 p-2 text-sm">
              <p className="font-semibold">취소 요청 ({order.cancelRequest.status})</p>
              <p className="text-xs text-gray-500">{order.cancelRequest.requestedAt}</p>
              <p className="mt-1">{order.cancelRequest.reason}</p>
            </div>
          ) : null}
          {order.refundRequest ? (
            <div className="rounded border border-gray-100 p-2 text-sm">
              <p className="font-semibold">
                환불 요청 ({order.refundRequest.status}) · {order.refundRequest.requestedBy}
              </p>
              <p className="text-xs text-gray-500">{order.refundRequest.requestedAt}</p>
              <p className="mt-1">{order.refundRequest.reason}</p>
            </div>
          ) : null}
        </AdminCard>
      )}

      {(order.cancelReason || order.refundReason) && (
        <AdminCard title="취소·환불 사유(확정)">
          {order.cancelReason ? <p className="text-sm">취소: {order.cancelReason}</p> : null}
          {order.refundReason ? <p className="text-sm">환불: {order.refundReason}</p> : null}
        </AdminCard>
      )}

      {order.settlement && (
        <AdminCard title="정산">
          <dl className="text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">총매출</dt>
              <dd>{formatMoneyPhp(order.settlement.grossAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">수수료</dt>
              <dd>{formatMoneyPhp(order.settlement.feeAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>정산예정액</dt>
              <dd>{formatMoneyPhp(order.settlement.settlementAmount)}</dd>
            </div>
            {order.settlement.scheduledDate ? (
              <p className="mt-1 text-xs text-gray-500">예정일: {order.settlement.scheduledDate}</p>
            ) : null}
            {order.settlement.holdReason ? (
              <p className="mt-2 rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
                보류: {order.settlement.holdReason}
              </p>
            ) : null}
          </dl>
        </AdminCard>
      )}

      {(order.hasReport || orderReports.length > 0 || order.disputeMemo) && (
        <AdminCard title="신고·분쟁">
          {order.hasReport ? (
            <p className="text-sm text-amber-900">이 주문에 신고·분쟁 플래그가 있습니다.</p>
          ) : null}
          {order.disputeMemo ? (
            <p className="mt-2 text-sm">
              <span className="text-gray-500">분쟁 메모: </span>
              {order.disputeMemo}
            </p>
          ) : null}
          {orderReports.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm">
              {orderReports.map((r) => (
                <li key={r.id} className="rounded border border-gray-100 p-2">
                  <span className="font-mono text-xs">{r.id}</span> · {r.reportType} · {r.status}
                  <p className="text-xs text-gray-600">{r.content}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs">
            <Link href="/admin/delivery-orders/reports" className="text-signature underline">
              신고·분쟁 콘솔로 이동
            </Link>
          </p>
        </AdminCard>
      )}

      <OrderActionPanel
        orderId={order.id}
        orderType={order.orderType}
        orderStatus={order.orderStatus}
        storeId={order.storeId}
        buyerUserId={order.buyerUserId}
      />

      <AdminMemoBox
        key={order.updatedAt}
        initial={order.adminMemo}
        onSave={(memo) => setAdminMemo(order.id, memo)}
      />

      <AdminCard title="상태 변경 · 감사 로그">
        <AdminOrderTimeline logs={logs} />
      </AdminCard>

      <p className="text-center text-xs text-gray-400">
        프론트 mock · 실DB 시 order_status_logs / store_settlements 와 동기화
      </p>
      <div className="text-center text-sm">
        <Link href={`/stores/${encodeURIComponent(order.storeSlug)}`} className="text-signature underline">
          사용자 매장 상세 (시뮬)
        </Link>
      </div>
    </div>
  );
}
