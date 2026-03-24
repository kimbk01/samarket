"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-mock/types";
import {
  AdminActionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  SettlementStatusBadge,
} from "./DeliveryOrderBadges";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatKstDatetimeLong } from "@/lib/datetime/format-kst-datetime";

export type OrderTableSelection = {
  selectedIds: ReadonlySet<string>;
  onToggleRow: (orderId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
};

function shortId(id: string, len = 8) {
  if (!id) return "—";
  return id.length <= len ? id : `${id.slice(0, len)}…`;
}

function itemsLineSummary(o: AdminDeliveryOrder): string {
  if (!o.items?.length) return "품목 없음";
  return o.items.map((it) => `${it.menuName}×${it.qty}`).join(", ");
}

function fulfillmentSummary(o: AdminDeliveryOrder): string {
  if (o.orderType === "delivery") {
    const parts = [o.addressSummary, o.addressDetail].filter((x) => x && String(x).trim());
    return parts.length ? parts.join(" · ") : "배달지 미입력";
  }
  return o.pickupNote?.trim() ? `포장 메모: ${o.pickupNote}` : "포장";
}

export function OrderTable({ rows, selection }: { rows: AdminDeliveryOrder[]; selection?: OrderTableSelection }) {
  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected =
    selection != null &&
    visibleIds.length > 0 &&
    visibleIds.every((id) => selection.selectedIds.has(id));
  const someVisibleSelected =
    selection != null && visibleIds.some((id) => selection.selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) {
      el.indeterminate = Boolean(someVisibleSelected && !allVisibleSelected);
    }
  }, [someVisibleSelected, allVisibleSelected]);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">조건에 맞는 주문이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[1240px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-600">
            {selection ? (
              <th className="w-10 px-2 py-2 text-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => selection.onToggleAllVisible(e.target.checked)}
                  className="rounded border-gray-300"
                  title="현재 목록 전체 선택"
                  aria-label="현재 목록 전체 선택"
                />
              </th>
            ) : null}
            <th className="px-2 py-2">주문번호</th>
            <th className="px-2 py-2">일시</th>
            <th className="px-2 py-2 min-w-[160px]">주문자·연락</th>
            <th className="px-2 py-2 min-w-[160px]">매장·운영</th>
            <th className="px-2 py-2 min-w-[220px]">구매·배송·요청</th>
            <th className="px-2 py-2">방식</th>
            <th className="px-2 py-2">금액</th>
            <th className="px-2 py-2">결제</th>
            <th className="px-2 py-2">주문</th>
            <th className="px-2 py-2">정산</th>
            <th className="px-2 py-2">신고</th>
            <th className="px-2 py-2">조치</th>
            <th className="px-2 py-2">액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const src = o.orderSource ?? "simulation";
            const detailHref =
              src === "store_db"
                ? `/admin/store-orders?order_id=${encodeURIComponent(o.id)}`
                : `/admin/delivery-orders/${encodeURIComponent(o.id)}`;
            return (
              <tr key={`${src}-${o.id}`} className="border-b border-gray-100 align-top hover:bg-gray-50/80">
                {selection ? (
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(o.id)}
                      onChange={(e) => selection.onToggleRow(o.id, e.target.checked)}
                      className="rounded border-gray-300"
                      aria-label={`주문 ${o.orderNo} 선택`}
                    />
                  </td>
                ) : null}
                <td className="px-2 py-2 font-mono text-[12px] whitespace-nowrap">{o.orderNo}</td>
                <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                  {formatKstDatetimeLong(o.createdAt)}
                </td>
                <td className="px-2 py-2 text-gray-800">
                  <div className="font-medium">{o.buyerName || "—"}</div>
                  <div className="text-[12px] text-gray-600" title={o.buyerPhone}>
                    {o.buyerPhone?.trim() ? o.buyerPhone : "전화 없음"}
                  </div>
                  <div className="font-mono text-[11px] text-gray-500" title={o.buyerUserId}>
                    회원 {shortId(o.buyerUserId, 12)}
                  </div>
                </td>
                <td className="px-2 py-2 text-gray-800">
                  <div className="max-w-[200px] truncate font-medium" title={o.storeName}>
                    {o.storeName}
                  </div>
                  <div className="text-[12px] text-gray-600">
                    {o.storeSlug ? (
                      <span title={o.storeSlug}>/{o.storeSlug}</span>
                    ) : (
                      <span className="text-gray-400">슬러그 없음</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    사장님 {o.storeOwnerName || "—"}{" "}
                    <span className="font-mono text-gray-400" title={o.storeOwnerUserId}>
                      · {shortId(o.storeOwnerUserId)}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-gray-400" title={o.storeId}>
                    매장 {shortId(o.storeId, 12)}
                  </div>
                </td>
                <td className="px-2 py-2 text-gray-800">
                  <div className="text-[12px] leading-snug" title={itemsLineSummary(o)}>
                    {itemsLineSummary(o)}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-gray-600" title={fulfillmentSummary(o)}>
                    {fulfillmentSummary(o)}
                  </div>
                  {o.requestNote?.trim() ? (
                    <div
                      className="mt-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-900"
                      title={o.requestNote}
                    >
                      요청: {o.requestNote.length > 80 ? `${o.requestNote.slice(0, 80)}…` : o.requestNote}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{o.orderType === "delivery" ? "배달" : "포장"}</td>
                <td className="px-2 py-2 whitespace-nowrap font-medium">{formatMoneyPhp(o.finalAmount)}</td>
                <td className="px-2 py-2">
                  <PaymentStatusBadge status={o.paymentStatus} />
                </td>
                <td className="px-2 py-2">
                  <OrderStatusBadge status={o.orderStatus} />
                </td>
                <td className="px-2 py-2">
                  <SettlementStatusBadge status={o.settlementStatus} />
                </td>
                <td className="px-2 py-2 text-center">{o.hasReport ? "⚠" : "—"}</td>
                <td className="px-2 py-2">
                  <AdminActionStatusBadge status={o.adminActionStatus} />
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <Link href={detailHref} className="font-medium text-signature hover:underline">
                    상세
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
