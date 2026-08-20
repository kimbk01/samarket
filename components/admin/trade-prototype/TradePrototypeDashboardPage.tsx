"use client";

import Link from "next/link";
import {
  MOCK_AD_SUMMARY,
  MOCK_KPI,
  MOCK_LISTINGS,
  MOCK_OPS_QUEUES,
  MOCK_RECENT_TRADES,
  MOCK_REPORT_SUMMARIES,
  MOCK_TOTAL_LISTINGS,
} from "./mock-data";
import { TRADE_PROTOTYPE_BASE } from "./trade-prototype-nav";
import {
  DisconnectedValue,
  KpiGrid,
  OpsPanel,
  ProtoButton,
  SectionHeader,
  TradeStatusBadge,
} from "./trade-prototype-ui";

export function TradePrototypeDashboardPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="거래 운영"
        description="Marketplace의 게시물, 거래, 신고, 홍보 상태를 관리합니다."
        actions={
          <>
            <ProtoButton variant="secondary">새로고침</ProtoButton>
            <Link href={`${TRADE_PROTOTYPE_BASE}/listings`} prefetch={false}>
              <ProtoButton variant="primary">게시물 등록 현황</ProtoButton>
            </Link>
          </>
        }
      />

      <KpiGrid items={[...MOCK_KPI]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <OpsPanel title="운영 대기" rows={MOCK_OPS_QUEUES} />

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">신고 검토</h2>
          </div>
          <ul className="divide-y divide-sam-border-soft">
            {MOCK_REPORT_SUMMARIES.map((r) => (
              <li key={r.postId} className="flex items-start justify-between gap-3 px-3 py-3">
                <div>
                  <p className="font-medium text-sam-fg">{r.title}</p>
                  <p className="sam-text-xxs text-sam-muted">판매자 {r.seller}</p>
                  <p className="mt-1 sam-text-body-secondary">
                    신고 {r.count}건 · 최근: {r.latestReason}
                  </p>
                </div>
                <Link href="/admin/reports" prefetch={false}>
                  <ProtoButton variant="secondary" size="sm">
                    검토
                  </ProtoButton>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="flex items-center justify-between border-b border-sam-border px-3 py-2">
          <h2 className="sam-text-body font-semibold text-sam-fg">최근 게시물</h2>
          <Link
            href={`${TRADE_PROTOTYPE_BASE}/listings`}
            prefetch={false}
            className="sam-text-body-secondary font-medium text-signature hover:underline"
          >
            전체 게시물 보기
          </Link>
        </div>
        <table className="w-full table-fixed text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border bg-sam-surface-muted/50 sam-text-xxs text-sam-muted">
            <tr>
              <th className="w-[22%] px-2 py-2">상품</th>
              <th className="w-[12%] px-2 py-2">판매자</th>
              <th className="w-[16%] px-2 py-2">분류</th>
              <th className="w-[10%] px-2 py-2">가격</th>
              <th className="w-[12%] px-2 py-2">지역</th>
              <th className="w-[10%] px-2 py-2">상태</th>
              <th className="w-[6%] px-2 py-2 text-center">찜</th>
              <th className="w-[6%] px-2 py-2 text-center">채팅</th>
              <th className="w-[6%] px-2 py-2 text-center">신고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {MOCK_LISTINGS.slice(0, 4).map((row) => (
              <tr key={row.id} className="hover:bg-sam-surface-muted/40">
                <td className="px-2 py-2">
                  <Link
                    href={`${TRADE_PROTOTYPE_BASE}/listings/${encodeURIComponent(row.id)}`}
                    prefetch={false}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 rounded-ui-rect bg-sam-surface-muted" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-sam-fg">{row.title}</span>
                      <span className="font-mono sam-text-xxs text-sam-muted">{row.shortId}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-2 py-2">
                  <span className="block truncate text-sam-fg">{row.sellerName}</span>
                  <span className="font-mono sam-text-xxs text-sam-muted">@{row.sellerHandle}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="block truncate">{row.subject}</span>
                  <span className="truncate sam-text-xxs text-sam-muted">{row.categoryPath}</span>
                </td>
                <td className="px-2 py-2 tabular-nums">{row.price}</td>
                <td className="truncate px-2 py-2">{row.region}</td>
                <td className="px-2 py-2">
                  <TradeStatusBadge status={row.status} />
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{row.likes ?? "—"}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.chats ?? "—"}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.reports ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-sam-border px-3 py-2 sam-text-xxs text-sam-muted">
          목록 fixture {MOCK_LISTINGS.length}건 · 전체 {MOCK_TOTAL_LISTINGS}건은 감사 스크린샷 기준
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">최근 거래</h2>
          </div>
          <table className="w-full table-fixed sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="w-[28%] px-3 py-2 text-left">상품</th>
                <th className="w-[16%] px-3 py-2 text-left">판매자</th>
                <th className="w-[16%] px-3 py-2 text-left">구매자</th>
                <th className="w-[24%] px-3 py-2 text-left">흐름</th>
                <th className="w-[16%] px-3 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {MOCK_RECENT_TRADES.map((t) => (
                <tr key={`${t.postTitle}-${t.buyer}`}>
                  <td className="truncate px-3 py-2">{t.postTitle}</td>
                  <td className="px-3 py-2">{t.seller}</td>
                  <td className="px-3 py-2 font-mono sam-text-xxs">{t.buyer}</td>
                  <td className="px-3 py-2 font-mono sam-text-xxs">{t.flow}</td>
                  <td className="px-3 py-2">{t.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-sam-border px-3 py-2">
            <Link href={`${TRADE_PROTOTYPE_BASE}/operations`} prefetch={false}>
              <ProtoButton variant="ghost" size="sm">
                거래 운영 보기
              </ProtoButton>
            </Link>
          </div>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">광고 / 더 알리기</h2>
          </div>
          <dl className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-2">
            {MOCK_AD_SUMMARY.map((row) => (
              <div key={row.label} className="rounded-ui-rect border border-sam-border-soft px-2 py-2">
                <dt className="sam-text-xxs text-sam-muted">{row.label}</dt>
                <dd className="mt-0.5">
                  {row.disconnected ? <DisconnectedValue /> : row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
