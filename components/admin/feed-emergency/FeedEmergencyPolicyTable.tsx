"use client";

import { useMemo, useState } from "react";
import type { FeedFallbackMode } from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedEmergencyPolicies } from "@/lib/feed-emergency/mock-feed-emergency-policies";
import { saveFeedEmergencyPolicy } from "@/lib/feed-emergency/mock-feed-emergency-policies";
import {
  enableKillSwitch,
  disableKillSwitch,
  enableFallback,
  disableFallback,
  getFeedMode,
} from "@/lib/feed-emergency/feed-emergency-utils";
import { persistFeedEmergencyToServer } from "@/lib/feed-emergency/feed-emergency-sync-client";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const FALLBACK_MODE_LABELS: Record<FeedFallbackMode, string> = {
  previous_live_version: "이전 live 버전",
  safe_default_feed: "안전 기본 피드",
  local_latest_only: "지역 최신만",
  static_slots_only: "정적 슬롯만",
};

export function FeedEmergencyPolicyTable() {
  const [refresh, setRefresh] = useState(0);

  const policies = useMemo(
    () => getFeedEmergencyPolicies(),
    [refresh]
  );

  const flush = async () => {
    const r = await persistFeedEmergencyToServer();
    if (!r.ok) {
      console.warn("[feed-emergency] 저장 실패:", r.error);
    }
    setRefresh((x) => x + 1);
  };

  const handleKillSwitch = async (surface: RecommendationSurface, enabled: boolean) => {
    if (enabled) enableKillSwitch(surface);
    else disableKillSwitch(surface);
    await flush();
  };

  const handleFallback = async (surface: RecommendationSurface, enabled: boolean) => {
    if (enabled) enableFallback(surface, "관리자 수동 fallback 활성화");
    else disableFallback(surface);
    await flush();
  };

  const handlePolicyChange = async (
    id: string,
    surface: RecommendationSurface,
    field: keyof (typeof policies)[0],
    value: unknown
  ) => {
    const p = policies.find((x) => x.id === id);
    if (!p) return;
    saveFeedEmergencyPolicy({ ...p, [field]: value });
    await flush();
  };

  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              킬스위치
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              Fallback
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              Fallback 모드
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              긴급 공지
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              자동 비활성(placeholder)
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => {
            const mode = getFeedMode(p.surface);
            return (
              <tr
                key={p.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {SURFACE_LABELS[p.surface]}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleKillSwitch(p.surface, !p.killSwitchEnabled)}
                      className={`rounded border px-2 py-1 sam-text-body-secondary ${
                        p.killSwitchEnabled
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-sam-border bg-sam-app text-sam-muted"
                      }`}
                    >
                      {p.killSwitchEnabled ? "ON (해제)" : "OFF (활성화)"}
                    </button>
                    {mode === "kill_switch" && (
                      <span className="sam-text-helper text-amber-600">활성됨</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleFallback(p.surface, mode !== "fallback")
                      }
                      className={`rounded border px-2 py-1 sam-text-body-secondary ${
                        mode === "fallback"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-sam-border bg-sam-app text-sam-muted"
                      }`}
                    >
                      {mode === "fallback" ? "Fallback 중 (해제)" : "Fallback 활성화"}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  <select
                    value={p.fallbackMode}
                    onChange={(e) =>
                      void handlePolicyChange(p.id, p.surface, "fallbackMode", e.target.value)
                    }
                    className="rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                  >
                    {(Object.keys(FALLBACK_MODE_LABELS) as FeedFallbackMode[]).map(
                      (m) => (
                        <option key={m} value={m}>
                          {FALLBACK_MODE_LABELS[m]}
                        </option>
                      )
                    )}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={p.emergencyNoticeEnabled}
                      onChange={(e) =>
                        void handlePolicyChange(
                          p.id,
                          p.surface,
                          "emergencyNoticeEnabled",
                          e.target.checked
                        )
                      }
                      className="rounded border-sam-border"
                    />
                    <span className="sam-text-body-secondary">공지 표시</span>
                  </label>
                  {p.emergencyNoticeEnabled && (
                    <input
                      type="text"
                      value={p.emergencyNoticeText}
                      onChange={(e) =>
                        void handlePolicyChange(
                          p.id,
                          p.surface,
                          "emergencyNoticeText",
                          e.target.value
                        )
                      }
                      placeholder="공지 문구"
                      className="mt-1 w-full rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={p.autoDisableEnabled}
                      onChange={(e) =>
                        void handlePolicyChange(
                          p.id,
                          p.surface,
                          "autoDisableEnabled",
                          e.target.checked
                        )
                      }
                      className="rounded border-sam-border"
                    />
                    placeholder
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
