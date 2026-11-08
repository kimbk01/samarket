"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getFeedFallbackStates } from "@/lib/feed-emergency/feed-emergency-state";
import { getFeedMode } from "@/lib/feed-emergency/feed-emergency-utils";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import type { MessageKey } from "@/lib/i18n/messages";

const MODE_LABELS: Record<string, MessageKey> = {
  normal: "admin_feed_emergency_normal_badge",
  fallback: "admin_feed_emergency_state_fallback",
  kill_switch: "admin_feed_emergency_state_kill_switch",
};

export function FeedFallbackStateCard() {
  const { t } = useI18n();
  const [refresh] = useState(0);

  const states = useMemo(() => getFeedFallbackStates(), [refresh]);

  if (states.length === 0) {
    return (
      <AdminEmptyState ko message={t("admin_feed_emergency_no_states")} />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {states.map((s) => {
        const mode = getFeedMode(s.surface);
        return (
          <div
            key={s.id}
            className={`rounded-ui-rect border p-4 ${
              mode === "kill_switch"
                ? "border-sam-warning bg-sam-warning-soft"
                : mode === "fallback"
                  ? "border-sam-success bg-sam-success-soft"
                  : "border-sam-border bg-sam-surface"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-sam-fg">{SURFACE_LABELS[s.surface]}</span>
              <span
                className={`rounded px-2 py-0.5 sam-text-helper font-medium ${
                  mode === "kill_switch"
                    ? "bg-sam-warning-soft text-sam-warning"
                    : mode === "fallback"
                      ? "bg-sam-success-soft text-sam-success"
                      : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {MODE_LABELS[mode] ? t(MODE_LABELS[mode]) : mode}
              </span>
            </div>
            <dl className="space-y-1 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">{t("admin_feed_emergency_active_4")}</dt>
                <dd className="text-sam-fg">{s.activeVersionId ?? "-"}</dd>
              </div>
              {s.fallbackVersionId && (
                <div>
                  <dt className="text-sam-muted">{t("admin_fallback_version")}</dt>
                  <dd className="text-sam-fg">{s.fallbackVersionId}</dd>
                </div>
              )}
              {s.fallbackReason && (
                <div>
                  <dt className="text-sam-muted">{t("admin_feed_emergency_k63c27906")}</dt>
                  <dd className="text-sam-fg">{s.fallbackReason}</dd>
                </div>
              )}
              <div>
                <dt className="text-sam-muted">{t("admin_rec_deploy_k2d2acced")}</dt>
                <dd className="text-sam-muted">{formatAdminManilaDateTime(s.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
