"use client";

import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getRecommendationDeployments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import {
  fetchRecommendationAlertEventsPage,
  fetchRecommendationIncidentsPage,
} from "@/lib/recommendation-ops/recommendation-records-client";
import type { RecommendationAlertEvent, RecommendationIncident } from "@/lib/types/recommendation-monitoring";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

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

/** 타임라인 = 종류별 최신 5건 (요약 미리보기 — 전체 목록은 이슈·알림 이벤트 탭의 서버 페이지). */
const TIMELINE_PER_KIND = 5;

type Recent =
  | { status: "loading" }
  | { status: "error"; code: string; httpStatus?: number }
  | { status: "ready"; incidents: RecommendationIncident[]; alerts: RecommendationAlertEvent[] };

export function MonitoringTimeline() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [recent, setRecent] = useState<Recent>({ status: "loading" });
  const seqRef = useRef(0);

  /** 이슈·알림 최신 5건 = DB 서버 페이지 1장씩 (예전: 메모리 묶음에서 잘라 씀). */
  const load = useCallback(() => {
    const seq = ++seqRef.current;
    void Promise.all([
      fetchRecommendationIncidentsPage({ limit: TIMELINE_PER_KIND, offset: 0 }),
      fetchRecommendationAlertEventsPage({ limit: TIMELINE_PER_KIND, offset: 0 }),
    ]).then(([inc, ae]) => {
      if (seq !== seqRef.current) return;
      if (!inc.ok) return setRecent({ status: "error", code: inc.error, httpStatus: inc.httpStatus });
      if (!ae.ok) return setRecent({ status: "error", code: ae.error, httpStatus: ae.httpStatus });
      setRecent({ status: "ready", incidents: inc.value.rows, alerts: ae.value.rows });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => {
    if (recent.status !== "ready") return [];
    const list: TimelineItem[] = [];
    recent.incidents
      .slice(0, TIMELINE_PER_KIND)
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
      .slice(0, TIMELINE_PER_KIND)
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
    recent.alerts.slice(0, TIMELINE_PER_KIND).forEach((e) => {
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
  }, [recent]);

  if (recent.status === "loading") return <AdminLoadingState ko={ko} />;
  if (recent.status === "error") {
    return <AdminErrorState ko={ko} code={recent.code} httpStatus={recent.httpStatus} onRetry={load} />;
  }

  if (items.length === 0) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_rec_mon_empty_timeline")} />
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
                ? "bg-sam-warning-soft text-sam-warning"
                : item.type === "deployment"
                  ? "bg-sam-surface-muted text-sam-fg"
                  : "bg-sam-danger-soft text-sam-danger"
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
            {formatAdminManilaDateTime(item.at)}
          </span>
        </div>
      ))}
    </div>
  );
}
