"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NOTIFICATION_SOUND_DOMAINS, type NotificationSoundDomain } from "@/lib/notifications/notification-sound-types";
import { AdminNotificationSoundPreview } from "@/components/admin/settings/AdminNotificationSoundPreview";

type AssetRow = {
  id: string;
  label: string;
  kind: string;
  file_url: string | null;
  file_path: string | null;
  legacy_source: unknown;
  enabled: boolean;
};

type EventRow = {
  event_key: string;
  label_ko: string;
  label_en: string;
  domain: NotificationSoundDomain;
  audience: string;
  direction: string;
  default_asset_id: string;
  enabled: boolean;
  legacy_source: unknown;
};

type MappingRow = {
  event_key: string;
  asset_id: string;
  use_device_default: boolean;
  volume: number;
  repeat_count: number;
  enabled: boolean;
};

type DiffRow = { field: string; event_key: string; before: unknown; after: unknown };

const DOMAIN_SECTION_KEYS: Record<NotificationSoundDomain, string> = {
  system: "admin_notif_sound_section_system",
  messenger_direct: "admin_notif_sound_section_messenger_direct",
  messenger_group: "admin_notif_sound_section_messenger_group",
  trade: "admin_notif_sound_section_trade",
  delivery_user: "admin_notif_sound_section_delivery_user",
  delivery_owner: "admin_notif_sound_section_delivery_owner",
  call_voice: "admin_notif_sound_section_call",
  call_video: "admin_notif_sound_section_call",
  admin: "admin_notif_sound_section_admin",
  settlement: "admin_notif_sound_section_settlement",
  community: "admin_notif_sound_section_community",
};

