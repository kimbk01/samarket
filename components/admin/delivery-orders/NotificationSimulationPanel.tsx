"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  findSharedOrder,
  getSharedOrdersVersion,
  listSharedOrdersRaw,
  resetSharedOrders,
  sharedAdminApproveRefund,
  sharedMemberRequestCancel,
  sharedOwnerAccept,
  subscribeSharedOrders,
} from "@/lib/shared-orders/shared-order-store";
import { resetNotificationSettingsToDefaults } from "@/lib/shared-notifications/notification-settings-store";
import {
  getSharedNotificationsVersion,
  listSharedNotifications,
  resetSharedNotifications,
  subscribeSharedNotifications,
} from "@/lib/shared-notifications/shared-notification-store";

function useNotifV() {
  return useSyncExternalStore(
    subscribeSharedNotifications,
    getSharedNotificationsVersion,
    getSharedNotificationsVersion
  );
}

export function NotificationSimulationPanel() {
  const ov = useSyncExternalStore(subscribeSharedOrders, getSharedOrdersVersion, getSharedOrdersVersion);
  const nv = useNotifV();
  const orders = useMemo(() => {
    void ov;
    return listSharedOrdersRaw();
  }, [ov]);
  const notifs = useMemo(() => {
    void nv;
    return listSharedNotifications();
  }, [nv]);

  const [orderId, setOrderId] = useState("");
  const [role, setRole] = useState<"member" | "owner" | "admin">("member");
  const [last, setLast] = useState<string | null>(null);

  const sel = orderId ? findSharedOrder(orderId) : undefined;

  return (
    <section className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/80 p-4">
      <h2 className="text-sm font-bold text-gray-900">Notification Simulation Panel</h2>
      <p className="mt-1 text-[11px] text-gray-600">
        주문 선택 후 테스트 알림을 넣거나, 전체 스토어를 비웁니다.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[11px] font-medium text-gray-700">
          주문
          <select
            className="mt-0.5 min-w-[200px] rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">—</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_no}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-[11px] font-medium text-gray-700">
          역할 (테스트 이벤트 관점)
          <select
            className="mt-0.5 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="member">회원 관점 이벤트</option>
            <option value="owner">오너 관점 이벤트</option>
            <option value="admin">관리자 관점 이벤트</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-ui-rect bg-gray-900 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"
          disabled={!sel}
          onClick={() => {
            if (!sel) return;
            if (role === "member") {
              const r = sharedMemberRequestCancel(sel.id, sel.buyer_user_id, "패널 테스트 취소요청");
              setLast(r.ok ? "회원 취소요청 OK" : r.error);
              return;
            }
            if (role === "owner") {
              const r = sharedOwnerAccept(sel.id);
              setLast(r.ok ? "오너 수락 OK" : r.error);
              return;
            }
            const r = sharedAdminApproveRefund(sel.id, "패널 환불승인");
            setLast(r.ok ? "관리자 환불승인 OK" : r.error);
          }}
        >
          액션 실행
        </button>
        <button
          type="button"
          className="rounded-ui-rect border border-red-300 bg-white px-3 py-2 text-[11px] text-red-800"
          onClick={() => {
            if (!confirm("알림·설정·주문을 모두 초기화할까요?")) return;
            resetSharedNotifications();
            resetNotificationSettingsToDefaults();
            resetSharedOrders();
            setOrderId("");
            setLast("전체 초기화");
          }}
        >
          전체 초기화
        </button>
      </div>

      {last ? <p className="mt-2 font-mono text-[11px] text-gray-800">{last}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[11px] font-bold text-gray-700">알림 미리보기 ({notifs.length})</h3>
          <pre className="max-h-[200px] overflow-auto rounded-ui-rect bg-slate-900 p-2 text-[9px] text-emerald-100">
            {JSON.stringify(notifs.slice(-12), null, 2)}
          </pre>
        </div>
        <div>
          <h3 className="mb-1 text-[11px] font-bold text-gray-700">unread 힌트</h3>
          <pre className="max-h-[200px] overflow-auto rounded-ui-rect bg-slate-900 p-2 text-[9px] text-sky-100">
            {JSON.stringify(
              notifs.filter((n) => !n.is_read).map((n) => ({ role: n.role, type: n.type, title: n.title })),
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </section>
  );
}
