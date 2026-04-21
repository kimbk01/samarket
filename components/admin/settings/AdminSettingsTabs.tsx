"use client";

import type { SettingsSectionKey } from "@/lib/admin-settings/admin-settings-utils";
import { SETTINGS_SECTIONS } from "@/lib/admin-settings/admin-settings-utils";

interface AdminSettingsTabsProps {
  active: SettingsSectionKey;
  onChange: (key: SettingsSectionKey) => void;
}

export function AdminSettingsTabs({ active, onChange }: AdminSettingsTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-sam-border">
      {SETTINGS_SECTIONS.map(({ key, label }) => (
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
          {label}
        </button>
      ))}
    </div>
  );
}
