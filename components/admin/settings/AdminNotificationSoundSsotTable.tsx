"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Music } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NOTIFICATION_SOUND_DOMAINS, type NotificationSoundDomain } from "@/lib/notifications/notification-sound-types";
import { displayNotificationSoundAssetLabel } from "@/lib/notifications/notification-sound-display-filename";
import { AdminNotificationSoundPreview } from "@/components/admin/settings/AdminNotificationSoundPreview";
import { SOUND_MAX_BYTES } from "@/lib/notifications/notification-sound-ssot-admin-validation";
import {
  getRepeatPolicy,
  isRepeatRingEvent,
} from "@/lib/notifications/notification-sound-ssot-repeat-policy";

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
  cooldown_seconds?: number;
  enabled: boolean;
};

const ALLOWED_SOUND_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

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

function defaultMappingFromEvent(ev: EventRow): MappingRow {
  return {
    event_key: ev.event_key,
    asset_id: ev.default_asset_id,
    use_device_default: false,
    volume: 0.7,
    repeat_count: 1,
    cooldown_seconds: 0,
    enabled: ev.enabled,
  };
}

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

function rowForSave(row: MappingRow): MappingRow {
  if (isRepeatRingEvent(row.event_key)) return row;
  return { ...row, repeat_count: 1 };
}

const DEFAULT_VOLUME = 0.7;

type SoundSourceKind = "device" | "dibay" | "custom";

