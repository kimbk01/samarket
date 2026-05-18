"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { previewStoreDeliveryBuiltinSound } from "@/lib/business/store-order-alert-sound";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  STORE_DELIVERY_ALERT_SOUND_OPTIONS,
  STORE_DELIVERY_NOTIFICATION_MP3_PATH,
  storeDeliverySoundSelectIdFromUrl,
  type StoreDeliveryAlertSoundSelectId,
} from "@/lib/stores/store-delivery-alert-sound-presets";

export type AdminGlobalAlertSoundSectionProps = {
  titleKey: MessageKey;
  descriptionKey?: MessageKey;
  codeKey: string;
  apiPath: string;
  onAfterMutation?: () => void;
};

export function AdminGlobalAlertSoundSection({
  titleKey,
  descriptionKey,
  codeKey,
  apiPath,
  onAfterMutation,
}: AdminGlobalAlertSoundSectionProps) {
  const { t } = useI18n();
  const [soundSelect, setSoundSelect] = useState<StoreDeliveryAlertSoundSelectId | "">("builtin");
  const [soundLegacyUrl, setSoundLegacyUrl] = useState<string | null>(null);
  const [soundFromDb, setSoundFromDb] = useState(false);
  const [soundLoading, setSoundLoading] = useState(true);
  const [soundSaving, setSoundSaving] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [soundMsg, setSoundMsg] = useState<string | null>(null);
  const adminSoundFileRef = useRef<HTMLInputElement>(null);

  const errorText =
    soundError === "network_error"
      ? t("common_network_error")
      : soundError === "forbidden"
        ? t("admin_audit_err_no_permission")
        : soundError;

  const uploadAdminSoundFromPc = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      setSoundSaving(true);
      setSoundError(null);
      setSoundMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(apiPath, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          url?: string;
          from_db?: boolean;
        };
        if (!json?.ok) {
          setSoundError(
            typeof json?.message === "string"
              ? json.message
              : typeof json?.error === "string"
                ? json.error
                : "upload_failed"
          );
          return;
        }
        const u = typeof json.url === "string" ? json.url.trim() : "";
        setSoundSelect("");
        setSoundLegacyUrl(u || null);
        setSoundFromDb(json.from_db === true);
        setSoundMsg(t("admin_stores_alert_upload_ok"));
        onAfterMutation?.();
        window.setTimeout(() => setSoundMsg(null), 3200);
      } catch {
        setSoundError("network_error");
      } finally {
        setSoundSaving(false);
      }
    },
    [apiPath, onAfterMutation, t]
  );

  const deleteGlobalSound = useCallback(async () => {
    if (!window.confirm(t("admin_stores_alert_delete_confirm"))) return;
    setSoundSaving(true);
    setSoundError(null);
    setSoundMsg(null);
    try {
      const res = await fetch(apiPath, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json?.ok) {
        setSoundError(typeof json?.error === "string" ? json.error : "delete_failed");
        return;
      }
      setSoundSelect("builtin");
      setSoundLegacyUrl(null);
      setSoundFromDb(false);
      setSoundMsg(t("admin_stores_alert_removed"));
      onAfterMutation?.();
      window.setTimeout(() => setSoundMsg(null), 3200);
    } catch {
      setSoundError("network_error");
    } finally {
      setSoundSaving(false);
    }
  }, [apiPath, onAfterMutation, t]);

  const persistSoundChoice = useCallback(
    async (id: StoreDeliveryAlertSoundSelectId) => {
      const url =
        id === "builtin"
          ? null
          : STORE_DELIVERY_ALERT_SOUND_OPTIONS.find((o) => o.id === id)?.url ?? null;
      setSoundSaving(true);
      setSoundError(null);
      setSoundMsg(null);
      try {
        const res = await fetch(apiPath, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const json = await res.json();
        if (!json?.ok) {
          setSoundError(json?.error === "invalid_url" ? "save_retry" : String(json?.error ?? "save_failed"));
          return;
        }
        setSoundSelect(id);
        setSoundLegacyUrl(null);
        setSoundFromDb(json.from_db === true);
        setSoundMsg(t("admin_stores_app_taxonomy_msg_saved"));
        onAfterMutation?.();
        window.setTimeout(() => setSoundMsg(null), 2800);
      } catch {
        setSoundError("network_error");
      } finally {
        setSoundSaving(false);
      }
    },
    [apiPath, onAfterMutation, t]
  );

  const loadSound = useCallback(async () => {
    setSoundLoading(true);
    setSoundError(null);
    try {
      const res = await fetch(apiPath, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setSoundError("forbidden");
        return;
      }
      if (!json?.ok) {
        setSoundError(typeof json?.error === "string" ? json.error : "load_failed");
        return;
      }
      const url = typeof json.url === "string" ? json.url : "";
      const fromDb = json.from_db === true;
      setSoundFromDb(fromDb);
      const sel = storeDeliverySoundSelectIdFromUrl(url, fromDb);
      if (sel === "") {
        setSoundSelect("");
        setSoundLegacyUrl(url.trim() || null);
      } else {
        setSoundSelect(sel);
        setSoundLegacyUrl(null);
      }
    } catch {
      setSoundError("network_error");
    } finally {
      setSoundLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    void loadSound();
  }, [loadSound]);

  const displayError =
    soundError === "upload_failed"
      ? t("admin_stores_alert_upload_failed")
      : soundError === "save_retry"
        ? t("admin_stores_alert_save_retry")
        : errorText;

  return (
    <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
      <h2 className="sam-text-body font-semibold text-sam-fg">{t(titleKey)}</h2>
      {descriptionKey ? (
        <div className="mt-1 sam-text-helper text-sam-muted">{t(descriptionKey)}</div>
      ) : null}
      <p className="mt-1 sam-text-xxs text-sam-meta">
        <code className="rounded bg-sam-surface-muted px-1">{codeKey}</code>
      </p>
      {soundLegacyUrl ? (
        <p className="mt-2 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_stores_alert_legacy_url")}
        </p>
      ) : null}
      {displayError ? <p className="mt-2 sam-text-body-secondary text-red-700">{displayError}</p> : null}
      {soundMsg ? <p className="mt-2 sam-text-body-secondary text-green-800">{soundMsg}</p> : null}
      {soundLoading ? (
        <p className="mt-3 sam-text-body-secondary text-sam-muted">{t("admin_stores_alert_loading")}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block sam-text-helper font-medium text-sam-fg">
            {t("admin_stores_alert_kind_label")}
            <select
              className="mt-1.5 block w-full max-w-md cursor-pointer rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-lg text-sam-fg shadow-sm focus:border-signature focus:outline-none focus:ring-1 focus:ring-signature disabled:cursor-not-allowed disabled:opacity-60"
              value={soundSelect}
              disabled={soundSaving}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "builtin" && v !== "notif") return;
                void persistSoundChoice(v);
              }}
            >
              {soundSelect === "" && (
                <option value="" disabled>
                  {soundLegacyUrl
                    ? t("admin_stores_alert_select_legacy")
                    : t("admin_stores_alert_select_default")}
                </option>
              )}
              {STORE_DELIVERY_ALERT_SOUND_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="min-w-0 flex-1 break-all sam-text-xxs text-sam-muted">
              <span className={soundFromDb ? "font-medium text-signature" : "text-sam-meta"}>
                {soundFromDb ? t("admin_stores_alert_stored_db") : t("admin_stores_alert_stored_default")}
              </span>
              {soundLegacyUrl ? (
                <>
                  {" "}
                  · {t("admin_stores_alert_upload_url")}{" "}
                  <code className="rounded bg-sam-app px-0.5">{soundLegacyUrl}</code>
                </>
              ) : soundFromDb && soundSelect === "notif" ? (
                <>
                  {" "}
                  · {t("admin_stores_alert_preset_mp3")}{" "}
                  <code className="rounded bg-sam-app px-0.5">{STORE_DELIVERY_NOTIFICATION_MP3_PATH}</code>
                </>
              ) : !soundFromDb ? (
                <>
                  {" "}
                  · {t("admin_stores_alert_preset_path_hint")}{" "}
                  <code className="rounded bg-sam-app px-0.5">{STORE_DELIVERY_NOTIFICATION_MP3_PATH}</code>
                </>
              ) : null}
            </p>
            {soundFromDb ? (
              <button
                type="button"
                disabled={soundSaving}
                onClick={() => void deleteGlobalSound()}
                className="shrink-0 rounded-ui-rect border border-red-200 bg-sam-surface px-2.5 py-1.5 sam-text-helper font-medium text-red-800 disabled:opacity-50"
              >
                {t("admin_stores_alert_remove_db")}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={adminSoundFileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
              className="sr-only"
              onChange={uploadAdminSoundFromPc}
            />
            <button
              type="button"
              disabled={soundSaving}
              onClick={() => adminSoundFileRef.current?.click()}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:opacity-50"
            >
              {soundSaving ? t("common_processing") : t("admin_stores_alert_upload_pc")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={soundSaving || (soundSelect === "" && !soundLegacyUrl)}
              onClick={() => {
                if (soundSelect === "builtin") {
                  previewStoreDeliveryBuiltinSound();
                  return;
                }
                if (soundSelect === "notif") {
                  try {
                    const a = new Audio(STORE_DELIVERY_NOTIFICATION_MP3_PATH);
                    a.volume = 0.55;
                    void a.play().catch(() => {
                      window.alert(t("admin_stores_alert_preview_fail"));
                    });
                  } catch {
                    window.alert(t("admin_stores_alert_preview_start_fail"));
                  }
                  return;
                }
                if (soundLegacyUrl) {
                  try {
                    const a = new Audio(soundLegacyUrl);
                    a.volume = 0.55;
                    void a.play().catch(() => window.alert(t("admin_stores_alert_preview_url_fail")));
                  } catch {
                    window.alert(t("admin_stores_alert_preview_start_fail"));
                  }
                }
              }}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:opacity-50"
            >
              {t("admin_stores_alert_preview")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
