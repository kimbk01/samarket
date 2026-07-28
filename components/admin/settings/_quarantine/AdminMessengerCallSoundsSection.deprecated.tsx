/**
 * QUARANTINE — dead product UI (2026-07-28).
 * Import count was 0. Call sound authority is Admin Notification Sound SSOT only:
 * `/admin/settings/notifications` → AdminNotificationSoundSsotTable.
 * DO NOT remount this component as an admin settings entry.
 * Legacy table `admin_messenger_call_sound_settings` remains a derived mirror for native config API.
 */
"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { invalidateMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";
import { invalidateMessengerCallAdminPolicyCache } from "@/lib/community-messenger/messenger-call-admin-policy";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Row = Record<string, unknown> | null;

function SoundFieldRow({
  label,
  enabledKey,
  urlKey,
  row,
  onPatch,
  onTest,
  onUploadFile,
  readOnly = false,
}: {
  label: string;
  enabledKey: string;
  urlKey: string;
  row: Row;
  onPatch: (p: Record<string, unknown>) => void;
  onTest: (url: string) => void;
  onUploadFile?: (file: File) => Promise<void>;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const enabled = row?.[enabledKey] !== false;
  const url = typeof row?.[urlKey] === "string" ? (row[urlKey] as string) : "";

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !onUploadFile) return;
    setUploading(true);
    void onUploadFile(f).finally(() => setUploading(false));
  };

  return (
    <div className="space-y-2 border-b border-ui-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="sam-text-body font-medium text-ui-fg">{label}</span>
        <label className="flex items-center gap-2 sam-text-body-secondary text-ui-muted">
          {t("admin_settings_call_use_enabled")}
          <input
            type="checkbox"
            checked={enabled}
            disabled={readOnly}
            onChange={(e) => {
              if (readOnly) return;
              onPatch({ [enabledKey]: e.target.checked });
            }}
          />
        </label>
      </div>
      <input
        type="url"
        value={url}
        readOnly={readOnly}
        placeholder={t("admin_settings_call_url_placeholder")}
        className="w-full rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5 sam-text-body-secondary text-ui-fg disabled:cursor-not-allowed disabled:opacity-70"
        onChange={(e) => {
          if (readOnly) return;
          onPatch({ [urlKey]: e.target.value || null });
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-ui-rect border border-ui-border px-3 py-1 sam-text-helper text-ui-fg hover:bg-ui-hover active:bg-ui-hover"
          disabled={!url.trim()}
          onClick={() => onTest(url.trim())}
        >
          {t("admin_settings_call_preview")}
        </button>
        {!readOnly ? (
          <>
            <button
              type="button"
              className="rounded-ui-rect border border-ui-border px-3 py-1 sam-text-helper text-ui-muted hover:bg-ui-hover active:bg-ui-hover"
              onClick={() => onPatch({ [urlKey]: null, [enabledKey]: true })}
              title={t("admin_settings_call_reset_default_title")}
            >
              {t("admin_settings_call_reset_default")}
            </button>
            {onUploadFile ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
                  className="hidden"
                  onChange={onFileChange}
                />
                <button
                  type="button"
                  className="rounded-ui-rect border border-ui-border px-3 py-1 sam-text-helper text-ui-fg hover:bg-ui-hover active:bg-ui-hover disabled:opacity-50"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? t("admin_settings_notif_uploading") : t("admin_settings_call_upload")}
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function DefaultFallbackSoundField({
  row,
  onPatch,
  onUploadFile,
  onTest,
  readOnly = false,
}: {
  row: Row;
  onPatch: (p: Record<string, unknown>) => void;
  onUploadFile: (file: File) => Promise<void>;
  onTest: (url: string) => void;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = typeof row?.default_fallback_sound_url === "string" ? (row.default_fallback_sound_url as string) : "";

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    void onUploadFile(f).finally(() => setUploading(false));
  };

  return (
    <div className="space-y-2 py-3">
      <label className="flex items-center justify-between gap-3 sam-text-body">
        <span>{t("admin_settings_call_custom_enabled")}</span>
        <input
          type="checkbox"
          checked={row?.use_custom_sounds !== false}
          disabled={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            onPatch({ use_custom_sounds: e.target.checked });
          }}
        />
      </label>
      <p className="sam-text-helper text-ui-muted">{t("admin_settings_call_fallback_hint")}</p>
      <p className="sam-text-body-secondary font-medium text-ui-fg">{t("admin_settings_call_fallback_url")}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          type="url"
          value={url}
          readOnly={readOnly}
          placeholder={t("admin_settings_call_optional")}
          className="min-w-0 flex-1 rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5 sam-text-body-secondary disabled:cursor-not-allowed disabled:opacity-70"
          onChange={(e) => {
            if (readOnly) return;
            onPatch({ default_fallback_sound_url: e.target.value || null });
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-ui-rect border border-ui-border px-3 py-1.5 sam-text-helper text-ui-fg hover:bg-ui-hover active:bg-ui-hover disabled:opacity-50"
            disabled={!url.trim()}
            onClick={() => onTest(url.trim())}
          >
            {t("admin_settings_call_preview")}
          </button>
          {!readOnly ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
                className="hidden"
                onChange={onFileChange}
              />
              <button
                type="button"
                className="rounded-ui-rect border border-ui-border px-3 py-1.5 sam-text-helper text-ui-fg hover:bg-ui-hover active:bg-ui-hover disabled:opacity-50"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? t("admin_settings_notif_uploading") : t("admin_settings_call_upload")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const CALL_POLICY_PATCH_KEYS = [
  "incoming_ring_timeout_seconds",
  "incoming_ringtone_volume",
  "busy_auto_reject_enabled",
  "repeated_call_cooldown_seconds",
  "suppress_incoming_local_notifications",
] as const;

export function AdminMessengerCallSoundsSection({
  soundFieldsReadOnly = false,
}: {
  /** When true, sound URL/enabled fields are display-only; save sends call policy keys only. */
  soundFieldsReadOnly?: boolean;
}) {
  const { t } = useI18n();
  const [row, setRow] = useState<Row>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/messenger-call-sounds", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; row?: Record<string, unknown>; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_load_failed"));
        return;
      }
      setRow(j.row ?? null);
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchLocal = useCallback((partial: Record<string, unknown>) => {
    setRow((prev) => ({ ...(prev ?? {}), ...partial }));
  }, []);

  const uploadSoundFile = useCallback(
    async (urlKey: string, file: File) => {
      setErr(null);
      const form = new FormData();
      form.append("urlKey", urlKey);
      form.append("file", file);
      const res = await fetch("/api/admin/messenger-call-sounds/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sound_url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok || !j.sound_url) {
        setErr(j.message ?? j.error ?? t("admin_settings_notif_upload_failed"));
        return;
      }
      patchLocal({ [urlKey]: j.sound_url });
      invalidateMessengerCallSoundConfigCache();
      invalidateMessengerCallAdminPolicyCache();
    },
    [patchLocal, t]
  );

  const save = useCallback(async () => {
    if (!row) return;
    setSaving(true);
    setErr(null);
    try {
      const body = soundFieldsReadOnly
        ? Object.fromEntries(
            CALL_POLICY_PATCH_KEYS.filter((k) => k in row).map((k) => [k, row[k]])
          )
        : row;
      const res = await fetch("/api/admin/messenger-call-sounds", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_settings_notif_save_failed"));
        return;
      }
      invalidateMessengerCallSoundConfigCache();
      invalidateMessengerCallAdminPolicyCache();
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setSaving(false);
    }
  }, [row, soundFieldsReadOnly, t]);

  const testPlay = useCallback(
    (url: string) => {
      try {
        const a = new Audio(url);
        a.crossOrigin = "anonymous";
        void a.play();
      } catch {
        setErr(t("admin_settings_call_play_failed"));
      }
    },
    [t]
  );

  if (loading) {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-4 sam-text-body-secondary text-ui-muted">
        {t("admin_settings_call_loading")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="sam-text-body-lg font-semibold text-ui-fg">{t("admin_settings_call_title")}</h2>
      <p className="sam-text-body-secondary text-ui-muted">{t("admin_settings_call_intro")}</p>
      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">{err}</div>
      ) : null}

      <AdminCard titleKey="admin_settings_call_voice">
        <SoundFieldRow
          label={t("admin_settings_call_incoming_bell")}
          enabledKey="voice_incoming_enabled"
          urlKey="voice_incoming_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={
            soundFieldsReadOnly ? undefined : (file) => uploadSoundFile("voice_incoming_sound_url", file)
          }
        />
        <SoundFieldRow
          label={t("admin_settings_call_outgoing_ringback")}
          enabledKey="voice_outgoing_ringback_enabled"
          urlKey="voice_outgoing_ringback_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={
            soundFieldsReadOnly ? undefined : (file) => uploadSoundFile("voice_outgoing_ringback_url", file)
          }
        />
      </AdminCard>

      <AdminCard titleKey="admin_settings_call_video">
        <SoundFieldRow
          label={t("admin_settings_call_incoming_bell")}
          enabledKey="video_incoming_enabled"
          urlKey="video_incoming_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={
            soundFieldsReadOnly ? undefined : (file) => uploadSoundFile("video_incoming_sound_url", file)
          }
        />
        <SoundFieldRow
          label={t("admin_settings_call_outgoing_ringback")}
          enabledKey="video_outgoing_ringback_enabled"
          urlKey="video_outgoing_ringback_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={
            soundFieldsReadOnly ? undefined : (file) => uploadSoundFile("video_outgoing_ringback_url", file)
          }
        />
      </AdminCard>

      <AdminCard titleKey="admin_settings_call_common">
        <SoundFieldRow
          label={t("admin_settings_call_missed")}
          enabledKey="missed_notification_enabled"
          urlKey="missed_notification_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={
            soundFieldsReadOnly ? undefined : (file) => uploadSoundFile("missed_notification_sound_url", file)
          }
        />
        <SoundFieldRow
          label={t("admin_settings_call_end")}
          enabledKey="call_end_enabled"
          urlKey="call_end_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={soundFieldsReadOnly ? undefined : (file) => uploadSoundFile("call_end_sound_url", file)}
        />
        <DefaultFallbackSoundField
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          readOnly={soundFieldsReadOnly}
          onUploadFile={(file) => uploadSoundFile("default_fallback_sound_url", file)}
        />
      </AdminCard>

      <AdminCard titleKey="admin_settings_call_policy">
        <div className="space-y-3 py-2 sam-text-body-secondary text-ui-fg">
          <label className="flex flex-col gap-1">
            <span className="text-ui-muted">{t("admin_settings_call_ring_timeout")}</span>
            <input
              type="number"
              min={10}
              max={600}
              className="rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5"
              value={typeof row?.incoming_ring_timeout_seconds === "number" ? row.incoming_ring_timeout_seconds : 45}
              onChange={(e) => patchLocal({ incoming_ring_timeout_seconds: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ui-muted">{t("admin_settings_call_ring_volume")}</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              className="rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5"
              value={typeof row?.incoming_ringtone_volume === "number" ? row.incoming_ringtone_volume : 0.72}
              onChange={(e) => patchLocal({ incoming_ringtone_volume: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-ui-muted">
            <input
              type="checkbox"
              checked={row?.busy_auto_reject_enabled === true}
              onChange={(e) => patchLocal({ busy_auto_reject_enabled: e.target.checked })}
            />
            {t("admin_settings_call_busy_hide")}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ui-muted">{t("admin_settings_call_redial_cooldown")}</span>
            <input
              type="number"
              min={0}
              max={3600}
              className="rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5"
              value={typeof row?.repeated_call_cooldown_seconds === "number" ? row.repeated_call_cooldown_seconds : 0}
              onChange={(e) => patchLocal({ repeated_call_cooldown_seconds: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-ui-muted">
            <input
              type="checkbox"
              checked={row?.suppress_incoming_local_notifications === true}
              onChange={(e) => patchLocal({ suppress_incoming_local_notifications: e.target.checked })}
            />
            {t("admin_settings_call_suppress_notif")}
          </label>
        </div>
      </AdminCard>

      <button
        type="button"
        disabled={saving || !row}
        className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        onClick={() => void save()}
      >
        {saving ? t("common_saving") : t("common_save")}
      </button>
    </div>
  );
}
