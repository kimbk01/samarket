"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import {
  MY_REPORT_SOURCE_KEY,
  MY_REPORT_STAGE_CLASS,
  MY_REPORT_STAGE_KEY,
} from "@/components/mypage/reports/MyReportLabels";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { fetchMypageListJson, useMypageCursorList, type MypageCursorPage } from "@/lib/mypage/use-mypage-cursor-list";
import type { MyReportItem } from "@/lib/reports/my-reports";

type Filter = "all" | "open" | "done";

/**
 * 내 신고 내역 (알림 최종 설계 §5-5 · D2) — 커뮤니티·메신저·거래 채팅·거래 신고 최신순, 상태 배지.
 * 신고 처리 알림의 목적지 목록이다.
 */
export function MyReportsListClient() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<MyReportItem>> => {
      const sp = new URLSearchParams({ limit: "20" });
      if (cursor) sp.set("cursor", cursor);
      if (filter !== "all") sp.set("filter", filter);
      const json = await fetchMypageListJson<{ ok?: boolean; items?: MyReportItem[]; next_cursor?: string | null }>(
        `/api/me/reports?${sp.toString()}`
      );
      if (!json.ok) throw new Error("my_reports_not_ok");
      return { items: json.items ?? [], next_cursor: json.next_cursor ?? null };
    },
    [filter]
  );

  const list = useMypageCursorList<MyReportItem>({
    cacheKey: `me:reports:${filter}`,
    fetchPage,
    getId: (r) => `${r.source}-${r.id}`,
  });

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("my_reports_filter_all") },
    { key: "open", label: t("my_reports_filter_open") },
    { key: "done", label: t("my_reports_filter_done") },
  ];

  return (
    <MyScreen title={t("my_reports_title")} backHref={CUSTOMER_CENTER_HREF} preferHistoryBack={false} template="list">
      <div className="flex flex-col gap-3 pb-4" data-testid="my-reports">
        <div className="flex gap-1.5" role="group">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-9 rounded-ui-rect border px-3 text-[13px] font-semibold ${
                filter === f.key
                  ? "border-sam-primary bg-sam-primary-soft text-sam-primary"
                  : "border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {list.status === "loading" ? (
          <MyStateView kind="loading" template="list" rows={5} />
        ) : list.status === "error" ? (
          <MyStateView
            kind="error"
            template="list"
            error={{ message: t("my_reports_load_failed"), onRetry: () => void list.reload() }}
          />
        ) : list.items.length === 0 ? (
          <MyStateView kind="empty" template="list" empty={{ title: t("my_reports_empty") }} />
        ) : (
          <>
            <ul className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
              {list.items.map((r, i) => (
                <li key={`${r.source}-${r.id}`} className={i === 0 ? "" : "border-t border-sam-border-soft"}>
                  <Link
                    href={r.href}
                    className="flex min-w-0 items-center gap-3 px-4 py-3.5 transition active:bg-sam-pressed-surface"
                    data-report-stage={r.stage}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-sam-fg">
                        {t(MY_REPORT_SOURCE_KEY[r.source])}
                        {r.reasonDetail ? ` · ${r.reasonDetail}` : ""}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-sam-muted">
                        {t("my_reports_reported_at", { date: formatMypageDate(r.createdAt) })}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-ui-rect px-2 py-0.5 text-[11px] font-semibold ${MY_REPORT_STAGE_CLASS[r.stage]}`}
                    >
                      {t(MY_REPORT_STAGE_KEY[r.stage])}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-sam-meta" strokeWidth={2} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <MyListPager
              hasMore={list.nextCursor != null}
              loading={list.loadingMore}
              error={list.loadMoreError}
              onLoadMore={list.loadMore}
            />
          </>
        )}
      </div>
    </MyScreen>
  );
}
