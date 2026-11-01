"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import {
  MY_REPORT_SOURCE_KEY,
  MY_REPORT_STAGE_CLASS,
  MY_REPORT_STAGE_KEY,
} from "@/components/mypage/reports/MyReportLabels";
import { formatNotificationDetailDateTime } from "@/lib/notifications/notification-detail-presentation";
import { resolveNotificationAwareDetailBackHref } from "@/lib/notifications/notification-entry-from";
import { fetchMypageListJson, MypageListHttpError } from "@/lib/mypage/use-mypage-cursor-list";
import type { MyReportItem, MyReportSource } from "@/lib/reports/my-reports";
import { Sam } from "@/lib/ui/sam-component-classes";

const REPORTS_HREF = "/mypage/reports";

/**
 * 신고 건 상세 (알림 최종 설계 §5-5) — 진행 단계 접수 → 검토 중 → 결과, 저장된 시각만.
 * 신고 처리 알림을 누르면 이 화면이 열린다. 하단 = 「신고 내역」 · 「결과 이의 · 고객센터 문의」.
 */
export function MyReportDetailClient({
  source,
  reportId,
  from = null,
}: {
  source: MyReportSource;
  reportId: string;
  /** `from=notifications` = 종·알림 목록에서 열림 → 뒤로 = 알림 (고객센터 글 상세와 같은 규칙 · 재감사 2026-11-02 M3). */
  from?: string | null;
}) {
  const { t, language } = useI18n();
  const [report, setReport] = useState<MyReportItem | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void fetchMypageListJson<{ ok?: boolean; report?: MyReportItem }>(
      `/api/me/reports/${source}/${encodeURIComponent(reportId)}`
    )
      .then((j) => {
        if (cancelled) return;
        if (j.ok && j.report) {
          setReport(j.report);
          setStatus("ready");
        } else setStatus("error");
      })
      .catch((e) => {
        if (!cancelled) setStatus(e instanceof MypageListHttpError && e.status === 404 ? "not_found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [source, reportId, reloadKey]);

  const when = (iso: string | null) => (iso ? formatNotificationDetailDateTime(iso, language) : "");

  let body;
  if (status === "loading") body = <MyStateView kind="loading" template="detail" />;
  else if (status === "not_found")
    body = (
      <MyStateView
        kind="empty"
        template="detail"
        empty={{
          title: t("my_report_not_found"),
          cta: (
            <Link href={REPORTS_HREF} className={`${Sam.btn.secondaryCombo} ${Sam.focusRing}`}>
              {t("my_reports_title")}
            </Link>
          ),
        }}
      />
    );
  else if (status === "error" || !report)
    body = (
      <MyStateView
        kind="error"
        template="detail"
        error={{ message: t("my_reports_load_failed"), onRetry: () => setReloadKey((k) => k + 1) }}
      />
    );
  else {
    const done = report.stage === "resolved" || report.stage === "rejected";
    const steps: { key: string; label: string; sub: string; on: boolean }[] = [
      { key: "received", label: t("my_report_step_received"), sub: when(report.createdAt), on: true },
      {
        key: "reviewing",
        label: t("my_report_step_reviewing"),
        sub: report.stage === "reviewing" ? t("my_report_step_reviewing_now") : "",
        on: report.stage !== "received",
      },
      {
        key: "result",
        label: done
          ? t("my_report_step_result", { result: t(MY_REPORT_STAGE_KEY[report.stage]) })
          : t("my_report_step_result_pending"),
        sub: done ? when(report.processedAt) : "",
        on: done,
      },
    ];
    body = (
      <div className="flex flex-col gap-3" data-testid="my-report-detail" data-report-stage={report.stage}>
        <article className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
          <header className="px-4 pb-3 pt-4">
            <span className="inline-block rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 text-[12px] font-semibold text-sam-fg">
              {t(MY_REPORT_SOURCE_KEY[report.source])}
            </span>
            <h1 className="mt-2 flex items-center gap-2 text-[19px] font-bold leading-snug text-sam-fg">
              <span
                className={`rounded-ui-rect px-2 py-0.5 text-[13px] font-semibold ${MY_REPORT_STAGE_CLASS[report.stage]}`}
              >
                {t(MY_REPORT_STAGE_KEY[report.stage])}
              </span>
            </h1>
            {report.reasonDetail ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-sam-fg">
                {report.reasonDetail}
              </p>
            ) : null}
          </header>
          <ol className="border-t border-sam-border-soft px-4 py-3" data-testid="my-report-steps">
            {steps.map((s, i) => (
              <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0" data-step-on={s.on ? "1" : "0"}>
                {i < steps.length - 1 ? (
                  <span aria-hidden className="absolute left-[6px] top-4 bottom-0 w-0.5 bg-sam-border-soft" />
                ) : null}
                <span
                  aria-hidden
                  className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${s.on ? "bg-sam-primary" : "bg-sam-border"}`}
                />
                <span className="min-w-0">
                  <span className={`block text-[14px] font-semibold ${s.on ? "text-sam-fg" : "text-sam-muted"}`}>
                    {s.label}
                  </span>
                  {s.sub ? <span className="block text-[12px] text-sam-muted">{s.sub}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </article>
        <div className="mt-2 flex flex-col gap-2">
          <Link
            href={REPORTS_HREF}
            className={`${Sam.btn.primaryCombo} ${Sam.focusRing} flex min-h-12 w-full items-center justify-center`}
            data-testid="my-report-to-list"
          >
            {t("my_reports_title")}
          </Link>
          {/* 실기 2026-11-01: 결과가 나오기 전에는 이의 버튼이 의미 없어 결과 후에만 */}
          {done ? (
            <Link
              href="/support/enter"
              className={`${Sam.btn.secondaryCombo} ${Sam.focusRing} flex min-h-12 w-full items-center justify-center`}
            >
              {t("my_report_appeal_cta")}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <MyScreen
      title={t("my_report_detail_title")}
      backHref={resolveNotificationAwareDetailBackHref({ from, fallbackHref: REPORTS_HREF })}
      preferHistoryBack={false}
      template="detail"
    >
      <div className="pb-6">{body}</div>
    </MyScreen>
  );
}
