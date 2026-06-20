"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { invalidateNotificationSoundConfigCache } from "@/lib/notifications/notification-sound-engine";
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
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState<NotificationDomain | null>(null);
  const [clearBusy, setClearBusy] = useState<NotificationDomain | null>(null);
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

  const patchRow = useCallback((type: NotificationDomain, partial: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, ...partial } : r)));
  }, []);

  const save = useCallback(async () => {
    setSaving((prev) => (prev ? prev : true));
    setErr((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_save_failed"));
        return;
      }
      invalidateNotificationSoundConfigCache();
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setSaving((prev) => (prev ? false : prev));
    }
  }, [rows, t]);

  const uploadSoundFile = useCallback(async (type: NotificationDomain, file: File) => {
    setUploadBusy(type);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("file", file);
      const res = await fetch("/api/admin/notification-settings/upload-sound", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sound_url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.message ?? j.error ?? t("admin_settings_notif_upload_failed"));
        return;
      }
      if (typeof j.sound_url === "string") {
        patchRow(type, { sound_url: j.sound_url });
      }
      invalidateNotificationSoundConfigCache();
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setUploadBusy(null);
    }
  }, [patchRow, t]);

  const clearUploadedSound = useCallback(async (type: NotificationDomain) => {
    setClearBusy(type);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ type, sound_url: null }] }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_clear_failed"));
        return;
      }
      patchRow(type, { sound_url: null });
      invalidateNotificationSoundConfigCache();
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setClearBusy(null);
    }
  }, [patchRow, t]);

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

      <div id="messenger-call-sounds" className="border-b border-ui-border pb-8">
        <AdminMessengerCallSoundsSection />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
        <AdminCard key={r.type} titleKey={DOMAIN_TITLE_KEYS[r.type]}>
          <div className="space-y-3 px-1 py-2">
            <label className="flex items-center justify-between gap-3 sam-text-body">
              <span>{t("admin_settings_notif_enabled")}</span>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => patchRow(r.type, { enabled: e.target.checked })}
              />
            </label>
            <div className="space-y-2">
              <span className="sam-text-body-secondary text-ui-muted">{t("admin_settings_notif_sound_file")}</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
                  className="hidden"
                  id={`notif-domain-sound-${r.type}`}
                  disabled={uploadBusy === r.type}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadSoundFile(r.type, f);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor={`notif-domain-sound-${r.type}`}
                  className={`inline-flex cursor-pointer rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-1.5 sam-text-body-secondary text-ui-fg hover:bg-ui-hover ${
                    uploadBusy === r.type ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {uploadBusy === r.type ? t("admin_settings_notif_uploading") : t("admin_settings_notif_pick_file")}
                </label>
                <button
                  type="button"
                  disabled={clearBusy === r.type || uploadBusy === r.type || !r.sound_url}
                  className="rounded-ui-rect border border-ui-border px-3 py-1.5 sam-text-body-secondary text-ui-muted hover:bg-ui-hover disabled:opacity-50"
                  onClick={() => void clearUploadedSound(r.type)}
                >
                  {clearBusy === r.type ? t("admin_settings_notif_clearing") : t("admin_settings_notif_clear_upload")}
                </button>
              </div>
              <AdminNotificationSoundPreview soundUrl={r.sound_url} volume={r.volume} />
            </div>
            <label className="flex items-center gap-3 sam-text-body">
              {t("admin_settings_notif_volume")}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={r.volume}
                onChange={(e) => patchRow(r.type, { volume: Number(e.target.value) })}
              />
              <span className="text-ui-muted">{r.volume.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-3 sam-text-body">
              {t("admin_settings_notif_repeat")}
              <input
                type="number"
                min={1}
                max={5}
                className="w-16 rounded-ui-rect border border-ui-border px-2 py-1"
                value={r.repeat_count}
                onChange={(e) =>
                  patchRow(r.type, {
                    repeat_count: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-3 sam-text-body">
              {t("admin_settings_notif_cooldown")}
              <input
                type="number"
                min={0}
                max={600}
                className="w-20 rounded-ui-rect border border-ui-border px-2 py-1"
                value={r.cooldown_seconds}
                onChange={(e) =>
                  patchRow(r.type, {
                    cooldown_seconds: Math.max(0, Math.min(600, Number(e.target.value) || 0)),
                  })
                }
              />
            </label>
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
        />
        <AdminGlobalAlertSoundSection
          titleKey="admin_settings_notification_match_sound_title"
          descriptionKey="admin_settings_notification_match_sound_desc"
          codeKey="admin_settings.order_match_chat_alert_sound"
          apiPath="/api/admin/order-match-chat-alert-sound"
          onAfterMutation={bustOrderMatchAlertSoundCache}
        />
      </div>

      <button
        type="button"
        disabled={saving}
        className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        onClick={() => void save()}
      >
        {saving ? t("common_saving") : t("common_save")}
      </button>
    </div>
  );
}
