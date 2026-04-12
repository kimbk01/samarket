"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import {
  listNotificationsForTarget,
  markAllNotificationsReadForTarget,
  markNotificationRead,
} from "@/lib/shared-notifications/shared-notification-store";
import type { SharedNotificationType } from "@/lib/shared-notifications/types";
import { useSharedNotificationsVersion } from "@/lib/shared-notifications/use-shared-notifications-version";

const ORDER_TYPES = new Set<SharedNotificationType>([
  "new_order",
  "order_accepted",
  "preparing",
  "delivering",
  "arrived",
  "ready_for_pickup",
  "completed",
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
  "settlement_held",
  "settlement_released",
  "admin_note",
  "dispute",
  "chat_message",
  "admin_chat_message",
  "order_system_message",
  "chat_blocked",
  "chat_unblocked",
]);

export function MemberNotificationList() {
  const v = useSharedNotificationsVersion();
  const buyerId = getDemoBuyerUserId();
  const [orderOnly, setOrderOnly] = useState(true);

  const rows = useMemo(() => {
    void v;
    if (!buyerId) return [];
    const all = listNotificationsForTarget("member", buyerId);
    if (!orderOnly) return all;
    return all.filter((n) => ORDER_TYPES.has(n.type));
  }, [buyerId, orderOnly, v]);

  if (!buyerId) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" id="order-sim">
        회원 역할로 전환한 뒤 주문 알림을 확인하세요.
      </p>
    );
  }

  return (
    <div className="space-y-3" id="order-sim">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-sam-fg">
          <input
            type="checkbox"
            checked={orderOnly}
            onChange={(e) => setOrderOnly(e.target.checked)}
          />
          주문 관련만 보기
        </label>
        {buyerId && rows.some((r) => !r.is_read) ? (
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 text-[11px] text-sam-fg"
            onClick={() => markAllNotificationsReadForTarget("member", buyerId)}
          >
            전체 읽음
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-sm text-sam-muted ring-1 ring-sam-border-soft">
          주문 시뮬 알림이 없어요. 주문을 진행하면 여기에 쌓여요.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-ui-rect border px-3 py-3 shadow-sm ${
                r.is_read ? "border-sam-border-soft bg-sam-surface" : "border-sam-border bg-signature/5/80"
              }`}
            >
              <div className="flex flex-wrap justify-between gap-1 text-[11px] text-sam-meta">
                <span className="font-mono">{r.type}</span>
                <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
              </div>
              <p className="mt-1 text-[14px] font-semibold text-sam-fg">{r.title}</p>
              <p className="mt-0.5 text-[13px] text-sam-fg">{r.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href="/my/store-orders"
                  className="text-[12px] font-medium text-signature underline"
                  onClick={() => {
                    if (!r.is_read) markNotificationRead(r.id);
                  }}
                >
                  배달 주문 내역
                </Link>
                {!r.is_read ? (
                  <button
                    type="button"
                    className="text-[12px] text-sam-muted underline"
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
      <p className="text-[11px] text-sam-muted">
        알림 on/off는{" "}
        <Link href="/mypage/order-notifications" className="text-signature underline">
          주문 알림 설정
        </Link>
        에서 바꿀 수 있어요.
      </p>
    </div>
  );
}
