"use client";

/**
 * 커뮤니티 대시보드 (설계 §D) — 지금 처리할 일 → 현재 상태 → 기간 통계 → 최근 처리·최근 신고.
 * - 처리 대기는 기간과 무관한 현재 값, 기간 통계만 선택 기간(필리핀 시간)을 따른다.
 * - 값을 확인하지 못한 지표는 「확인 불가」 (0 으로 표시하지 않는다). 권한 밖 지표는 서버가 뺀다.
 * - 화면이 보이는 동안 60초마다 서버 값을 다시 읽는다 (Realtime 구독 없음).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition, type ReactNode } from "react";
import type { AdminDomainDashboardModel, AdminDomainMetric } from "@/lib/admin/domain-dashboard/types";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  adminCommunityLabel,
  splitCommunityReportReason,
} from "@/lib/admin/status-labels/community-status-labels";
import { useCommunityQueryState, CommunityTimeCell } from "@/components/admin/community/kit/CommunityAdminKit";
import { CommunityStatsPeriodPicker } from "@/components/admin/community/dashboard/CommunityStatsPeriodPicker";
import {
  communityAuditActionLabel,
  communityAuditTargetLabel,
} from "@/components/admin/community/audit/community-audit-labels";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";

const AUTO_REFRESH_MS = 60_000;

function MetricValue({ value }: { value: number | null }) {
  if (value === null) return <AdminUnavailableChip ko />;
  return <span className="text-[22px] font-bold leading-7 text-sam-fg">{value.toLocaleString()}</span>;
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
}: {
  label: string;
  value: number | null;
  href?: string;
  sub?: ReactNode;
  danger?: boolean;
}) {
  const body = (
    <div
      className={[
        "flex h-full flex-col justify-between gap-2 rounded-ui-rect border bg-sam-surface p-3",
        danger ? "border-red-300" : "border-sam-border",
        href ? "hover:border-sam-primary" : "",
      ].join(" ")}
    >
      <span className={["text-[13px] font-medium", danger ? "text-red-800" : "text-sam-muted"].join(" ")}>{label}</span>
      <MetricValue value={value} />
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

const GRID = "grid gap-2 sm:grid-cols-2 lg:grid-cols-4";

/** 「기간 통계」 신규 게시글은 회원/외부 수집/현재 공개를 한 카드에 묶는다 */
const POST_PARTS = ["community.period.posts_member", "community.period.posts_imported", "community.period.posts_active_now"];

function periodLabel(range: AdminDomainDashboardModel["periodRange"]): string {
  if (!range) return "";
  if (range.from && range.to) return range.from === range.to ? range.from : `${range.from} ~ ${range.to}`;
  return "";
}

