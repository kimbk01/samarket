"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
    <div className="border-b border-sam-border-soft px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-sam-fg">{label}</p>
          {description ? <p className="mt-0.5 text-[12px] text-sam-muted">{description}</p> : null}
        </div>
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
    </div>
  );
}

export function MemberNotificationSettings() {
  const { t } = useI18n();
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
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {t("order_notifications_guest_only")}
      </p>
    );
  }

  if (!p) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 text-sm text-sam-muted shadow-sm">
        알림 설정을 준비 중입니다.
      </div>
    );
  }

  return (
    <div className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="px-4 py-3">
        <h2 className="text-sm font-bold text-sam-fg">{t("order_notifications_header")}</h2>
        <p className="mt-1 text-[12px] text-sam-muted">
          {t("order_notifications_demo_desc", { userId })}
        </p>
      </div>
      <Row
        label={t("order_notifications_new_order")}
        checked={p.allow_new_order}
        onChange={(x) => patch({ allow_new_order: x })}
      />
      <Row
        label={t("order_notifications_status")}
        checked={p.allow_order_status}
        onChange={(x) => patch({ allow_order_status: x })}
      />
      <Row
        label={t("order_notifications_cancel_refund")}
        checked={p.allow_cancel && p.allow_refund}
        onChange={(x) => patch({ allow_cancel: x, allow_refund: x })}
      />
      <Row
        label={t("order_notifications_marketing")}
        description={t("order_notifications_marketing_desc")}
        checked={p.allow_marketing}
        onChange={(x) => patch({ allow_marketing: x })}
      />
    </div>
  );
}
