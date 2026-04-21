"use client";

import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";

export function CancelRequestTable({
  rows,
  onApprove,
  onReject,
  showWorkflowActions = true,
}: {
  rows: AdminDeliveryOrder[];
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  /** 시뮬 워크플로 전용. 원장에서 이미 취소 완료된 건은 상세 링크만 표시 */
  showWorkflowActions?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">대기 중인 취소 요청이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[900px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">주문번호</th>
            <th className="px-2 py-2">주문자</th>
            <th className="px-2 py-2">매장</th>
            <th className="px-2 py-2">요청일</th>
            <th className="px-2 py-2">사유</th>
            <th className="px-2 py-2">액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-sam-border-soft">
              <td className="px-2 py-2 font-mono sam-text-helper">{o.orderNo}</td>
              <td className="px-2 py-2">{o.buyerName}</td>
              <td className="px-2 py-2 max-w-[160px] truncate">{o.storeName}</td>
              <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                {o.cancelRequest ? new Date(o.cancelRequest.requestedAt).toLocaleString("ko-KR") : "—"}
              </td>
              <td className="px-2 py-2 max-w-[280px] text-sam-fg">{o.cancelRequest?.reason ?? "—"}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  <Link
                    href={`/admin/delivery-orders/${encodeURIComponent(o.id)}`}
                    className="text-xs font-medium text-signature underline"
                  >
                    상세
                  </Link>
                  {showWorkflowActions ? (
                    <>
                      <button
                        type="button"
                        className="text-xs text-emerald-700 underline"
                        onClick={() => onApprove(o.id)}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        onClick={() => onReject(o.id)}
                      >
                        거절
                      </button>
                    </>
                  ) : (
                    <Link
                      href={`/admin/store-orders?order_id=${encodeURIComponent(o.id)}`}
                      className="text-xs text-sam-muted underline"
                    >
                      매장 주문(액션)
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
