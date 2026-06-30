"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { AdminNotificationSoundSsotTable } from "@/components/admin/settings/AdminNotificationSoundSsotTable";
import { AdminNotificationSoundPreview } from "@/components/admin/settings/AdminNotificationSoundPreview";
import { AdminMessengerCallSoundsSection } from "@/components/admin/settings/AdminMessengerCallSoundsSection";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type Row = {
  type: NotificationDomain;
  sound_url: string | null;
  volume: number;
  repeat_count: number;
  cooldown_seconds: number;
  enabled: boolean;
};

const DOMAIN_TITLE_KEYS: Record<NotificationDomain, MessageKey> = {
  trade_chat: "admin_order_notif_row_trade_chat",
  community_direct_chat: "admin_settings_notif_domain_direct",
  community_group_chat: "admin_settings_notif_domain_group",
  community_chat: "admin_settings_notif_domain_community_legacy",
  order: "admin_order_notif_row_order",
  store: "admin_order_notif_row_store",
};

const VISIBLE_NOTIFICATION_DOMAINS: NotificationDomain[] = [
  "community_direct_chat",
  "community_group_chat",
  "trade_chat",
  "order",
  "store",
];

export function AdminNotificationDomainsSettings() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setErr((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/admin/notification-settings", { credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; items?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_load_failed"));
        return;
      }
      const byType = new Map((j.items ?? []).map((r) => [r.type, r]));
      const legacyCommunity = byType.get("community_chat");
      const merged = VISIBLE_NOTIFICATION_DOMAINS.map((type) => {
        const r =
          byType.get(type) ??
          ((type === "community_direct_chat" || type === "community_group_chat") ? legacyCommunity : undefined);
        return {
          type,
          sound_url: r?.sound_url ?? null,
          volume: typeof r?.volume === "number" ? r.volume : 0.7,
          repeat_count: typeof r?.repeat_count === "number" ? r.repeat_count : 1,
          cooldown_seconds: typeof r?.cooldown_seconds === "number" ? r.cooldown_seconds : 3,
          enabled: r?.enabled !== false,
        };
      });
      setRows(merged);
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-6 sam-text-body text-ui-muted">
        {t("common_loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_settings_notifications_domain_title" />
      <p className="sam-text-body text-ui-muted">{t("admin_settings_notifications_intro")}</p>
      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}

      <AdminNotificationSoundSsotTable />

      <details className="rounded-ui-rect border border-ui-border bg-ui-surface/50 p-3">
        <summary className="cursor-pointer sam-text-body-secondary text-ui-muted">
          {t("admin_notif_sound_legacy_sections")}
        </summary>
        <p className="mt-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_notif_sound_legacy_sections_hint")}
        </p>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((r) => (
              <AdminCard key={r.type} titleKey={DOMAIN_TITLE_KEYS[r.type]}>
                <div className="space-y-3 px-1 py-2">
                  <label className="flex items-center justify-between gap-3 sam-text-body">
                    <span>{t("admin_settings_notif_enabled")}</span>
                    <input type="checkbox" checked={r.enabled} disabled readOnly />
                  </label>
                  <div className="space-y-2">
                    <span className="sam-text-body-secondary text-ui-muted">{t("admin_settings_notif_sound_file")}</span>
                    <p className="break-all sam-text-helper text-ui-muted">
                      {r.sound_url?.trim() ? r.sound_url : t("common_none")}
                    </p>
                    <AdminNotificationSoundPreview soundUrl={r.sound_url} volume={r.volume} />
                  </div>
                  <div className="flex items-center gap-3 sam-text-body">
                    <span>{t("admin_settings_notif_volume")}</span>
                    <span className="text-ui-muted">{r.volume.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-3 sam-text-body">
                    <span>{t("admin_settings_notif_repeat")}</span>
                    <span className="text-ui-muted">{r.repeat_count}</span>
                  </div>
                  <div className="flex items-center gap-3 sam-text-body">
                    <span>{t("admin_settings_notif_cooldown")}</span>
                    <span className="text-ui-muted">{r.cooldown_seconds}</span>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AdminGlobalAlertSoundSection
              titleKey="admin_settings_notification_delivery_sound_title"
              descriptionKey="admin_settings_notification_delivery_sound_desc"
              codeKey="admin_settings.store_delivery_alert_sound"
              apiPath="/api/admin/store-delivery-alert-sound"
              onAfterMutation={invalidateStoreDeliveryAlertSoundCache}
              readOnly
            />
            <AdminGlobalAlertSoundSection
              titleKey="admin_settings_notification_match_sound_title"
              descriptionKey="admin_settings_notification_match_sound_desc"
              codeKey="admin_settings.order_match_chat_alert_sound"
              apiPath="/api/admin/order-match-chat-alert-sound"
              onAfterMutation={bustOrderMatchAlertSoundCache}
              readOnly
            />
          </div>

          <div className="border-t border-ui-border pt-8">
            <p className="mb-4 rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-2 sam-text-helper text-ui-muted">
              {t("admin_notif_sound_legacy_call_policy_hint")}
            </p>
            <AdminMessengerCallSoundsSection soundFieldsReadOnly />
          </div>
        </div>
      </details>
    </div>
  );
}
