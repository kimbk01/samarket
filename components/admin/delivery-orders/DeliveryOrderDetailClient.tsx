"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSupabaseStoreOrderRowRealtime } from "@/hooks/useSupabaseStoreOrderRowRealtime";
import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";

type AuditRow = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  created_at: string;
  before_json: unknown;
  after_json: unknown;
};

export function DeliveryOrderDetailClient({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<AdminDeliveryOrder | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const id = orderId.trim();
    if (!id) {
      setOrder(null);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { order: fromDb } = await fetchAdminStoreOrderDetailDeduped(id);
      setOrder(fromDb ?? null);
    } catch {
      setOrder(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [orderId]);

  useSupabaseStoreOrderRowRealtime(orderId.trim() || null, {
    debounceMs: 400,
    onChange: () => void reload({ silent: true }),
  });

  useSupabaseStoreOrderDeliveriesRealtime(
    orderId.trim() ? { kind: "order", orderId } : null,
    { debounceMs: 450, onChange: () => void reload({ silent: true }) }
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const [opBusy, setOpBusy] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const loadAudit = useCallback(async () => {
    const id = orderId.trim();
    if (!id) return;
    setAuditLoading(true);
    try {
      const res = await fetch(
        `/api/admin/audit-logs?target_type=store_order&target_id=${encodeURIComponent(id)}&limit=80`,
        { credentials: "include" }
      );
      const j = (await res.json()) as {
        ok?: boolean;
        logs?: AuditRow[];
      };
      setAuditRows(Array.isArray(j.logs) ? j.logs : []);
    } catch {
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    setNoteDraft(order.adminNote ?? "");
  }, [order?.id, order?.adminNote]);

  useEffect(() => {
    if (!order?.id) return;
    void loadAudit();
  }, [order?.id, loadAudit]);

  const runAdminPatch = useCallback(
    async (body: Record<string, unknown>) => {
      const id = orderId.trim();
      if (!id) return;
      setOpBusy(true);
      try {
        const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!j?.ok) {
          window.alert(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
          return;
        }
        await reload({ silent: true });
        await loadAudit();
      } finally {
        setOpBusy(false);
      }
    },
    [orderId, reload, loadAudit]
  );

  const timelineLogs = useMemo<OrderStatusLog[]>(
    () =>
      auditRows.map((r) => ({
        id: r.id,
        orderId: order?.id ?? orderId.trim(),
        actorType:
          r.actor_type === "admin"
            ? "admin"
            : r.actor_type === "system"
              ? "system"
              : "buyer",
        actorId: r.actor_id ?? "—",
        action: r.action,
        createdAt: r.created_at,
      })),
    [auditRows, order?.id, orderId]
  );

  if (loading) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 상세" backHref="/admin/stores/orders" />
        <p className="text-sm text-sam-muted">원장 불러오는 중…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 상세" backHref="/admin/stores/orders" />
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
      <AdminPageHeader title={`주문 ${order.orderNo}`} backHref="/admin/stores/orders" />
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
          href={`/admin/stores/orders/${encodeURIComponent(order.id)}/chat`}
          className="font-semibold text-signature underline"
        >
          주문 채팅
        </Link>
        <span className="text-sam-muted"> · 메신저 배달 채팅 원장</span>
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
            <Link href="/admin/stores/orders/reports" className="text-signature underline">
              신고·분쟁 콘솔로 이동
            </Link>
          </p>
        </AdminCard>
      )}

      <AdminCard title="플랫폼 운영 조치">
        <p className="sam-text-body-secondary text-sam-muted">
          동일 <code className="rounded bg-sam-app px-1 sam-text-helper">store_orders</code> 원장을 직접 갱신합니다. 강제
          처리 시 감사 로그가 남습니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={opBusy}
            onClick={() => {
              if (!confirm("주문을 강제 취소할까요? (완료·환불된 주문은 거절됩니다)")) return;
              void runAdminPatch({ force_cancel: true });
            }}
            className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 disabled:opacity-50"
          >
            강제 취소
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => {
              if (!confirm("환불 요청 상태로 올릴까요?")) return;
              void runAdminPatch({ set_order_status: "refund_requested" });
            }}
            className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 disabled:opacity-50"
          >
            환불 요청 처리
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => {
              if (!confirm("환불 완료(원장·재고·정산 반영)를 진행할까요?")) return;
              void runAdminPatch({ complete_refund: true });
            }}
            className="rounded-ui-rect bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            환불 완료
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ admin_locked: !order.adminLocked })}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            잠금 {order.adminLocked ? "해제" : "설정"}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ admin_flagged: !order.adminFlagged })}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            경고 {order.adminFlagged ? "해제" : "설정"}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ dispute_status: "urgent" })}
            className="rounded-ui-rect border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950 disabled:opacity-50"
          >
            긴급 플래그
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ dispute_status: "" })}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50"
          >
            긴급 해제
          </button>
        </div>
        <div className="mt-4 space-y-2">
          <label className="block text-sm">
            <span className="text-sam-muted">운영 메모</span>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              disabled={opBusy}
              className="mt-1 w-full rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-body text-sam-fg"
            />
          </label>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ admin_note: noteDraft })}
            className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            메모 저장
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-sam-border-soft pt-3">
          <Link
            href={`/admin/store-orders?order_id=${encodeURIComponent(order.id)}`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
          >
            매장 주문(액션)
          </Link>
          <Link
            href={`/admin/stores/orders/${encodeURIComponent(order.id)}/chat`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
          >
            주문 채팅
          </Link>
          <button
            type="button"
            disabled={auditLoading}
            onClick={() => void loadAudit()}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50"
          >
            감사 로그 새로고침
          </button>
        </div>
      </AdminCard>

      <AdminCard title="상태·감사 로그">
        <p className="sam-text-body-secondary text-sam-muted">
          <code className="rounded bg-sam-app px-1 sam-text-helper">audit_logs</code> ·{" "}
          <code className="rounded bg-sam-app px-1 sam-text-helper">target_type=store_order</code>
        </p>
        {auditLoading ? (
          <p className="mt-2 text-sm text-sam-muted">불러오는 중…</p>
        ) : (
          <div className="mt-2">
            <AdminOrderTimeline logs={timelineLogs} />
          </div>
        )}
      </AdminCard>

      <div className="text-center text-sm">
        <Link href={`/stores/${encodeURIComponent(order.storeSlug)}`} className="text-signature underline">
          사용자 매장 상세
        </Link>
      </div>
    </div>
  );
}
