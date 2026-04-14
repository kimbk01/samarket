"use client";

import { useEffect, useMemo, useState } from "react";
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
        alert(data.error ?? "저장하지 못했습니다.");
        return;
      }
      setSettings(data.settings);
      setRegionGroupsText(regionGroupsToText(data.settings.regionGroups));
      alert("저장했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4" data-admin>
        <AdminPageHeader title="거래 설정" backHref="/admin/trade" />
        <p className="text-[13px] text-sam-muted">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-admin>
      <AdminPageHeader title="거래 설정" backHref="/admin/trade" />
      <AdminCard title="거래 상세 하단 추천·지역 운영">
        <p className="mb-4 text-[13px] text-sam-muted">
          설정 반영 규칙: 지역 사용 OFF면 지역 조건 없이 추천하고, ON이면
          <span className="font-medium text-sam-fg"> region_id → region_group → 전체 fallback</span>
          순서로 완화합니다. 지역 필수 ON은 지역 우선 매칭을 더 엄격하게 적용하지만, 최종 fallback은 유지해 빈 화면을 막습니다.
        </p>
        <form onSubmit={onSave} className="space-y-4 text-[13px]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.regionEnabled}
                onChange={(e) => setSettings({ ...settings, regionEnabled: e.target.checked })}
              />
              <span className="text-sam-fg">지역 필터 사용</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.regionRequired}
                onChange={(e) => setSettings({ ...settings, regionRequired: e.target.checked })}
              />
              <span className="text-sam-fg">지역 입력 필수</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">유사상품 개수</span>
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
              <span className="text-sam-muted">광고 개수</span>
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
              <span className="text-sam-muted">fallback 개수</span>
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
              <span className="text-sam-muted">거래완료 노출 유지(일)</span>
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
              <span className="text-[12px] text-sam-muted">
                거래완료(completed/sold) 아이템은 설정한 기간 이후 상세 추천 리스트에서 자동 제외됩니다.
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-sam-fg">지역 그룹 맵 (한 줄: region:group)</span>
            <textarea
              value={regionGroupsText}
              onChange={(e) => setRegionGroupsText(e.target.value)}
              className="min-h-[140px] rounded border border-sam-border px-2 py-2 font-mono text-[12px]"
              placeholder="quezon city:metro-manila"
            />
            <span className="text-[12px] text-sam-muted">
              예) quezon city:metro-manila / makati:metro-manila
            </span>
          </label>

          <button
            type="submit"
            disabled={!canSave}
            className="rounded bg-sam-ink px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </form>
      </AdminCard>
    </div>
  );
}
