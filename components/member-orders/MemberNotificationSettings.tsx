"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import {
  getNotificationPreferences,
  getNotificationSettingsVersion,
  subscribeNotificationSettings,
  updateNotificationPreferences,
} from "@/lib/shared-notifications/notification-settings-store";

function Row({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <div className="border-b border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-gray-900">{label}</p>
          {description ? <p className="mt-0.5 text-[12px] text-gray-500">{description}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            checked ? "bg-signature" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export function MemberNotificationSettings() {
  const v = useSyncExternalStore(
    subscribeNotificationSettings,
    getNotificationSettingsVersion,
    getNotificationSettingsVersion
  );
  const userId = getDemoBuyerUserId();
  const p = useMemo(() => {
    void v;
    if (!userId) return null;
    return getNotificationPreferences("member", userId);
  }, [userId, v]);

  const patch = (partial: Parameters<typeof updateNotificationPreferences>[2]) => {
    if (!userId) return;
    updateNotificationPreferences("member", userId, partial);
  };

  if (!userId) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        알림 설정은 <strong>회원</strong> 역할에서만 조정할 수 있어요.
      </p>
    );
  }

  if (!p) return null;

  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-3">
        <h2 className="text-sm font-bold text-gray-900">주문 알림</h2>
        <p className="mt-1 text-[12px] text-gray-500">
          데모 회원 <span className="font-mono">{userId}</span> 기준입니다. 실서비스에서는 로그인 사용자 ID로
          치환됩니다.
        </p>
      </div>
      <Row
        label="주문 접수 알림 받기"
        checked={p.allow_new_order}
        onChange={(x) => patch({ allow_new_order: x })}
      />
      <Row
        label="주문 상태 변경 알림 받기"
        checked={p.allow_order_status}
        onChange={(x) => patch({ allow_order_status: x })}
      />
      <Row
        label="취소·환불 알림 받기"
        checked={p.allow_cancel && p.allow_refund}
        onChange={(x) => patch({ allow_cancel: x, allow_refund: x })}
      />
      <Row
        label="마케팅·이벤트 알림 받기"
        description="주문 시뮬에서는 사용 예약. 푸시 확장 시 연결."
        checked={p.allow_marketing}
        onChange={(x) => patch({ allow_marketing: x })}
      />
    </div>
  );
}
