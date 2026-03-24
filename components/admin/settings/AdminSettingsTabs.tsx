"use client";

import type { SettingsSectionKey } from "@/lib/admin-settings/admin-settings-utils";
import { SETTINGS_SECTIONS } from "@/lib/admin-settings/admin-settings-utils";

interface AdminSettingsTabsProps {
  active: SettingsSectionKey;
  onChange: (key: SettingsSectionKey) => void;
}

export function AdminSettingsTabs({ active, onChange }: AdminSettingsTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {SETTINGS_SECTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-t px-4 py-2.5 text-[14px] font-medium ${
            active === key
              ? "border border-b-0 border-gray-200 bg-white text-gray-900"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
