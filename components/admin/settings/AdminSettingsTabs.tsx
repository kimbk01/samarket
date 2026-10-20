"use client";

import type { SettingsSectionKey } from "@/lib/admin-settings/admin-settings-utils";
import { SETTINGS_SECTIONS } from "@/lib/admin-settings/admin-settings-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";

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
    <AdminTabs
      tabs={SETTINGS_SECTIONS.map(({ key }) => ({ id: key, label: t(TAB_LABEL_KEYS[key]) }))}
      ariaLabel="설정 탭"
      value={active}
      onChange={(id) => onChange(id as SettingsSectionKey)}
      syncUrl={false}
    />
  );
}
