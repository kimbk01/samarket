"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useRef } from "react";
import type { AppSettings } from "@/lib/types/admin-settings";
import {
  DEFAULT_LOCALE_OPTIONS,
  DEFAULT_CURRENCY_OPTIONS,
} from "@/lib/admin-settings/admin-settings-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface GeneralSettingsFormProps {
  values: Pick<AppSettings, "siteName" | "defaultCurrency" | "defaultLocale" | "alarmSoundDataUrl">;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function GeneralSettingsForm({ values, onChange }: GeneralSettingsFormProps) {
  const { t } = useI18n();
  const alarmInputRef = useRef<HTMLInputElement>(null);

  const handleAlarmFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      await dibayAlert({ title: t("admin_settings_alarm_audio_only") });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onChange("alarmSoundDataUrl", dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currencyValue =
    DEFAULT_CURRENCY_OPTIONS.some((o) => o.value === values.defaultCurrency)
      ? values.defaultCurrency
      : DEFAULT_CURRENCY_OPTIONS[0].value;
  const localeValue =
    DEFAULT_LOCALE_OPTIONS.some((o) => o.value === values.defaultLocale)
      ? values.defaultLocale
      : DEFAULT_LOCALE_OPTIONS[0].value;

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_settings_general_intro")}</p>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_label_site_name")}
        </label>
        <input
          type="text"
          value={values.siteName}
          onChange={(e) => onChange("siteName", e.target.value)}
          placeholder="KASAMA"
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
        {values.siteName && (
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_settings_site_name_current", { name: values.siteName })}
          </p>
        )}
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_label_default_currency")}
        </label>
        <select
          value={currencyValue}
          onChange={(e) => onChange("defaultCurrency", e.target.value)}
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        >
          {DEFAULT_CURRENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_label_default_locale")}
        </label>
        <select
          value={localeValue}
          onChange={(e) => onChange("defaultLocale", e.target.value)}
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        >
          {DEFAULT_LOCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_alarm_title")}
        </label>
        <p className="mt-0.5 sam-text-helper text-sam-muted">{t("admin_settings_alarm_help")}</p>
        <input
          ref={alarmInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/*"
          onChange={handleAlarmFile}
          className="mt-2 block w-full max-w-xs sam-text-body-secondary text-sam-muted file:mr-2 file:rounded file:border-0 file:bg-signature file:px-3 file:py-1.5 file:sam-text-body-secondary file:text-white file:hover:opacity-90"
        />
        {values.alarmSoundDataUrl ? (
          <p className="mt-2 sam-text-helper text-green-600">{t("admin_settings_alarm_configured")}</p>
        ) : (
          <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_settings_alarm_not_configured")}</p>
        )}
      </div>
    </div>
  );
}
