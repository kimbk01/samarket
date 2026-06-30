"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
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

function mappingSnapshot(row: MappingRow): string {
  return JSON.stringify({
    asset_id: row.asset_id,
    use_device_default: row.use_device_default,
    volume: row.volume,
    repeat_count: row.repeat_count,
    enabled: row.enabled,
  });
}

function isRowDirty(row: MappingRow | undefined, baseline: MappingRow | undefined): boolean {
  if (!row || !baseline) return false;
  return mappingSnapshot(row) !== mappingSnapshot(baseline);
}

function NotificationSoundSsotRow({
  ev,
  mapping,
  baseline,
  assetById,
  language,
  isUploading,
  isSaving,
  onPatch,
  onUpload,
  onRestore,
  onSave,
}: {
  ev: EventRow;
  mapping: MappingRow | undefined;
  baseline: MappingRow | undefined;
  assetById: Map<string, AssetRow>;
  language: string;
  isUploading: boolean;
  isSaving: boolean;
  onPatch: (partial: Partial<MappingRow>) => void;
  onUpload: () => void;
  onRestore: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const assetId = mapping?.asset_id ?? ev.default_asset_id;
  const asset = assetById.get(assetId);
  const previewUrl = asset?.file_url ?? asset?.file_path ?? null;
  const label = language === "en" ? ev.label_en : ev.label_ko;
  const dirty = isRowDirty(mapping, baseline);
  const soundFileName = displayNotificationSoundAssetLabel(
    asset,
    t("admin_settings_notif_preview_default")
  );
  const savedBaselineAsset = baseline ? assetById.get(baseline.asset_id) : undefined;
  const savedFileName = displayNotificationSoundAssetLabel(
    savedBaselineAsset,
    t("admin_settings_notif_preview_default")
  );

  return (
    <div className="space-y-3 border-b border-sam-border-soft px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="sam-text-body font-medium text-sam-fg">{label}</span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 sam-text-body-secondary text-sam-muted">
            {t("admin_notif_sound_col_device")}
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={mapping?.use_device_default === true}
              onChange={(e) => onPatch({ use_device_default: e.target.checked })}
            />
          </label>
          <label className="flex items-center gap-2 sam-text-body-secondary text-sam-muted">
            {t("admin_notif_sound_col_active")}
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={mapping?.enabled !== false}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
            />
          </label>
        </div>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
        <p className="sam-text-helper text-sam-muted">{t("admin_notif_sound_current_file")}</p>
        <p className="truncate sam-text-body-secondary font-medium text-sam-fg" title={soundFileName}>
          {soundFileName}
        </p>
        {!dirty && baseline ? (
          <p className="mt-1 truncate sam-text-helper text-green-800" title={savedFileName}>
            {t("admin_notif_sound_saved_file")}: {savedFileName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AdminNotificationSoundPreview soundUrl={previewUrl} volume={mapping?.volume ?? 0.7} />

        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app disabled:opacity-50"
          disabled={isUploading || isSaving}
          onClick={onUpload}
          aria-label={t("admin_settings_notif_pick_file")}
          title={t("admin_settings_notif_pick_file")}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
          )}
        </button>

        <button
          type="button"
          className="rounded-ui-rect border border-sam-border px-3 py-1 sam-text-helper text-sam-muted hover:bg-sam-app disabled:opacity-50"
          disabled={isSaving}
          onClick={onRestore}
        >
          {t("admin_notif_sound_restore_default")}
        </button>

        <button
          type="button"
          className="rounded-ui-rect bg-signature px-3 py-1 sam-text-helper font-medium text-white disabled:opacity-50"
          disabled={!dirty || isSaving || isUploading}
          onClick={onSave}
        >
          {isSaving ? t("common_saving") : t("admin_notif_sound_row_save")}
        </button>
      </div>
    </div>
  );
}

export function AdminNotificationSoundSsotTable() {
  const { t, language } = useI18n();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [draft, setDraft] = useState<MappingRow[]>([]);
  const [baseline, setBaseline] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ eventKey: string; domain: NotificationSoundDomain } | null>(null);
  const pendingSaveKeysRef = useRef<string[]>([]);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const buildSaveMsg = useCallback(
    (eventKeys: string[]) => {
      if (eventKeys.length === 1) {
        const row = draft.find((r) => r.event_key === eventKeys[0]);
        const name = displayNotificationSoundAssetLabel(
          row ? assetById.get(row.asset_id) : undefined,
          t("admin_settings_notif_preview_default")
        );
        return `${t("admin_notif_sound_saved_file")}: ${name}`;
      }
      return t("admin_notif_sound_save_ok");
    },
    [assetById, draft, t]
  );

  const baselineByKey = useMemo(() => new Map(baseline.map((r) => [r.event_key, r])), [baseline]);

  const anyDirty = useMemo(
    () => draft.some((row) => isRowDirty(row, baselineByKey.get(row.event_key))),
    [draft, baselineByKey]
  );

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
      const snapshot = m.map((x) => ({ ...x }));
      setDraft(snapshot.map((x) => ({ ...x })));
      setBaseline(snapshot);
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

  const previewSaveMappings = useCallback(
    async (mappings: MappingRow[], scopeKey: string | null) => {
      setSaving(true);
      if (scopeKey) setSavingKey(scopeKey);
      pendingSaveKeysRef.current = mappings.map((m) => m.event_key);
      setErr(null);
      setMsg(null);
      setDiff(null);
      setConfirmToken(null);
      try {
        const res = await fetch("/api/admin/notification-sound-ssot", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings }),
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
          const diffRows = j.diff ?? [];
          if (diffRows.length === 0) {
            const commitRes = await fetch("/api/admin/notification-sound-ssot", {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirm_token: j.confirm_token }),
            });
            const cj = (await commitRes.json()) as { ok?: boolean; error?: string };
            if (!commitRes.ok || !cj.ok) {
              setErr(cj.error ?? t("admin_settings_notif_save_failed"));
              return;
            }
            setMsg(buildSaveMsg(pendingSaveKeysRef.current));
            await load();
            return;
          }
          setDiff(diffRows);
          setConfirmToken(j.confirm_token);
        }
      } catch {
        setErr(t("common_network_error_generic"));
      } finally {
        setSaving(false);
        setSavingKey(null);
      }
    },
    [buildSaveMsg, load, t]
  );

  const previewSaveAll = useCallback(async () => {
    const dirtyMappings = draft.filter((row) =>
      isRowDirty(row, baselineByKey.get(row.event_key))
    );
    if (dirtyMappings.length === 0) return;
    pendingSaveKeysRef.current = dirtyMappings.map((m) => m.event_key);
    await previewSaveMappings(dirtyMappings, null);
  }, [draft, baselineByKey, previewSaveMappings]);

  const previewRowSave = useCallback(
    async (eventKey: string) => {
      const row = draft.find((r) => r.event_key === eventKey);
      if (!row || !isRowDirty(row, baselineByKey.get(eventKey))) return;
      await previewSaveMappings([row], eventKey);
    },
    [draft, baselineByKey, previewSaveMappings]
  );

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
      setMsg(buildSaveMsg(pendingSaveKeysRef.current));
      await load();
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setSaving(false);
      setSavingKey(null);
    }
  }, [buildSaveMsg, confirmToken, load, t]);

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
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_notif_sound_ssot_intro")}</p>

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
            <div>
              {domainEvents.map((ev) => {
                const m = draft.find((x) => x.event_key === ev.event_key);
                return (
                  <NotificationSoundSsotRow
                    key={ev.event_key}
                    ev={ev}
                    mapping={m}
                    baseline={baselineByKey.get(ev.event_key)}
                    assetById={assetById}
                    language={language}
                    isUploading={uploadingKey === ev.event_key}
                    isSaving={saving && savingKey === ev.event_key}
                    onPatch={(partial) => patchDraft(ev.event_key, partial)}
                    onUpload={() => openFilePicker(ev.event_key, ev.domain)}
                    onRestore={() => restoreDefault(ev.event_key, ev.default_asset_id)}
                    onSave={() => void previewRowSave(ev.event_key)}
                  />
                );
              })}
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
            <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border">
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
      ) : anyDirty ? (
        <div className="sticky bottom-0 z-10 border-t border-sam-border bg-sam-surface/95 px-1 py-3 backdrop-blur-sm">
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect bg-signature px-5 py-2 sam-text-body font-medium text-white disabled:opacity-50"
            onClick={() => void previewSaveAll()}
          >
            {saving ? t("common_saving") : t("admin_notif_sound_save_all")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
