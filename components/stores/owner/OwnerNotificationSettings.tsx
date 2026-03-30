"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { SHARED_SIM_STORE_ID } from "@/lib/shared-orders/types";
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
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
      <span className="text-[15px] text-gray-900">{label}</span>
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
  );
}

export function OwnerNotificationSettings({ storeId }: { storeId: string }) {
  const av = useMockAuthVersion();
  const v = useSyncExternalStore(
    subscribeNotificationSettings,
    getNotificationSettingsVersion,
    getNotificationSettingsVersion
  );
  const userId = useMemo(() => {
    void av;
    const s = getMockSession();
    return s.role === "owner" ? s.userId : null;
  }, [av]);
  const p = useMemo(() => {
    void v;
    if (!userId) return null;
    return getNotificationPreferences("owner", userId);
  }, [userId, v]);

  const patch = (partial: Parameters<typeof updateNotificationPreferences>[2]) => {
    if (!userId) return;
    updateNotificationPreferences("owner", userId, partial);
  };

  if (storeId !== SHARED_SIM_STORE_ID) {
    return <p className="text-sm text-gray-600">시뮬 매장만 설정할 수 있어요.</p>;
  }

  if (!userId || !p) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        매장(오너) 역할에서만 알림 설정을 바꿀 수 있어요.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-900">매장 알림 (시뮬)</h2>
        <p className="mt-1 text-[12px] text-gray-500 font-mono">{userId}</p>
      </div>
      <Row label="새 주문 알림 받기" checked={p.allow_new_order} onChange={(x) => patch({ allow_new_order: x })} />
      <Row label="취소 요청 알림 받기" checked={p.allow_cancel} onChange={(x) => patch({ allow_cancel: x })} />
      <Row label="환불 요청 알림 받기" checked={p.allow_refund} onChange={(x) => patch({ allow_refund: x })} />
      <Row label="정산 알림 받기" checked={p.allow_settlement} onChange={(x) => patch({ allow_settlement: x })} />
      <Row
        label="관리자 공지 알림 받기"
        checked={p.allow_admin_notice}
        onChange={(x) => patch({ allow_admin_notice: x })}
      />
    </div>
  );
}