export function CommunityDashboard({
  model,
  isSuperAdmin,
}: {
  model: AdminDomainDashboardModel;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const q = useCommunityQueryState();
  const [refreshing, startRefresh] = useTransition();

  const refresh = () => startRefresh(() => router.refresh());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const updated = model.lastUpdatedAt ? formatAdminManilaDateTime(model.lastUpdatedAt).slice(11) : null;
  const pending = [...model.issues.map((i) => ({ ...i, danger: true })), ...model.actionRequired.map((i) => ({ ...i, danger: false }))];
  const periodStats: AdminDomainMetric[] = model.periodStats ?? model.domainHealth;
  const byId = new Map(periodStats.map((m) => [m.id, m]));
  const postsTotal = byId.get("community.period.posts_total");
  const otherPeriod = periodStats.filter((m) => m.id !== "community.period.posts_total" && !POST_PARTS.includes(m.id));
  const part = (id: string) => {
    const v = byId.get(id)?.value;
    return v === null || v === undefined ? "확인 불가" : v.toLocaleString();
  };

  const entries = [...model.primaryEntries, ...model.contextEntries].filter((e) => e.id !== "reset");
  const reset = model.contextEntries.find((e) => e.id === "reset");

  return (
    <div data-community-dashboard="1" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">커뮤니티 대시보드</h1>
          <p className="mt-1 sam-text-body text-sam-muted">처리 대기부터 확인하세요. 기준: 필리핀 시간</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-sam-muted">
          <span data-community-dashboard-updated="1">마지막 갱신 {updated ? `${updated} PHT` : "—"}</span>
          <AdminActionButton variant="secondary" disabled={refreshing} onClick={refresh}>
            {refreshing ? "새로고침 중…" : "새로고침"}
          </AdminActionButton>
        </div>
      </header>

      {model.sectionErrors.length > 0 ? (
        <div role="status" className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
          일부 지표를 확인하지 못했습니다. 해당 지표는 「확인 불가」로 표시됩니다.
          <AdminTechDetails ko>
            {model.sectionErrors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </AdminTechDetails>
        </div>
      ) : null}

      <Section title="지금 처리할 일" hint="화면이 열려 있는 동안 1분마다 자동 갱신">
        {pending.length === 0 ? (
          <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-center text-[13px] text-sam-muted">
            지금 처리할 일이 없습니다.
          </p>
        ) : (
          <div className={GRID}>
            {pending.map((a) => (
              <MetricCard key={a.id} label={a.labelKo} value={a.count} href={a.href || undefined} danger={a.danger} />
            ))}
          </div>
        )}
      </Section>

      <Section title="현재 상태">
        <div className={GRID}>
          {model.currentState.map((m) => (
            <MetricCard key={m.id} label={m.labelKo} value={m.value} href={m.href} />
          ))}
        </div>
      </Section>

      <Section
        title="기간 통계"
        hint={periodLabel(model.periodRange) ? `${periodLabel(model.periodRange)} (필리핀 시간)` : undefined}
      >
        <div className="flex flex-wrap items-end gap-2">
          <CommunityStatsPeriodPicker
            key={`${model.periodRange?.period}-${model.periodRange?.from}-${model.periodRange?.to}`}
            period={q.get("period") || model.periodRange?.period || "7d"}
            from={q.get("from") || model.periodRange?.from || ""}
            to={q.get("to") || model.periodRange?.to || ""}
            onChange={(v) => q.set({ period: v.period, from: v.from || null, to: v.to || null })}
          />
          <AdminActionLink
            href={`/admin/community/stats?${new URLSearchParams(
              Object.fromEntries(
                Object.entries({
                  period: model.periodRange?.period ?? "7d",
                  from: model.periodRange?.period === "custom" ? model.periodRange?.from ?? "" : "",
                  to: model.periodRange?.period === "custom" ? model.periodRange?.to ?? "" : "",
                }).filter(([, v]) => v)
              )
            ).toString()}`}
            variant="ghost"
          >
            운영 통계 자세히 보기
          </AdminActionLink>
        </div>
        <div className={GRID}>
          {postsTotal ? (
            <MetricCard
              label={postsTotal.labelKo}
              value={postsTotal.value}
              href={postsTotal.href}
              sub={`회원 ${part("community.period.posts_member")} · 외부 수집 ${part(
                "community.period.posts_imported"
              )} · 현재 공개 ${part("community.period.posts_active_now")}`}
            />
          ) : null}
          {otherPeriod.map((m) => (
            <MetricCard key={m.id} label={m.labelKo} value={m.value} href={m.href} />
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="최근 처리" hint={<Link href="/admin/community/audit" className="underline">운영 기록 전체</Link>}>
          <RecentList
            empty="최근 관리자 조치가 없습니다."
            items={model.recent.map((r) => {
              const [who, targetType] = String(r.metaKo ?? "").split(" · ");
              return {
                id: r.id,
                title: communityAuditActionLabel(r.title),
                meta: `${who || "관리자"} · ${communityAuditTargetLabel(targetType)}`,
                href: r.href,
                at: r.at ?? null,
              };
            })}
          />
        </Section>
        <Section
          title="최근 신고"
          hint={<Link href="/admin/community/reports?tab=pending" className="underline">신고 처리함</Link>}
        >
          <RecentList
            empty="최근 신고가 없습니다."
            items={(model.recentReports ?? []).map((r) => {
              const { code, text } = splitCommunityReportReason(r.title);
              const [target, status] = String(r.metaKo ?? "").split(" · ");
              return {
                id: r.id,
                title: `${adminCommunityLabel("report_reason", code, true).label}${text ? ` · ${text.slice(0, 40)}` : ""}`,
                meta: adminCommunityLabel("report_target", target, true).label,
                badge: adminCommunityLabel("report_status", status, true),
                href: r.href,
                at: r.at ?? null,
              };
            })}
          />
        </Section>
      </div>

      <Section title="운영 바로가기">
        <div className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <AdminActionLink key={e.id} href={e.href} variant="secondary">
              {e.labelKo}
            </AdminActionLink>
          ))}
        </div>
        {isSuperAdmin && reset ? (
          <p className="pt-2 text-[12px] text-sam-muted">
            최고 관리자 전용 ·{" "}
            <Link href={reset.href} prefetch={false} className="underline">
              {reset.labelKo}
            </Link>
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function RecentList({
  items,
  empty,
}: {
  items: {
    id: string;
    title: string;
    meta: string;
    href?: string;
    at: string | null;
    badge?: { label: string; tone: Parameters<typeof AdminToneBadge>[0]["tone"] };
  }[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-center text-[13px] text-sam-muted">
        {empty}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
      {items.map((it) => {
        const row = (
          <div className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
            <div className="min-w-0">
              <p className="truncate font-medium text-sam-fg">{it.title}</p>
              <p className="text-[12px] text-sam-muted">{it.meta}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-[12px] text-sam-muted">
              {it.badge ? <AdminToneBadge tone={it.badge.tone}>{it.badge.label}</AdminToneBadge> : null}
              <CommunityTimeCell iso={it.at} />
            </div>
          </div>
        );
        return (
          <li key={it.id}>
            {it.href ? (
              <Link href={it.href} prefetch={false} className="block hover:bg-sam-app">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
