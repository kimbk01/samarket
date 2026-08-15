"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { TradeDetailOpsSettings } from "@/services/trade/trade-settings.service";

function regionGroupsToText(groups: Record<string, string>): string {
  return Object.entries(groups)
    .map(([region, group]) => `${region}:${group}`)
    .join("\n");
}

function parseRegionGroupText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const region = trimmed.slice(0, idx).trim().toLowerCase();
    const group = trimmed.slice(idx + 1).trim().toLowerCase();
    if (!region || !group) continue;
    out[region] = group;
  }
  return out;
}

export function AdminTradeSettingsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TradeDetailOpsSettings | null>(null);
  const [regionGroupsText, setRegionGroupsText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/trade/settings", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: TradeDetailOpsSettings;
          error?: string;
        };
        if (!cancelled && data.ok && data.settings) {
          setSettings(data.settings);
          setRegionGroupsText(regionGroupsToText(data.settings.regionGroups));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSave = useMemo(() => settings != null && !saving, [settings, saving]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const payload: TradeDetailOpsSettings = {
        ...settings,
        regionGroups: parseRegionGroupText(regionGroupsText),
      };
      const res = await fetch("/api/admin/trade/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        settings?: TradeDetailOpsSettings;
        error?: string;
      };
      if (!data.ok || !data.settings) {
        await dibayAlert({ title: data.error ?? t("admin_trade_settings_save_failed") });
        return;
      }
      setSettings(data.settings);
      setRegionGroupsText(regionGroupsToText(data.settings.regionGroups));
      await dibayAlert({ title: t("admin_stores_saved") });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4" data-admin>
        <AdminPageHeader titleKey="admin_menu_trade_settings" backHref="/admin/trade" />
        <p className="sam-text-body-secondary text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-admin>
      <AdminPageHeader titleKey="admin_menu_trade_settings" backHref="/admin/trade" />
      <AdminCard titleKey="admin_trade_settings_card_title">
        <p className="mb-4 sam-text-body-secondary text-sam-muted">
          {t("admin_trade_settings_rules_intro")}
          <span className="font-medium text-sam-fg">{t("admin_trade_settings_rules_fallback_span")}</span>
          {t("admin_trade_settings_rules_outro")}
        </p>
        <form onSubmit={onSave} className="space-y-4 sam-text-body-secondary">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.regionEnabled}
                onChange={(e) => setSettings({ ...settings, regionEnabled: e.target.checked })}
              />
              <span className="text-sam-fg">{t("admin_trade_settings_region_filter")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.regionRequired}
                onChange={(e) => setSettings({ ...settings, regionRequired: e.target.checked })}
              />
              <span className="text-sam-fg">{t("admin_trade_settings_region_required")}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_trade_settings_similar_count")}</span>
              <input
                type="number"
                min={1}
                max={24}
                className="rounded border border-sam-border px-2 py-1.5"
                value={settings.similarCount}
                onChange={(e) =>
                  setSettings({ ...settings, similarCount: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_trade_settings_ads_count")}</span>
              <input
                type="number"
                min={1}
                max={24}
                className="rounded border border-sam-border px-2 py-1.5"
                value={settings.adsCount}
                onChange={(e) =>
                  setSettings({ ...settings, adsCount: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_trade_settings_fallback_count")}</span>
              <input
                type="number"
                min={1}
                max={24}
                className="rounded border border-sam-border px-2 py-1.5"
                value={settings.fallbackCount}
                onChange={(e) =>
                  setSettings({ ...settings, fallbackCount: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })
                }
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_trade_settings_completed_visible_days")}</span>
              <input
                type="number"
                min={1}
                max={60}
                className="rounded border border-sam-border px-2 py-1.5"
                value={settings.completedVisibleDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    completedVisibleDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)),
                  })
                }
              />
              <span className="sam-text-helper text-sam-muted">{t("admin_trade_settings_completed_visible_hint")}</span>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-sam-fg">{t("admin_trade_settings_region_map_label")}</span>
            <textarea
              value={regionGroupsText}
              onChange={(e) => setRegionGroupsText(e.target.value)}
              className="min-h-[140px] rounded border border-sam-border px-2 py-2 font-mono sam-text-helper"
              placeholder="quezon city:metro-manila"
            />
            <span className="sam-text-helper text-sam-muted">{t("admin_trade_settings_region_map_example")}</span>
          </label>

          <button
            type="submit"
            disabled={!canSave}
            className="rounded bg-sam-ink px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? t("admin_stores_saving") : t("common_save")}
          </button>
        </form>
      </AdminCard>
    </div>
  );
}
