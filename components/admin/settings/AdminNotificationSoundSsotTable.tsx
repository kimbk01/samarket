"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NOTIFICATION_SOUND_DOMAINS, type NotificationSoundDomain } from "@/lib/notifications/notification-sound-types";
import { displayNotificationSoundAssetLabel } from "@/lib/notifications/notification-sound-display-filename";
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

const TH =
  "px-3 py-2.5 text-left font-medium text-sam-fg sam-text-body-secondary whitespace-nowrap";
const TD = "px-3 py-3 align-middle sam-text-body-secondary text-sam-fg";

export function AdminNotificationSoundSsotTable() {
  const { t, language } = useI18n();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [draft, setDraft] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ eventKey: string; domain: NotificationSoundDomain } | null>(null);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const sections = useMemo(() => {
    const keys: NotificationSoundDomain[] = [];
    for (const d of NOTIFICATION_SOUND_DOMAINS) {
      if (!keys.includes(d)) keys.push(d);
    }
    const grouped = new Map<string, NotificationSoundDomain[]>();
    for (const d of keys) {
      const sectionKey = DOMAIN_SECTION_KEYS[d];
      const list = grouped.get(sectionKey) ?? [];
      list.push(d);
      grouped.set(sectionKey, list);
    }
    return [...grouped.entries()];
  }, []);

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

  const uploadSoundFile = useCallback(
    async (eventKey: string, domain: NotificationSoundDomain, file: File) => {
      setUploadingKey(eventKey);
      setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("label", file.name);
        fd.append("domain", domain);
        const res = await fetch("/api/admin/notification-sound-ssot/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const j = (await res.json()) as {
          ok?: boolean;
          asset_id?: string;
          file_url?: string | null;
          error?: string;
        };
        if (!res.ok || !j.ok || !j.asset_id) {
          setErr(j.error ?? t("admin_settings_notif_upload_failed"));
          return;
        }
        const newAsset: AssetRow = {
          id: j.asset_id,
          label: file.name,
          kind: "dibay_custom",
          file_url: j.file_url ?? null,
          file_path: null,
          legacy_source: { table: "upload", original_filename: file.name },
          enabled: true,
        };
        setAssets((prev) => (prev.some((a) => a.id === newAsset.id) ? prev : [...prev, newAsset]));
        patchDraft(eventKey, { asset_id: j.asset_id, use_device_default: false });
      } catch {
        setErr(t("common_network_error_generic"));
      } finally {
        setUploadingKey(null);
      }
    },
    [patchDraft, t]
  );

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      const target = uploadTargetRef.current;
      if (!f || !target) return;
      void uploadSoundFile(target.eventKey, target.domain, f);
    },
    [uploadSoundFile]
  );

  const openFilePicker = useCallback((eventKey: string, domain: NotificationSoundDomain) => {
    uploadTargetRef.current = { eventKey, domain };
    fileInputRef.current?.click();
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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-8 text-center sam-text-body text-sam-muted">
        {t("common_loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
        className="sr-only"
        onChange={onFileChange}
      />

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-2 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="rounded-ui-rect border border-green-200 bg-green-50 px-4 py-2 sam-text-body-secondary text-green-900">
          {msg}
        </div>
      ) : null}

      {sections.map(([titleKey, domains]) => {
        const domainEvents = events.filter((e) => domains.includes(e.domain));
        if (domainEvents.length === 0) return null;
        return (
          <section
            key={titleKey}
            className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
          >
            <div className="border-b border-sam-border-soft bg-sam-app px-4 py-3 sm:px-5">
              <h2 className="sam-text-body font-semibold text-sam-fg">{t(titleKey as never)}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-app">
                    <th className={TH}>{t("admin_notif_sound_col_event")}</th>
                    <th className={`${TH} w-28`}>{t("admin_notif_sound_col_id")}</th>
                    <th className={`${TH} min-w-[12rem]`}>{t("admin_settings_notif_sound_file")}</th>
                    <th className={`${TH} w-36`}>{t("admin_settings_notif_preview")}</th>
                    <th className={`${TH} w-24 text-center`}>{t("admin_notif_sound_col_device")}</th>
                    <th className={`${TH} w-20 text-center`}>{t("admin_notif_sound_col_active")}</th>
                    <th className={`${TH} w-32 text-right`}>{t("admin_notif_sound_col_actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {domainEvents.map((ev) => {
                    const m = draft.find((x) => x.event_key === ev.event_key);
                    const assetId = m?.asset_id ?? ev.default_asset_id;
                    const asset = assetById.get(assetId);
                    const previewUrl = asset?.file_url ?? asset?.file_path ?? null;
                    const label = language === "en" ? ev.label_en : ev.label_ko;
                    const soundLabel = displayNotificationSoundAssetLabel(
                      asset,
                      t("admin_settings_notif_preview_default")
                    );
                    const isUploading = uploadingKey === ev.event_key;

                    return (
                      <tr key={ev.event_key} className="border-b border-sam-border-soft last:border-b-0">
                        <td className={TD}>
                          <span className="font-medium">{label}</span>
                        </td>
                        <td className={`${TD} font-mono sam-text-helper text-sam-muted`}>{assetId}</td>
                        <td className={TD}>
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <select
                              className="w-full rounded border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
                              value={assetId}
                              onChange={(e) => patchDraft(ev.event_key, { asset_id: e.target.value })}
                            >
                              {assets.filter((a) => a.enabled).map((a) => (
                                <option key={a.id} value={a.id}>
                                  {displayNotificationSoundAssetLabel(a, a.id)}
                                </option>
                              ))}
                            </select>
                            <span className="truncate sam-text-helper text-sam-muted" title={soundLabel}>
                              {soundLabel}
                            </span>
                          </div>
                        </td>
                        <td className={TD}>
                          <AdminNotificationSoundPreview
                            soundUrl={previewUrl}
                            volume={m?.volume ?? 0.7}
                          />
                        </td>
                        <td className={`${TD} text-center`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={m?.use_device_default === true}
                            onChange={(e) =>
                              patchDraft(ev.event_key, { use_device_default: e.target.checked })
                            }
                          />
                        </td>
                        <td className={`${TD} text-center`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={m?.enabled !== false}
                            onChange={(e) => patchDraft(ev.event_key, { enabled: e.target.checked })}
                          />
                        </td>
                        <td className={`${TD} text-right`}>
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-helper hover:bg-sam-app disabled:opacity-50"
                              disabled={isUploading || saving}
                              onClick={() => openFilePicker(ev.event_key, ev.domain)}
                            >
                              {isUploading ? t("admin_settings_notif_uploading") : t("admin_settings_notif_pick_file")}
                            </button>
                            <button
                              type="button"
                              className="rounded border border-sam-border px-2 py-1 sam-text-helper text-sam-muted hover:bg-sam-app disabled:opacity-50"
                              disabled={saving}
                              onClick={() => restoreDefault(ev.event_key, ev.default_asset_id)}
                            >
                              {t("admin_notif_sound_restore_default")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {diff && diff.length > 0 ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <div className="border-b border-sam-border-soft px-4 py-3 sm:px-5">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_notif_sound_diff_title")}</h2>
          </div>
          <div className="p-4 sm:p-5">
          <ul className="divide-y divide-sam-border-soft border border-sam-border rounded-ui-rect">
            {diff.map((d, i) => (
              <li
                key={`${d.event_key}-${d.field}-${i}`}
                className="px-3 py-2 font-mono sam-text-helper text-sam-fg"
              >
                {d.event_key}.{d.field}: {String(d.before)} → {String(d.after)}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2 border-t border-sam-border-soft pt-4">
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
              className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body hover:bg-sam-app"
              onClick={() => {
                setDiff(null);
                setConfirmToken(null);
              }}
            >
              {t("common_cancel")}
            </button>
          </div>
          </div>
        </section>
      ) : (
        <div className="sticky bottom-0 z-10 border-t border-sam-border bg-sam-surface/95 px-1 py-3 backdrop-blur-sm">
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect bg-signature px-5 py-2 sam-text-body font-medium text-white disabled:opacity-50"
            onClick={() => void previewSave()}
          >
            {saving ? t("common_saving") : t("admin_notif_sound_preview_save")}
          </button>
        </div>
      )}
    </div>
  );
}
