"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import type { FeedFallbackMode } from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getFeedEmergencyPolicies,
  saveFeedEmergencyPolicy,
} from "@/lib/feed-emergency/feed-emergency-state";
import {
  enableKillSwitch,
  disableKillSwitch,
  enableFallback,
  disableFallback,
  getFeedMode,
} from "@/lib/feed-emergency/feed-emergency-utils";
import { commitFeedEmergencyChange } from "@/lib/feed-emergency/feed-emergency-sync-client";
import { feedEmergencySwitchConfirmCopy } from "@/lib/feed-emergency/feed-emergency-switch-confirm";
import { useAdminConfirmDialog } from "@/components/admin/ui/useAdminConfirmDialog";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

const FALLBACK_MODE_LABELS: Record<FeedFallbackMode, string> = {
  previous_live_version: "이전 live 버전",
  safe_default_feed: "안전 기본 피드",
  local_latest_only: "지역 최신만",
  static_slots_only: "정적 슬롯만",
};

export function FeedEmergencyPolicyTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const { confirm: askConfirm, dialog: confirmDialog } = useAdminConfirmDialog();

  const policies = useMemo(
    () => getFeedEmergencyPolicies(),
    [refresh]
  );

  // 쓰기 = 접근표 action(최고관리자). 서버 가드는 그대로 — 화면에서 미리 막고 사유를 보여 준다.
  const writeAction = useAdminRouteAction("/admin/feed-emergency");
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  /** 변경 → 저장. 실패면 화면 상태를 되돌리고 실패를 알린다 (앱 반영 안 됨). */
  const commit = async (mutate: () => void) => {
    const r = await commitFeedEmergencyChange(mutate);
    setResult(r.ok ? { ok: true, message: "저장했습니다. 앱 피드에 반영됩니다." } : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((x) => x + 1);
  };

  const handleKillSwitch = async (surface: RecommendationSurface, enabled: boolean) => {
    const ok = await askConfirm(
      feedEmergencySwitchConfirmCopy({ kind: "kill_switch", enable: enabled, targetLabel: SURFACE_LABELS[surface] })
    );
    if (!ok) return;
    await commit(() => {
      if (enabled) enableKillSwitch(surface);
      else disableKillSwitch(surface);
    });
  };

  const handleFallback = async (surface: RecommendationSurface, enabled: boolean) => {
    const ok = await askConfirm(
      feedEmergencySwitchConfirmCopy({ kind: "fallback", enable: enabled, targetLabel: SURFACE_LABELS[surface] })
    );
    if (!ok) return;
    await commit(() => {
      if (enabled) enableFallback(surface, "관리자 수동 fallback 활성화");
      else disableFallback(surface);
    });
  };

  const handlePolicyChange = async (
    id: string,
    surface: RecommendationSurface,
    field: keyof (typeof policies)[0],
    value: unknown
  ) => {
    const p = policies.find((x) => x.id === id);
    if (!p) return;
    await commit(() => saveFeedEmergencyPolicy({ ...p, [field]: value }));
  };

  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AdminResultBanner ko result={result} onClose={() => setResult(null)} />
      {writeAction.reason ? (
        <p className="sam-text-body-secondary text-sam-muted" data-admin-action-denied="1">
          변경 불가: {writeAction.reason}
        </p>
      ) : null}
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      {confirmDialog}
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
                    <AdminChipButton
                      selected={p.killSwitchEnabled}
                      disabled={!writeAction.allowed}
                      onClick={() => void handleKillSwitch(p.surface, !p.killSwitchEnabled)}
                      >
                      {p.killSwitchEnabled ? "ON (해제)" : "OFF (활성화)"}
                    </AdminChipButton>
                    {mode === "kill_switch" && (
                      <span className="sam-text-helper text-sam-warning">{t("admin_feed_emergency_active_2")}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <AdminChipButton
                      selected={mode === "fallback"}
                      disabled={!writeAction.allowed}
                      onClick={() => void handleFallback(p.surface, mode !== "fallback")}
                      >
                      {mode === "fallback" ? "Fallback 중 (해제)" : "Fallback 활성화"}
                    </AdminChipButton>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  <select
                    value={p.fallbackMode}
                    disabled={!writeAction.allowed}
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
                      disabled={!writeAction.allowed}
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
                    <span className="sam-text-body-secondary">{t("admin_feed_emergency_visible")}</span>
                  </label>
                  {p.emergencyNoticeEnabled && (
                    <input
                      type="text"
                      value={p.emergencyNoticeText}
                      disabled={!writeAction.allowed}
                      onChange={(e) =>
                        void handlePolicyChange(
                          p.id,
                          p.surface,
                          "emergencyNoticeText",
                          e.target.value
                        )
                      }
                      placeholder={t("admin_notice_placeholder")}
                      className="mt-1 w-full rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={p.autoDisableEnabled}
                      disabled={!writeAction.allowed}
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
    </div>
  );
}
