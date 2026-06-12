"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getRecommendationIncidents } from "@/lib/recommendation-ops/recommendation-runtime-state";
import { getRecommendationDeployments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getRecommendationAlertEvents } from "@/lib/recommendation-ops/recommendation-runtime-state";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";

type TimelineItem =
  | {
      type: "incident";
      id: string;
      at: string;
      title: string;
      surface: RecommendationSurface;
      status: string;
    }
  | {
      type: "deployment";
      id: string;
      at: string;
      title: string;
      surface: RecommendationSurface;
      status: string;
    }
  | {
      type: "alert";
      id: string;
      at: string;
      title: string;
      surface: RecommendationSurface;
      severity: string;
    };

export function MonitoringTimeline() {
  const { t } = useI18n();

  const items = useMemo(() => {
    const list: TimelineItem[] = [];
    getRecommendationIncidents()
      .slice(0, 5)
      .forEach((i) => {
        list.push({
          type: "incident",
          id: i.id,
          at: i.startedAt,
          title: i.title,
          surface: i.surface,
          status: i.status,
        });
      });
    getRecommendationDeployments()
      .slice(0, 5)
      .forEach((d) => {
        list.push({
          type: "deployment",
          id: d.id,
          at: d.deployedAt,
          title: d.deploymentName,
          surface: d.surface,
          status: d.deploymentStatus,
        });
      });
    getRecommendationAlertEvents({ limit: 5 }).forEach((e) => {
      list.push({
        type: "alert",
        id: e.id,
        at: e.createdAt,
        title: e.message,
        surface: e.surface,
        severity: e.severity,
      });
    });
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return list.slice(0, 15);
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_mon_empty_timeline")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="flex items-start gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        >
          <span
            className={`shrink-0 rounded px-2 py-0.5 sam-text-xxs font-medium ${
              item.type === "incident"
                ? "bg-amber-50 text-amber-800"
                : item.type === "deployment"
                  ? "bg-sam-surface-muted text-sam-fg"
                  : "bg-red-50 text-red-800"
            }`}
          >
            {item.type === "incident"
              ? t("admin_rec_mon_timeline_issue")
              : item.type === "deployment"
                ? t("admin_rec_mon_timeline_deploy")
                : t("admin_rec_mon_timeline_alert")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate sam-text-body font-medium text-sam-fg">
              {item.title}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {recSurfaceLabel(t, item.surface)}
              {"status" in item && ` · ${item.status}`}
              {"severity" in item && ` · ${item.severity}`}
            </p>
          </div>
          <span className="shrink-0 sam-text-helper text-sam-muted">
            {new Date(item.at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
