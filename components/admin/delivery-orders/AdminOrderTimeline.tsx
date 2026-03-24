"use client";

import type { OrderStatusLog } from "@/lib/admin/delivery-orders-mock/types";

export function AdminOrderTimeline({ logs }: { logs: OrderStatusLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-gray-500">이력이 없습니다.</p>;
  }
  return (
    <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
      {[...logs].reverse().map((l) => (
        <li key={l.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-signature" />
          <p className="font-medium text-gray-900">{l.action}</p>
          <p className="text-xs text-gray-500">
            {new Date(l.createdAt).toLocaleString("ko-KR")} · {l.actorType} / {l.actorId}
          </p>
          {(l.fromOrderStatus || l.toOrderStatus) && (
            <p className="mt-0.5 text-xs text-gray-600">
              주문: {l.fromOrderStatus ?? "—"} → {l.toOrderStatus ?? "—"}
            </p>
          )}
          {l.reason ? <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">사유: {l.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
