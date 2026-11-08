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
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";

const FALLBACK_MODE_LABELS: Record<FeedFallbackMode, MessageKey> = {
  previous_live_version: "admin_feed_emergency_mode_previous_live",
  safe_default_feed: "admin_feed_emergency_mode_safe_default",
  local_latest_only: "admin_feed_emergency_mode_local_latest",
  static_slots_only: "admin_feed_emergency_mode_static_slots",
};

export function FeedEmergencyPolicyTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);

  const policies = useMemo(
    () => getFeedEmergencyPolicies(),
    [refresh]
  );

  // 쓰기 = 접근표 action(최고관리자). 서버 가드는 그대로 — 화면에서 미리 막고 사유를 보여 준다.
  const writeAction = useAdminRouteAction("/admin/feed-emergency");
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  /** 변경 → 저장. 실패면 화면 상태를 되돌리고 실패를 알린다 (앱 반영 안 됨). */
  const [saving, setSaving] = useState(false);
  const commit = async (mutate: () => void, reason?: string | null) => {
    if (saving) return;
    setSaving(true);
    const r = await commitFeedEmergencyChange(mutate, { reason }).finally(() => setSaving(false));
    setResult(r.ok ? { ok: true, message: t("admin_feed_emergency_saved_applied") } : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((x) => x + 1);
  };

  /** 긴급 스위치(킬스위치·Fallback) 켜기·해제 = emergencyBlock (L3: 사유 + 목표 상태 단어 재입력). 사유는 저장 API → 감사 기록. */
  const confirmEmergencySwitch = async (kind: "kill_switch" | "fallback", surface: RecommendationSurface, enable: boolean) => {
    const copy = feedEmergencySwitchConfirmCopy({ kind, enable, targetLabel: SURFACE_LABELS[surface] });
    return confirmAdminAction({
      level: adminActionLevel("emergencyBlock"),
      ko: true,
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      destructive: true,
      retypeValue: copy.confirmMatchText,
    });
  };

  const handleKillSwitch = async (surface: RecommendationSurface, enabled: boolean) => {
    const c = await confirmEmergencySwitch("kill_switch", surface, enabled);
    if (!c.ok) return;
    await commit(() => {
      if (enabled) enableKillSwitch(surface);
      else disableKillSwitch(surface);
    }, c.reason);
  };

  const handleFallback = async (surface: RecommendationSurface, enabled: boolean) => {
    const c = await confirmEmergencySwitch("fallback", surface, enabled);
    if (!c.ok) return;
    await commit(() => {
      if (enabled) enableFallback(surface, "관리자 수동 fallback 활성화");
      else disableFallback(surface);
    }, c.reason);
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
      <AdminEmptyState ko message={t("admin_feed_emergency_no_policies")} />
    );
  }

  return (
    <div className="space-y-3">
      <AdminResultBanner ko result={result} onClose={() => setResult(null)} />
      {writeAction.reason ? (
        <p className="sam-text-body-secondary text-sam-muted" data-admin-action-denied="1">
          {t("admin_feed_emergency_policy_write_denied", { reason: writeAction.reason })}
        </p>
      ) : null}
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_feed_emergency_policy_col_kill_switch")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              Fallback
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_feed_emergency_policy_col_fallback_mode")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_feed_emergency_policy_col_notice")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_feed_emergency_policy_col_auto_disable")}
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
                    <AdminToneBadge tone={p.killSwitchEnabled ? "danger" : "neutral"}>
                      {p.killSwitchEnabled ? t("admin_feed_emergency_blocking_badge") : t("admin_feed_emergency_normal_badge")}
                    </AdminToneBadge>
                    <AdminActionButton
                      size="sm"
                      variant={p.killSwitchEnabled ? "secondary" : "danger"}
                      disabled={!writeAction.allowed || saving}
                      onClick={() => void handleKillSwitch(p.surface, !p.killSwitchEnabled)}
                    >
                      {p.killSwitchEnabled ? t("admin_feed_emergency_unblock_button") : t("admin_feed_emergency_block_button")}
                    </AdminActionButton>
                    {mode === "kill_switch" && (
                      <span className="sam-text-helper text-sam-warning">{t("admin_feed_emergency_active_2")}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <AdminToneBadge tone={mode === "fallback" ? "warning" : "neutral"}>
                      {mode === "fallback" ? t("admin_feed_emergency_fallback_on_badge") : t("admin_feed_emergency_normal_badge")}
                    </AdminToneBadge>
                    <AdminActionButton
                      size="sm"
                      variant={mode === "fallback" ? "secondary" : "danger"}
                      disabled={!writeAction.allowed || saving}
                      onClick={() => void handleFallback(p.surface, mode !== "fallback")}
                    >
                      {mode === "fallback" ? t("admin_feed_emergency_fallback_off_button") : t("admin_feed_emergency_fallback_on_button")}
                    </AdminActionButton>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  <select
                    value={p.fallbackMode}
                    disabled={!writeAction.allowed || saving}
                    onChange={(e) =>
                      void handlePolicyChange(p.id, p.surface, "fallbackMode", e.target.value)
                    }
                    className="rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                  >
                    {(Object.keys(FALLBACK_MODE_LABELS) as FeedFallbackMode[]).map(
                      (m) => (
                        <option key={m} value={m}>
                          {t(FALLBACK_MODE_LABELS[m])}
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
                      disabled={!writeAction.allowed || saving}
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
                      disabled={!writeAction.allowed || saving}
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
                      disabled={!writeAction.allowed || saving}
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
