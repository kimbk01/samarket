"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OpsTradePolicyPanel } from "@/components/admin/settings/OpsTradePolicyPanel";
import { AdminCard } from "@/components/admin/AdminCard";
import type { TradeDetailOpsSettings } from "@/services/trade/trade-settings.service";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminHttpStatusErrorMessage, adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

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
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [loading, setLoading] = useState(true);
  /** 조회 실패 — 「불러오는 중」에 머물지 않고 오류 맵 + [새로고침] 을 보인다 */
  const [loadError, setLoadError] = useState<{ code: string; httpStatus: number } | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TradeDetailOpsSettings | null>(null);
  const [regionGroupsText, setRegionGroupsText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
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
        if (cancelled) return;
        if (res.ok && data.ok && data.settings) {
          setSettings(data.settings);
          setRegionGroupsText(regionGroupsToText(data.settings.regionGroups));
        } else {
          setLoadError({ code: data.error || `http_${res.status}`, httpStatus: res.status });
        }
      } catch {
        if (!cancelled) setLoadError({ code: "network_error", httpStatus: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTick]);

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
      if (!res.ok || !data.ok || !data.settings) {
        // 서버 오류 코드·원문을 그대로 보이지 않는다 — 오류 맵 문구 (코드가 없으면 HTTP 상태 문구)
        await dibayAlert({
          title: t("admin_trade_settings_save_failed"),
          description: data.error ? adminOperatorErrorMessage(data.error, ko) : adminHttpStatusErrorMessage(res.status, ko),
        });
        return;
      }
      setSettings(data.settings);
      setRegionGroupsText(regionGroupsToText(data.settings.regionGroups));
      await dibayAlert({ title: t("admin_stores_saved") });
    } catch {
      await dibayAlert({ title: t("admin_trade_settings_save_failed"), description: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4" data-admin>
        <AdminPageHeader titleKey="admin_menu_trade_settings" backHref="/admin/trade" />
        {!loading && loadError ? (
          <AdminErrorState
            ko={ko}
            code={loadError.code}
            httpStatus={loadError.httpStatus}
            onRetry={() => setLoadTick((n) => n + 1)}
          />
        ) : (
          <AdminLoadingState ko={ko} />
        )}
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

          <AdminActionButton type="submit" variant="primary" disabled={!canSave}>
            {t("common_save")}
          </AdminActionButton>
        </form>
      </AdminCard>
      {/* 거래 채팅 자동 확정·후기 기한 — 같은 거래 정책 화면에서 함께 관리 (거래 Admin 설계 v2 §C-10) */}
      <OpsTradePolicyPanel />
    </div>
  );
}
