"use client";

import type { AppSettings } from "@/lib/types/admin-settings";
import { BatteryPolicyReferencePanel } from "./BatteryPolicyReferencePanel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface TrustPolicyFormProps {
  values: Pick<AppSettings, "trustReviewEnabled" | "mannerScoreVisible" | "speedDisplayLabel">;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function TrustPolicyForm({ values, onChange }: TrustPolicyFormProps) {
  const { t } = useI18n();
  const batteryDefault = t("admin_settings_trust_battery_default");

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_settings_trust_intro_a")}{" "}
        <strong className="text-sam-fg">{t("admin_settings_trust_intro_panel")}</strong>{" "}
        {t("admin_settings_trust_intro_b")}
      </p>
      <div className="rounded-ui-rect border border-sam-border bg-signature/5 px-3 py-2.5 sam-text-helper leading-relaxed text-sam-fg">
        <p className="font-medium text-sam-fg">{t("admin_settings_trust_battery_note_title")}</p>
        <p className="mt-1 text-sam-muted">{t("admin_settings_trust_battery_note_body")}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="trustReviewEnabled"
          checked={values.trustReviewEnabled}
          onChange={(e) => onChange("trustReviewEnabled", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="trustReviewEnabled" className="sam-text-body text-sam-fg">
          {t("admin_settings_trust_review_enabled")}
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="mannerScoreVisible"
          checked={values.mannerScoreVisible}
          onChange={(e) => onChange("mannerScoreVisible", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="mannerScoreVisible" className="sam-text-body text-sam-fg">
          {t("admin_settings_trust_battery_visible")}
        </label>
      </div>
      <div>
        <label htmlFor="speedDisplayLabel" className="block sam-text-body text-sam-fg">
          {t("admin_settings_trust_battery_label")}
        </label>
        <input
          type="text"
          id="speedDisplayLabel"
          value={values.speedDisplayLabel ?? batteryDefault}
          onChange={(e) => onChange("speedDisplayLabel", e.target.value.trim() || batteryDefault)}
          placeholder={batteryDefault}
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <p className="mt-0.5 sam-text-helper text-sam-muted">{t("admin_settings_trust_battery_label_hint")}</p>
      </div>

      <BatteryPolicyReferencePanel />
    </div>
  );
}
