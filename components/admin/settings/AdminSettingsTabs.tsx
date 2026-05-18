"use client";

import type { SettingsSectionKey } from "@/lib/admin-settings/admin-settings-utils";
import { SETTINGS_SECTIONS } from "@/lib/admin-settings/admin-settings-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

interface AdminSettingsTabsProps {
  active: SettingsSectionKey;
  onChange: (key: SettingsSectionKey) => void;
}

const TAB_LABEL_KEYS: Record<SettingsSectionKey, MessageKey> = {
  general: "admin_settings_tab_general",
  product: "admin_settings_tab_product",
  chat: "admin_settings_tab_chat",
  report: "admin_settings_tab_report",
  trust: "admin_settings_tab_trust",
  region: "admin_settings_tab_region",
  categories: "admin_settings_tab_categories",
};

export function AdminSettingsTabs({ active, onChange }: AdminSettingsTabsProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-1 border-b border-sam-border">
      {SETTINGS_SECTIONS.map(({ key }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-t px-4 py-2.5 sam-text-body font-medium ${
            active === key
              ? "border border-b-0 border-sam-border bg-sam-surface text-sam-fg"
              : "text-sam-muted hover:bg-sam-surface-muted hover:text-sam-fg"
          }`}
        >
          {t(TAB_LABEL_KEYS[key])}
        </button>
      ))}
    </div>
  );
}
