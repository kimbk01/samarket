"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { SHARED_SIM_STORE_ID } from "@/lib/shared-orders/types";
import {
  listNotificationsForTarget,
  markAllNotificationsReadForTarget,
  markNotificationRead,
} from "@/lib/shared-notifications/shared-notification-store";
import type { SharedNotificationType } from "@/lib/shared-notifications/types";
import { useSharedNotificationsVersion } from "@/lib/shared-notifications/use-shared-notifications-version";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

const GROUPS: { label: string; types: SharedNotificationType[] }[] = [
  { label: "신규 주문", types: ["new_order"] },
  { label: "취소 요청", types: ["cancel_requested", "cancelled"] },
  { label: "환불", types: ["refund_requested", "refunded"] },
  { label: "정산", types: ["settlement_held", "settlement_released"] },
  { label: "관리자 메모", types: ["admin_note", "dispute", "admin_chat_message", "chat_blocked", "chat_unblocked"] },
];

export function OwnerNotificationList({ slug, storeId }: { slug: string; storeId: string }) {
  const av = useMockAuthVersion();
  const v = useSharedNotificationsVersion();
  const ownerId = useMemo(() => {
    void av;
    const s = getMockSession();
    return s.role === "owner" ? s.userId : null;
  }, [av]);
  const [tab, setTab] = useState<string>("all");

  const rows = useMemo(() => {
    void v;
    if (!ownerId) return [];
    return listNotificationsForTarget("owner", ownerId, { storeId });
  }, [ownerId, storeId, v]);

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    const g = GROUPS.find((x) => x.label === tab);
    if (!g) return rows;
    return rows.filter((r) => g.types.includes(r.type));
  }, [rows, tab]);

  if (storeId !== SHARED_SIM_STORE_ID) {
    return <p className="text-sm text-gray-600">이 매장에는 시뮬 알림이 연결되어 있지 않아요.</p>;
  }

  if (!ownerId) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        매장(오너) 역할로 전환한 뒤 알림을 확인하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {["all", ...GROUPS.map((g) => g.label)].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              tab === t ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"
            }`}
          >
            {t === "all" ? "전체" : t}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-ui-rect border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800"
          onClick={() => markAllNotificationsReadForTarget("owner", ownerId, storeId)}
        >
          전체 읽음
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-ui-rect bg-white p-4 text-sm text-gray-500 ring-1 ring-gray-100">알림이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li
              key={r.id}
              className={`rounded-ui-rect border px-3 py-3 ${
                r.priority === "high" && !r.is_read
                  ? "border-amber-300 bg-amber-50"
                  : r.is_read
                    ? "border-gray-100 bg-white"
                    : "border-gray-200 bg-signature/5"
              }`}
            >
              <div className="flex flex-wrap justify-between gap-1 text-[11px] text-gray-400">
                <span>{r.type}</span>
                <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-gray-900">{r.title}</p>
              <p className="mt-0.5 text-[13px] text-gray-700">{r.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={buildStoreOrdersHref({
                    storeId,
                    orderId: r.linked_order_id,
                  })}
                  className="text-xs font-medium text-signature underline"
                  onClick={() => {
                    if (!r.is_read) markNotificationRead(r.id);
                  }}
                >
                  주문 보기
                </Link>
                {!r.is_read ? (
                  <button
                    type="button"
                    className="text-xs text-gray-600 underline"
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
      <p className="text-xs text-gray-500">
        <Link href={`/stores/${encodeURIComponent(slug)}/owner/notification-settings`} className="text-signature underline">
          알림 설정
        </Link>
      </p>
    </div>
  );
}