export function AdminNotificationSoundSsotTable() {
  const { t, language } = useI18n();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [draft, setDraft] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-sound-ssot", { credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        assets?: AssetRow[];
        events?: EventRow[];
        mappings?: MappingRow[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_load_failed"));
        return;
      }
      setAssets(j.assets ?? []);
      setEvents(j.events ?? []);
      const m = j.mappings ?? [];
      setMappings(m);
      setDraft(m.map((x) => ({ ...x })));
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = useCallback((eventKey: string, partial: Partial<MappingRow>) => {
    setDraft((prev) =>
      prev.map((r) => (r.event_key === eventKey ? { ...r, ...partial } : r))
    );
  }, []);

  const previewSave = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    setDiff(null);
    setConfirmToken(null);
    try {
      const res = await fetch("/api/admin/notification-sound-ssot", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: draft }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        preview?: boolean;
        diff?: DiffRow[];
        confirm_token?: string;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_save_failed"));
        return;
      }
      if (j.preview && j.confirm_token) {
        setDiff(j.diff ?? []);
        setConfirmToken(j.confirm_token);
        return;
      }
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setSaving(false);
    }
  }, [draft, t]);

  const commitSave = useCallback(async () => {
    if (!confirmToken) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-sound-ssot", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_token: confirmToken }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_save_failed"));
        return;
      }
      setDiff(null);
      setConfirmToken(null);
      setMsg(t("admin_notif_sound_save_ok"));
      await load();
      const previewRes = await fetch("/api/admin/notification-sound-ssot/preview-resolver", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_keys: ["messenger_direct_message_received", "delivery_order_created_owner"],
        }),
      });
      void previewRes.json().catch(() => ({}));
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setSaving(false);
    }
  }, [confirmToken, load, t]);

  const restoreDefault = useCallback(
    (eventKey: string, defaultAssetId: string) => {
      patchDraft(eventKey, {
        asset_id: defaultAssetId,
        use_device_default: false,
        enabled: true,
      });
    },
    [patchDraft]
  );

  if (loading) {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-4 sam-text-body text-ui-muted">
        {t("common_loading")}
      </div>
    );
  }

  const sections = NOTIFICATION_SOUND_DOMAINS.filter(
    (d, i, arr) => arr.indexOf(d) === i
  );

  return (
    <div className="space-y-6">
      <p className="sam-text-body text-ui-muted">{t("admin_notif_sound_ssot_intro")}</p>
      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="rounded-ui-rect border border-green-200 bg-green-50 px-3 py-2 sam-text-body-secondary text-green-900">
          {msg}
        </div>
      ) : null}

      {sections.map((domain) => {
        const domainEvents = events.filter((e) => e.domain === domain);
        if (domainEvents.length === 0) return null;
        const titleKey = DOMAIN_SECTION_KEYS[domain];
        return (
          <AdminCard key={domain} titleKey={titleKey as never}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-ui-border text-left text-ui-muted">
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_id")}</th>
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_event")}</th>
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_role")}</th>
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_direction")}</th>
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_sound")}</th>
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_device")}</th>
                    <th className="py-2 pr-2">{t("admin_notif_sound_col_active")}</th>
                    <th className="py-2">{t("admin_notif_sound_col_actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {domainEvents.map((ev) => {
                    const m = draft.find((x) => x.event_key === ev.event_key);
                    const asset = m ? assetById.get(m.asset_id) : assetById.get(ev.default_asset_id);
                    const previewUrl = asset?.file_url ?? asset?.file_path ?? null;
                    const label = language === "en" ? ev.label_en : ev.label_ko;
                    const legacy = ev.legacy_source ?? asset?.legacy_source;
                    return (
                      <tr key={ev.event_key} className="border-b border-ui-border/60 align-top">
                        <td className="py-2 pr-2 font-mono sam-text-helper">{m?.asset_id ?? ev.default_asset_id}</td>
                        <td className="py-2 pr-2">
                          <div className="font-medium text-ui-fg">{label}</div>
                          <div className="font-mono sam-text-xxs text-ui-muted">{ev.event_key}</div>
                          {legacy ? (
                            <span className="mt-1 inline-block rounded bg-ui-hover px-1.5 py-0.5 sam-text-xxs text-ui-muted">
                              {t("admin_notif_sound_legacy_badge")}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-2">{ev.audience}</td>
                        <td className="py-2 pr-2">{ev.direction}</td>
                        <td className="py-2 pr-2">
                          <select
                            className="w-full max-w-[12rem] rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1"
                            value={m?.asset_id ?? ev.default_asset_id}
                            onChange={(e) => patchDraft(ev.event_key, { asset_id: e.target.value })}
                          >
                            {assets.filter((a) => a.enabled).map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.id} — {a.label}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1">
                            <AdminNotificationSoundPreview
                              soundUrl={previewUrl}
                              volume={m?.volume ?? 0.7}
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={m?.use_device_default === true}
                            onChange={(e) =>
                              patchDraft(ev.event_key, { use_device_default: e.target.checked })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={m?.enabled !== false}
                            onChange={(e) => patchDraft(ev.event_key, { enabled: e.target.checked })}
                          />
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="rounded-ui-rect border border-ui-border px-2 py-1 sam-text-helper hover:bg-ui-hover"
                            onClick={() => restoreDefault(ev.event_key, ev.default_asset_id)}
                          >
                            {t("admin_notif_sound_restore_default")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AdminCard>
        );
      })}

      {diff && diff.length > 0 ? (
        <AdminCard titleKey={"admin_notif_sound_diff_title" as never}>
          <ul className="space-y-1 sam-text-body-secondary">
            {diff.map((d, i) => (
              <li key={`${d.event_key}-${d.field}-${i}`} className="font-mono sam-text-helper">
                {d.event_key}.{d.field}: {String(d.before)} → {String(d.after)}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void commitSave()}
            >
              {saving ? t("common_saving") : t("admin_notif_sound_confirm_save")}
            </button>
            <button
              type="button"
              className="rounded-ui-rect border border-ui-border px-4 py-2 sam-text-body hover:bg-ui-hover"
              onClick={() => {
                setDiff(null);
                setConfirmToken(null);
              }}
            >
              {t("common_cancel")}
            </button>
          </div>
        </AdminCard>
      ) : (
        <button
          type="button"
          disabled={saving}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
          onClick={() => void previewSave()}
        >
          {saving ? t("common_saving") : t("admin_notif_sound_preview_save")}
        </button>
      )}

      <details className="rounded-ui-rect border border-ui-border bg-ui-surface/50 p-3">
        <summary className="cursor-pointer sam-text-body-secondary text-ui-muted">
          {t("admin_notif_sound_legacy_sections")}
        </summary>
        <p className="mt-2 sam-text-helper text-ui-muted">{t("admin_notif_sound_legacy_sections_hint")}</p>
      </details>
    </div>
  );
}
