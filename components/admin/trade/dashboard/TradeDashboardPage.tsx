"use client";

/**
 * 거래 대시보드 (설계 v2 §E) — ① 처리 대기(기간 무관) ② 현재 상태 ③ 기간 통계(선택 기간, 필리핀 시간).
 * 모든 카드는 같은 조건의 목록으로 이동한다. 값을 확인하지 못한 지표는 「확인 불가」 (0 으로 표시하지 않음).
 * URL: period=today|7d|30d|custom (+from,to)
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useCommunityQueryState, CommunityTimeCell } from "@/components/admin/community/kit/CommunityAdminKit";
import { CommunityStatsPeriodPicker } from "@/components/admin/community/dashboard/CommunityStatsPeriodPicker";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { buildAdminPrelaunchResetHref, DOMAIN_RESET_SCOPE_PRESETS } from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import { TRADE_POST_TAB_LABELS, type TradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";
import { formatTradePoints } from "@/components/admin/trade/kit/TradeAdminKit";
import { tradeAuditActionLabel, tradeAuditTargetLabel } from "@/components/admin/trade/audit/TradeAuditPage";

type N = number | null;

type OverviewResponse = {
  ok?: boolean;
  error?: string;
  periodKind?: string;
  period?: { fromDate: string | null; toDate: string | null };
  pending?: {
    openReports: N;
    promotionReview: N;
    openSupport: N;
    activeRestrictions: N;
    overduePromotions: N;
  };
  current?: Record<TradePostTab, N> & { activePromotions: N };
  inPeriod?: {
    newPosts: N;
    completed: N;
    adminCompletedNoTime: N;
    reportsReceived: N;
    reportsProcessed: N;
    chatsStarted: N;
    promotionsStarted: N;
    promotionsEnded: N;
    promotionPointsUsed: N;
    promotionPointsRefunded: N;
    supportReceived: N;
    adminActions: N;
  };
  byCategory?: { id: string | null; name: string; count: number }[] | null;
  byRegion?: { lguId: string | null; name: string; count: number }[] | null;
  recentActions?: { id: string; at: string; action: string; targetType: string; targetId: string; actorId: string | null }[] | null;
  errors?: string[];
};

const PERIODS = ["today", "7d", "30d", "custom"];
const GRID = "grid gap-2 sm:grid-cols-2 lg:grid-cols-4";
const POST_TABS: TradePostTab[] = [
  "all",
  "visible",
  "selling",
  "reserved",
  "sold",
  "admin_hidden",
  "admin_deleted",
  "owner_hidden",
  "owner_deleted",
  "legacy_hidden",
  "reported",
  "unclassified",
];

function n(v: N | undefined): N {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function MetricValue({ value, points }: { value: N; points?: boolean }) {
  if (value === null) return <AdminUnavailableChip ko />;
  return (
    <span className="text-[22px] font-bold leading-7 text-sam-fg">{points ? formatTradePoints(value) : value.toLocaleString()}</span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-sam-fg">{title}</h2>
        {hint ? <div className="text-[12px] text-sam-muted">{hint}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  href,
  sub,
  danger,
  points,
}: {
  label: string;
  value: N;
  href?: string;
  sub?: ReactNode;
  danger?: boolean;
  points?: boolean;
}) {
  const body = (
    <div
      className={[
        "flex h-full flex-col justify-between gap-2 rounded-ui-rect border bg-sam-surface p-3",
        danger && (value ?? 0) > 0 ? "border-red-300" : "border-sam-border",
        href ? "hover:border-sam-primary" : "",
      ].join(" ")}
    >
      <span className={["text-[13px] font-medium", danger && (value ?? 0) > 0 ? "text-red-800" : "text-sam-muted"].join(" ")}>
        {label}
      </span>
      <MetricValue value={value} points={points} />
      {sub ? <span className="text-[12px] text-sam-muted">{sub}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} prefetch={false} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-center text-[13px] text-sam-muted">{text}</p>
  );
}

export function TradeDashboardPage() {
  const q = useCommunityQueryState();
  const rawPeriod = q.get("period");
  const period = PERIODS.includes(rawPeriod) ? rawPeriod : "7d";
  const from = period === "custom" ? q.get("from") : "";
  const to = period === "custom" ? q.get("to") : "";
  const customIncomplete = period === "custom" && (!from || !to);

  const periodQs = new URLSearchParams({ period });
  if (period === "custom") {
    periodQs.set("from", from);
    periodQs.set("to", to);
  }
  const periodSuffix = periodQs.toString();

  const { state, reload } = useCommunityAdminJson<OverviewResponse>(
    customIncomplete ? null : `/api/admin/trade/overview?${periodSuffix}`
  );
  const data = state.data;
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    if (state.status === "ok") setLoadedAt(new Date().toISOString());
  }, [state]);

  const pending = data?.pending;
  const current = data?.current;
  const inPeriod = data?.inPeriod;
  const errors = data?.errors ?? [];
  const range = data?.period;
  const rangeText =
    range?.fromDate && range?.toDate ? (range.fromDate === range.toDate ? range.fromDate : `${range.fromDate} ~ ${range.toDate}`) : "";

  const postsHref = (tab: string) => `/admin/posts-management?tab=${tab}`;
  const adminCompletedNoTime = n(inPeriod?.adminCompletedNoTime);

  return (
    <div data-trade-dashboard="1" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">거래 대시보드</h1>
          <p className="mt-1 sam-text-body text-sam-muted">처리 대기부터 확인하세요. 기준: 필리핀 시간</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-sam-muted">
          <span>마지막 갱신 {loadedAt ? `${formatAdminManilaDateTime(loadedAt).slice(11)} PHT` : "—"}</span>
          <AdminActionButton variant="secondary" disabled={state.status === "loading" || customIncomplete} onClick={reload}>
            {state.status === "loading" ? "새로고침 중…" : "새로고침"}
          </AdminActionButton>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <CommunityStatsPeriodPicker
          key={`${period}-${from}-${to}`}
          period={period}
          from={from}
          to={to}
          onChange={(v) => q.set({ period: v.period === "7d" ? null : v.period, from: v.from || null, to: v.to || null })}
        />
      </div>

      {customIncomplete ? (
        <EmptyBox text="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : !data ? (
        <AdminLoadingState ko />
      ) : (
        <>
          {errors.length > 0 ? (
            <div role="status" className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
              일부 지표를 불러오지 못했습니다. 해당 지표는 「확인 불가」로 표시됩니다.
              <AdminTechDetails ko>
                {errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </AdminTechDetails>
            </div>
          ) : null}

          <Section title="처리 대기" hint="기간과 관계없는 현재 값">
            <div className={GRID}>
              <MetricCard label="처리할 신고" value={n(pending?.openReports)} href="/admin/trade/reports?tab=open" danger />
              <MetricCard
                label="홍보 승인 대기"
                value={n(pending?.promotionReview)}
                href="/admin/trade/promotions?tab=pending_review"
                danger
              />
              <MetricCard label="답변 대기 문의" value={n(pending?.openSupport)} href="/admin/trade/support" danger />
              <MetricCard label="진행 중인 거래 제한" value={n(pending?.activeRestrictions)} href="/admin/trade/restrictions" />
              <MetricCard
                label="종료일 지난 홍보"
                value={n(pending?.overduePromotions)}
                href="/admin/trade/promotions?tab=active"
                danger
              />
            </div>
          </Section>

          <Section title="현재 상태">
            <div className={GRID}>
              {POST_TABS.map((tab) => (
                <MetricCard
                  key={tab}
                  label={tab === "all" ? "전체 거래글" : TRADE_POST_TAB_LABELS[tab]}
                  value={n(current?.[tab])}
                  href={postsHref(tab)}
                />
              ))}
              <MetricCard label="노출 중인 홍보" value={n(current?.activePromotions)} href="/admin/trade/promotions?tab=active" />
            </div>
          </Section>

          <Section title="기간 통계" hint={rangeText ? `${rangeText} (필리핀 시간)` : undefined}>
            <div className={GRID}>
              <MetricCard
                label="새 거래글"
                value={n(inPeriod?.newPosts)}
                href={`/admin/posts-management?tab=all&${periodSuffix}`}
              />
              <MetricCard
                label="거래 완료"
                value={n(inPeriod?.completed)}
                href={postsHref("sold")}
                sub={
                  adminCompletedNoTime === null
                    ? "완료 시각 없는 관리자 완료 정정: 확인 불가"
                    : adminCompletedNoTime > 0
                      ? `완료 시각 없는 관리자 완료 정정 ${adminCompletedNoTime.toLocaleString()}건 (별도)`
                      : undefined
                }
              />
              <MetricCard
                label="접수된 신고"
                value={n(inPeriod?.reportsReceived)}
                href={`/admin/trade/reports?tab=all&${periodSuffix}`}
              />
              <MetricCard
                label="처리한 신고"
                value={n(inPeriod?.reportsProcessed)}
                href={`/admin/trade/reports?tab=all&${periodSuffix}`}
              />
              <MetricCard label="시작된 거래 채팅" value={n(inPeriod?.chatsStarted)} />
              <MetricCard
                label="시작된 홍보"
                value={n(inPeriod?.promotionsStarted)}
                href={`/admin/trade/promotions?tab=all&${periodSuffix}`}
              />
              <MetricCard
                label="종료된 홍보"
                value={n(inPeriod?.promotionsEnded)}
                href={`/admin/trade/promotions?tab=ended&${periodSuffix}`}
              />
              <MetricCard
                label="홍보 사용 포인트"
                value={n(inPeriod?.promotionPointsUsed)}
                points
                href={`/admin/trade/points?type=promotion_order&${periodSuffix}`}
              />
              <MetricCard
                label="홍보 환급 포인트"
                value={n(inPeriod?.promotionPointsRefunded)}
                points
                href={`/admin/trade/points?type=promotion_order&${periodSuffix}`}
              />
              <MetricCard label="접수된 문의" value={n(inPeriod?.supportReceived)} href="/admin/trade/support" />
              <MetricCard
                label="관리자 조치"
                value={n(inPeriod?.adminActions)}
                href={`/admin/trade/audit?${periodSuffix}`}
              />
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="카테고리별 거래글 (상위 10)">
              <TopList
                rows={data.byCategory ?? null}
                render={(r) => ({ key: r.id ?? "none", name: r.name, count: r.count })}
              />
            </Section>
            <Section title="지역별 거래글 (상위 10)" hint={<Link href="/admin/trade/regions" className="underline">지역 현황 전체</Link>}>
              <TopList
                rows={data.byRegion ?? null}
                render={(r) => ({
                  key: r.lguId ?? "none",
                  name: r.name,
                  count: r.count,
                  href: r.lguId ? `/admin/posts-management?lguId=${encodeURIComponent(r.lguId)}` : undefined,
                })}
              />
            </Section>
          </div>

          <Section
            title="최근 관리자 조치"
            hint={
              <span className="flex gap-3">
                <Link href="/admin/trade/audit" className="underline">운영 기록 전체</Link>
                <Link href={buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.trade)} className="underline">
                  테스트 거래 데이터 정리
                </Link>
              </span>
            }
          >
            {data.recentActions === null || data.recentActions === undefined ? (
              <EmptyBox text="최근 조치를 확인할 수 없습니다." />
            ) : data.recentActions.length === 0 ? (
              <EmptyBox text="최근 관리자 조치가 없습니다." />
            ) : (
              <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
                {data.recentActions.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/trade/audit?targetType=${encodeURIComponent(r.targetType)}&targetId=${encodeURIComponent(r.targetId)}`}
                      prefetch={false}
                      className="flex items-start justify-between gap-3 px-3 py-2 text-[13px] hover:bg-sam-app"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-sam-fg">{tradeAuditActionLabel(r.action)}</span>
                        <span className="block text-[12px] text-sam-muted">{tradeAuditTargetLabel(r.targetType)}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-sam-muted">
                        <CommunityTimeCell iso={r.at} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function TopList<T>({
  rows,
  render,
}: {
  rows: T[] | null;
  render: (r: T) => { key: string; name: string; count: number; href?: string };
}) {
  if (rows === null) return <EmptyBox text="확인 불가" />;
  if (rows.length === 0) return <EmptyBox text="표시할 항목이 없습니다." />;
  return (
    <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
      {rows.map((raw) => {
        const r = render(raw);
        const line = (
          <span className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span className="min-w-0 truncate text-sam-fg">{r.name}</span>
            <span className="shrink-0 font-semibold text-sam-fg">{r.count.toLocaleString()}</span>
          </span>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} prefetch={false} className="block hover:bg-sam-app">
                {line}
              </Link>
            ) : (
              line
            )}
          </li>
        );
      })}
    </ul>
  );
}
