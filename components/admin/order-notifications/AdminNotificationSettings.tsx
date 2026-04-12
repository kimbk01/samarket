"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { DEMO_ADMIN_USER_ID } from "@/lib/shared-notifications/constants";
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
    <div className="flex items-center justify-between gap-3 border-b border-sam-border-soft px-4 py-3">
      <span className="text-[15px] text-sam-fg">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-signature" : "bg-sam-border-soft"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function AdminNotificationSettings() {
  const av = useMockAuthVersion();
  const v = useSyncExternalStore(
    subscribeNotificationSettings,
    getNotificationSettingsVersion,
    getNotificationSettingsVersion
  );
  const userId = useMemo(() => {
    void av;
    return getMockSession().role === "admin" ? DEMO_ADMIN_USER_ID : null;
  }, [av]);
  const p = useMemo(() => {
    void v;
    if (!userId) return null;
    return getNotificationPreferences("admin", userId);
  }, [userId, v]);

  const patch = (partial: Parameters<typeof updateNotificationPreferences>[2]) => {
    if (!userId) return;
    updateNotificationPreferences("admin", userId, partial);
  };

  if (!userId || !p) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        관리자 역할에서만 알림 설정을 바꿀 수 있어요.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="border-b border-sam-border-soft px-4 py-3">
        <h2 className="text-sm font-bold text-sam-fg">운영 알림 (시뮬)</h2>
        <p className="mt-1 font-mono text-[12px] text-sam-muted">{userId}</p>
      </div>
      <Row label="취소 요청 알림 받기" checked={p.allow_cancel} onChange={(x) => patch({ allow_cancel: x })} />
      <Row label="환불 요청 알림 받기" checked={p.allow_refund} onChange={(x) => patch({ allow_refund: x })} />
      <Row label="분쟁 주문 알림 받기" checked={p.allow_admin_notice} onChange={(x) => patch({ allow_admin_notice: x })} />
      <Row label="정산 보류 알림 받기" checked={p.allow_settlement} onChange={(x) => patch({ allow_settlement: x })} />
      <Row
        label="이상 주문 감지 알림 받기"
        checked={p.allow_marketing}
        onChange={(x) => patch({ allow_marketing: x })}
      />
      <p className="px-4 py-3 text-[11px] leading-snug text-sam-muted">
        「이상 주문 감지」는 시뮬에서 강제 상태 변경 검토 알림 등에 사용합니다. 실서비스에서는 전용 플래그로 분리할 수
        있어요.
      </p>
    </div>
  );
}