function resolveSoundSource(mapping: MappingRow, asset: AssetRow | undefined): SoundSourceKind {
  if (mapping.use_device_default === true) return "device";
  if (asset?.kind === "dibay_custom") return "custom";
  return "dibay";
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
  mapping: MappingRow;
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
  const assetId = mapping.asset_id;
  const asset = assetById.get(assetId);
  const previewUrl = asset?.file_url ?? asset?.file_path ?? null;
  const label = language === "en" ? ev.label_en : ev.label_ko;
  const dirty = isRowDirty(mapping, baseline);
  const repeatPolicy = getRepeatPolicy(ev.event_key);
  const selectedSource = resolveSoundSource(mapping, asset);
  const hasCustomAsset = asset?.kind === "dibay_custom";
  const currentVolume = mapping.volume ?? DEFAULT_VOLUME;
  const volumePct = Math.round(currentVolume * 100);
  const defaultVolumePct = Math.round(DEFAULT_VOLUME * 100);
  const soundFileName = displayNotificationSoundAssetLabel(
    asset,
    t("admin_settings_notif_preview_default")
  );
  const savedBaselineAsset = baseline ? assetById.get(baseline.asset_id) : undefined;
  const savedFileName = displayNotificationSoundAssetLabel(
    savedBaselineAsset,
    t("admin_settings_notif_preview_default")
  );

  const handleSourceChange = (src: SoundSourceKind) => {
    if (src === "device") {
      onPatch({ use_device_default: true });
      return;
    }
    if (src === "dibay") {
      onPatch({ use_device_default: false, asset_id: ev.default_asset_id });
      return;
    }
    onPatch({ use_device_default: false });
  };

  return (
    <div className="space-y-3 border-b border-sam-border-soft px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="sam-text-body font-medium text-sam-fg">{label}</span>
          <span
            className={`rounded-full px-2 py-0.5 sam-text-helper ${
              repeatPolicy === "repeat"
                ? "bg-amber-100 text-amber-900"
                : "bg-sam-app text-sam-muted"
            }`}
          >
            {repeatPolicy === "repeat"
              ? t("admin_notif_sound_policy_repeat")
              : t("admin_notif_sound_policy_once")}
          </span>
          {baseline ? (
            dirty ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 sam-text-helper text-amber-900">
                {t("admin_notif_sound_unsaved_badge")}
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 sam-text-helper text-green-900">
                {t("admin_notif_sound_applied_badge")}
              </span>
            )
          ) : null}
        </div>
        <label className="flex items-center gap-2 sam-text-body-secondary text-sam-muted">
          {t("admin_notif_sound_col_active")}
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={mapping.enabled !== false}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="sam-text-helper font-medium text-sam-muted">{t("admin_notif_sound_col_sound")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(
            [
              ["device", "admin_notif_sound_source_device"],
              ["dibay", "admin_notif_sound_source_dibay"],
              ["custom", "admin_notif_sound_source_custom"],
            ] as const
          ).map(([src, labelKey]) => (
            <label key={src} className="flex cursor-pointer items-center gap-2 sam-text-body-secondary text-sam-fg">
              <input
                type="radio"
                name={`notif-sound-source-${ev.event_key}`}
                className="h-4 w-4"
                checked={selectedSource === src}
                onChange={() => handleSourceChange(src)}
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
        {!mapping.use_device_default ? (
          <div className="flex flex-wrap items-center gap-2">
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
                <Music className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
            </button>
            {!hasCustomAsset ? (
              <span className="sam-text-helper text-sam-muted">{t("admin_notif_sound_custom_upload_hint")}</span>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sam-text-body-secondary text-sam-muted">
        <span>
          {t("admin_notif_sound_volume_default")}: {defaultVolumePct}%
        </span>
        <label className="flex min-w-[12rem] flex-1 items-center gap-2">
          <span className="shrink-0">{t("admin_notif_sound_volume_current")}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePct}
            className="min-w-[6rem] flex-1"
            onChange={(e) => onPatch({ volume: Number(e.target.value) / 100 })}
          />
          <span className="w-10 shrink-0 tabular-nums">{volumePct}%</span>
        </label>
        <button
          type="button"
          className="rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper text-sam-muted hover:bg-sam-app disabled:opacity-50"
          disabled={volumePct === defaultVolumePct}
          onClick={() => onPatch({ volume: DEFAULT_VOLUME })}
        >
          {t("admin_notif_sound_volume_reset")}
        </button>
      </div>

      {repeatPolicy === "repeat" ? (
        <label className="flex flex-wrap items-center gap-2 sam-text-body-secondary text-sam-muted">
          {t("admin_settings_notif_repeat")}
          <select
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-body text-sam-fg"
            value={mapping.repeat_count}
            onChange={(e) => onPatch({ repeat_count: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
        <AdminNotificationSoundPreview soundUrl={previewUrl} volume={currentVolume} />

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
  const { t, safeT, language } = useI18n();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ eventKey: string; domain: NotificationSoundDomain } | null>(null);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const eventsByKey = useMemo(() => new Map(events.map((e) => [e.event_key, e])), [events]);
  const baselineByKey = useMemo(() => new Map(baseline.map((r) => [r.event_key, r])), [baseline]);

  const formatSaveError = useCallback(
    (payload: { error?: string; field?: string; max?: number }) => {
      const code = payload.error ?? "";
      const known: Record<string, string> = {
        file_url_too_long: t("admin_notif_sound_url_too_long"),
        legacy_mirror_url_too_long: t("admin_notif_sound_legacy_url_too_long"),
        label_too_long: t("admin_notif_sound_label_too_long"),
        "invalid cooldown_seconds": t("admin_notif_sound_cooldown_invalid"),
        repeat_not_allowed_for_once_event: t("admin_notif_sound_repeat_once_warning"),
      };
      if (known[code]) return known[code];
      if (payload.field) {
        return safeT("admin_notif_sound_save_failed_field", {
          fallbackKo: `저장 실패 (${payload.field})`,
          fallbackEn: `Save failed (${payload.field})`,
          vars: { field: payload.field },
        });
      }
      return code || t("admin_settings_notif_save_failed");
    },
    [safeT, t]
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

  const applyPayload = useCallback(
    (payload: { assets?: AssetRow[]; events?: EventRow[]; mappings?: MappingRow[] }) => {
      setAssets(payload.assets ?? []);
      setEvents(payload.events ?? []);
      const m = (payload.mappings ?? []).map((x) => ({ ...x }));
      setDraft(m.map((x) => ({ ...x })));
      setBaseline(m);
    },
    []
  );

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
      applyPayload(j);
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setLoading(false);
    }
  }, [applyPayload, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = useCallback(
    (eventKey: string, partial: Partial<MappingRow>) => {
      if (!isRepeatRingEvent(eventKey) && partial.repeat_count != null && partial.repeat_count > 1) {
        setErr(t("admin_notif_sound_repeat_once_warning"));
        return;
      }
      setDraft((prev) => {
        const idx = prev.findIndex((r) => r.event_key === eventKey);
        if (idx >= 0) {
          return prev.map((r) => (r.event_key === eventKey ? { ...r, ...partial } : r));
        }
        const ev = eventsByKey.get(eventKey);
        if (!ev) return prev;
        return [...prev, { ...defaultMappingFromEvent(ev), ...partial }];
      });
    },
    [eventsByKey, t]
  );

  const uploadSoundFile = useCallback(
    async (eventKey: string, domain: NotificationSoundDomain, file: File) => {
      if (file.size > SOUND_MAX_BYTES) {
        setErr(t("admin_notif_sound_file_too_large"));
        return;
      }
      const mime = file.type || "application/octet-stream";
      if (!ALLOWED_SOUND_MIME.has(mime)) {
        setErr(t("admin_settings_notif_upload_failed"));
        return;
      }

      setUploadingKey(eventKey);
      setErr(null);
      setMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("label", file.name.slice(0, 255));
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
        setMsg(t("admin_notif_sound_upload_ok_apply"));
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

  const saveRow = useCallback(
    async (eventKey: string) => {
      const row = draft.find((r) => r.event_key === eventKey);
      const base = baselineByKey.get(eventKey);
      if (!row || !isRowDirty(row, base)) return;

      setSaving(true);
      setSavingKey(eventKey);
      setErr(null);
      setMsg(null);
      try {
        const res = await fetch("/api/admin/notification-sound-ssot", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings: [rowForSave(row)] }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          assets?: AssetRow[];
          events?: EventRow[];
          mappings?: MappingRow[];
          error?: string;
          field?: string;
          max?: number;
          ssot_committed?: boolean;
        };
        if (!res.ok || !j.ok) {
          setErr(formatSaveError(j));
          return;
        }
        applyPayload(j);
        setMsg(t("admin_notif_sound_save_ok"));
      } catch {
        setErr(t("common_network_error_generic"));
      } finally {
        setSaving(false);
        setSavingKey(null);
      }
    },
    [applyPayload, baselineByKey, draft, formatSaveError, t]
  );

  const restoreDefault = useCallback(
    (eventKey: string, defaultAssetId: string) => {
      patchDraft(eventKey, {
        asset_id: defaultAssetId,
        use_device_default: false,
        enabled: true,
        repeat_count: 1,
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
      <p className="sam-text-helper text-sam-muted">{t("admin_notif_sound_ssot_limits_hint")}</p>

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
                const m =
                  draft.find((x) => x.event_key === ev.event_key) ?? defaultMappingFromEvent(ev);
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
                    onSave={() => void saveRow(ev.event_key)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
