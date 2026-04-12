"use client";

import { useMemo } from "react";
import { getRecommendationIncidents } from "@/lib/recommendation-monitoring/mock-recommendation-incidents";
import { getRecommendationDeployments } from "@/lib/recommendation-deployments/mock-recommendation-deployments";
import { getRecommendationAlertEvents } from "@/lib/recommendation-monitoring/mock-recommendation-alert-events";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

type TimelineItem =
  | { type: "incident"; id: string; at: string; title: string; surface: string; status: string }
  | { type: "deployment"; id: string; at: string; title: string; surface: string; status: string }
  | { type: "alert"; id: string; at: string; title: string; surface: string; severity: string };

export function MonitoringTimeline() {
  const items = useMemo(() => {
    const list: TimelineItem[] = [];
    getRecommendationIncidents().slice(0, 5).forEach((i) => {
      list.push({
        type: "incident",
        id: i.id,
        at: i.startedAt,
        title: i.title,
        surface: SURFACE_LABELS[i.surface],
        status: i.status,
      });
    });
    getRecommendationDeployments().slice(0, 5).forEach((d) => {
      list.push({
        type: "deployment",
        id: d.id,
        at: d.deployedAt,
        title: d.deploymentName,
        surface: SURFACE_LABELS[d.surface],
        status: d.deploymentStatus,
      });
    });
    getRecommendationAlertEvents({ limit: 5 }).forEach((e) => {
      list.push({
        type: "alert",
        id: e.id,
        at: e.createdAt,
        title: e.message,
        surface: SURFACE_LABELS[e.surface],
        severity: e.severity,
      });
    });
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return list.slice(0, 15);
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        최근 이벤트가 없습니다.
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
            className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${
              item.type === "incident"
                ? "bg-amber-50 text-amber-800"
                : item.type === "deployment"
                  ? "bg-sam-surface-muted text-sam-fg"
                  : "bg-red-50 text-red-800"
            }`}
          >
            {item.type === "incident"
              ? "이슈"
              : item.type === "deployment"
                ? "배포"
                : "알림"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-sam-fg">
              {item.title}
            </p>
            <p className="text-[12px] text-sam-muted">
              {item.surface}
              {"status" in item && ` · ${item.status}`}
              {"severity" in item && ` · ${item.severity}`}
            </p>
          </div>
          <span className="shrink-0 text-[12px] text-sam-muted">
            {new Date(item.at).toLocaleString("ko-KR")}
          </span>
        </div>
      ))}
    </div>
  );
}
