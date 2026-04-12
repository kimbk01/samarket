"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { DEMO_ADMIN_USER_ID } from "@/lib/shared-notifications/constants";
import {
  listNotificationsForTarget,
  markAllNotificationsReadForTarget,
  markNotificationRead,
} from "@/lib/shared-notifications/shared-notification-store";
import { useSharedNotificationsVersion } from "@/lib/shared-notifications/use-shared-notifications-version";

export function AdminNotificationList() {
  const av = useMockAuthVersion();
  const v = useSharedNotificationsVersion();
  const adminId = useMemo(() => {
    void av;
    return getMockSession().role === "admin" ? DEMO_ADMIN_USER_ID : null;
  }, [av]);
  const rows = useMemo(() => {
    void v;
    if (!adminId) return [];
    return listNotificationsForTarget("admin", adminId);
  }, [adminId, v]);

  if (!adminId) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        관리자 역할로 전환한 뒤 운영 알림을 확인하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="text-sm text-sam-muted">
          취소·환불·분쟁·정산 보류 등 운영 알림입니다. 우선순위 높은 항목은 강조됩니다.
        </p>
        {rows.some((r) => !r.is_read) ? (
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs text-sam-fg"
            onClick={() => markAllNotificationsReadForTarget("admin", adminId)}
          >
            전체 읽음
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">
          알림이 없습니다. 주문 시뮬에서 액션을 실행해 보세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-ui-rect border px-4 py-3 ${
                r.priority === "high" && !r.is_read
                  ? "border-red-300 bg-red-50 shadow-sm"
                  : r.is_read
                    ? "border-sam-border-soft bg-sam-surface"
                    : "border-amber-200 bg-amber-50/50"
              }`}
            >
              <div className="flex flex-wrap justify-between gap-1 text-[11px] text-sam-muted">
                <span className="font-mono">{r.type}</span>
                <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-sam-fg">{r.title}</p>
              <p className="mt-0.5 text-[13px] text-sam-fg">{r.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={`/admin/delivery-orders/${encodeURIComponent(r.linked_order_id)}`}
                  className="text-xs font-semibold text-signature underline"
                  onClick={() => {
                    if (!r.is_read) markNotificationRead(r.id);
                  }}
                >
                  주문 상세
                </Link>
                {!r.is_read ? (
                  <button
                    type="button"
                    className="text-xs text-sam-muted underline"
                    onClick={() => markNotificationRead(r.id)}
                  >
                    읽음
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-sam-muted">
        <Link href="/admin/order-notifications/settings" className="text-signature underline">
          알림 설정
        </Link>
        {" · "}
        <Link href="/admin/delivery-orders/simulation" className="text-signature underline">
          주문·알림 시뮬
        </Link>
      </p>
    </div>
  );
}
