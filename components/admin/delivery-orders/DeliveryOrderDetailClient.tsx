"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { fetchAdminStoreOrderDetailDeduped } from "@/lib/admin/fetch-admin-store-order-detail";
import type { AdminDeliveryOrder, OrderStatusLog } from "@/lib/admin/delivery-orders-admin/types";
import {
  AdminActionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  SettlementStatusBadge,
} from "./DeliveryOrderBadges";
import { AdminOrderTimeline } from "./AdminOrderTimeline";
import { OrderAmountCard } from "./OrderAmountCard";
import { OrderDetailCard } from "./OrderDetailCard";
import { OrderItemsTable } from "./OrderItemsTable";
import { formatMoneyPhp } from "@/lib/utils/format";

export function DeliveryOrderDetailClient({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<AdminDeliveryOrder | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { order: fromDb } = await fetchAdminStoreOrderDetailDeduped(orderId);
        if (cancelled) return;
        setOrder(fromDb ?? null);
      } catch {
        if (!cancelled) setOrder(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const logs = useMemo<OrderStatusLog[]>(() => [], []);

  if (loading) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 상세" backHref="/admin/delivery-orders" />
        <p className="text-sm text-sam-muted">원장 불러오는 중…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 상세" backHref="/admin/delivery-orders" />
        <p className="text-sm text-sam-muted">주문을 찾을 수 없습니다.</p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          <Link href={`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`} className="text-signature underline">
            매장 주문(액션)에서 order_id로 검색
          </Link>
        </p>
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
      <p className="rounded-ui-rect border border-emerald-200 bg-emerald-50/60 px-3 py-2 sam-text-body-secondary text-emerald-950">
        Supabase <code className="rounded bg-white/80 px-1 sam-text-helper">store_orders</code> 원장 · 품목 스냅샷
      </p>

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
          주문 채팅
        </Link>
        <span className="text-sam-muted"> · order_chat_* 실데이터</span>
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
            <dt className="text-sam-muted">결제상태</dt>
            <dd>
              <PaymentStatusBadge status={order.paymentStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">주문상태</dt>
            <dd>
              <OrderStatusBadge status={order.orderStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">취소 상태</dt>
            <dd>{cancelState}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">환불 상태</dt>
            <dd>{refundState}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">정산상태</dt>
            <dd>
              <SettlementStatusBadge status={order.settlementStatus} />
            </dd>
          </div>
        </dl>
      </AdminCard>

      {(order.cancelRequest || order.refundRequest) && (
        <AdminCard title="취소·환불 요청">
          {order.cancelRequest ? (
            <div className="mb-3 rounded border border-sam-border-soft p-2 text-sm">
              <p className="font-semibold">취소 요청 ({order.cancelRequest.status})</p>
              <p className="text-xs text-sam-muted">{order.cancelRequest.requestedAt}</p>
              <p className="mt-1">{order.cancelRequest.reason}</p>
            </div>
          ) : null}
          {order.refundRequest ? (
            <div className="rounded border border-sam-border-soft p-2 text-sm">
              <p className="font-semibold">
                환불 요청 ({order.refundRequest.status}) · {order.refundRequest.requestedBy}
              </p>
              <p className="text-xs text-sam-muted">{order.refundRequest.requestedAt}</p>
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
              <dt className="text-sam-muted">총매출</dt>
              <dd>{formatMoneyPhp(order.settlement.grossAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sam-muted">수수료</dt>
              <dd>{formatMoneyPhp(order.settlement.feeAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>정산예정액</dt>
              <dd>{formatMoneyPhp(order.settlement.settlementAmount)}</dd>
            </div>
            {order.settlement.scheduledDate ? (
              <p className="mt-1 text-xs text-sam-muted">예정일: {order.settlement.scheduledDate}</p>
            ) : null}
            {order.settlement.holdReason ? (
              <p className="mt-2 rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
                보류: {order.settlement.holdReason}
              </p>
            ) : null}
          </dl>
        </AdminCard>
      )}

      {(order.hasReport || order.disputeMemo) && (
        <AdminCard title="신고·분쟁">
          {order.hasReport ? (
            <p className="text-sm text-amber-900">이 주문에 신고·분쟁 플래그가 있습니다.</p>
          ) : null}
          {order.disputeMemo ? (
            <p className="mt-2 text-sm">
              <span className="text-sam-muted">분쟁 메모: </span>
              {order.disputeMemo}
            </p>
          ) : null}
          <p className="mt-2 text-xs">
            <Link href="/admin/delivery-orders/reports" className="text-signature underline">
              신고·분쟁 콘솔로 이동
            </Link>
          </p>
        </AdminCard>
      )}

      <AdminCard title="운영 액션">
        <p className="sam-text-body-secondary text-sam-fg">
          환불 승인·상태 변경은 <strong>매장 주문(액션)</strong> 화면에서 동일 원장으로 진행합니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/admin/store-orders?order_id=${encodeURIComponent(order.id)}`}
            className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-medium text-white"
          >
            매장 주문(액션) 열기
          </Link>
          <Link
            href={`/admin/delivery-orders/${encodeURIComponent(order.id)}/chat`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm text-sam-fg"
          >
            주문 채팅
          </Link>
        </div>
      </AdminCard>

      <AdminCard title="상태 로그">
        <p className="sam-text-body-secondary text-sam-muted">
          상세 타임라인은 DB <code className="rounded bg-sam-app px-1 sam-text-helper">order_status_logs</code> 등과 연동 시
          표시합니다. 현재는 원장 필드만 반영합니다.
        </p>
        <AdminOrderTimeline logs={logs} />
      </AdminCard>

      <div className="text-center text-sm">
        <Link href={`/stores/${encodeURIComponent(order.storeSlug)}`} className="text-signature underline">
          사용자 매장 상세
        </Link>
      </div>
    </div>
  );
}
