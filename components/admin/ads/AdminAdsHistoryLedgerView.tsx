"use client";

/**
 * CUT R7 — Ads History / Audit Ledger UI (read-only).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type {
  AdsHistoryDomainFilter,
  AdsHistoryLedgerModel,
  AdsHistoryLedgerRow,
  AdsHistoryStatusFilter,
} from "@/lib/admin/ads-history/types";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminStatusLabelText } from "@/lib/admin/status-labels/admin-status-label-registry";
import "@/lib/admin/status-labels/ads-status-labels";


/** 표준 표 행 — 요약 열 + 「상세」 토글. 펼치면 아래 행에 증거·타임라인(읽기 전용)을 보인다. */
function LedgerRow({
  row,
  ko,
  open,
  onToggle,
}: {
  row: AdsHistoryLedgerRow;
  ko: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-sam-border/70 align-top"
        data-ads-history-row={row.id}
        data-ads-history-product={row.productKey}
        data-ads-history-legacy={row.legacy ? "1" : "0"}
        data-ads-history-sellable={row.sellable ? "1" : "0"}
      >
        <td className="whitespace-nowrap py-2 pr-2 text-[12px] text-sam-muted">
          {formatAdminManilaDateTime(row.lastEventAt)}
        </td>
        <td className="py-2 pr-2 text-sam-fg">
          <span className="font-semibold">[{adminStatusLabelText("ads.domain", row.domain, ko)}]</span>{" "}
          {ko ? row.productLabelKo : row.productLabelEn}
          {row.legacy ? (
            <span className="ml-2 rounded-full bg-sam-app px-2 py-0.5 text-[12px] font-bold text-sam-muted">
              {ko ? "레거시" : "Legacy"}
            </span>
          ) : null}
        </td>
        <td className="max-w-[16rem] py-2 pr-2 text-sam-fg">
          <p className="truncate">{row.campaignTitle}</p>
          <p className="text-[12px] text-sam-muted">{ko ? row.lifecycleSummaryKo : row.lifecycleSummaryEn}</p>
        </td>
        <td className="py-2 pr-2 text-[12px] text-sam-muted">
          {ko ? row.sourceLabelKo : row.sourceLabelEn}
          {row.historicalAmountLabel ? ` · ${row.historicalAmountLabel}` : ""}
          {!row.historicalAmountProven && row.paymentCurrency !== "NONE"
            ? ko
              ? " · 금액 정보 없음"
              : " · Amount unknown"
            : ""}
        </td>
        <td className="py-2 pr-2">
          <p className="font-semibold text-sam-fg">{ko ? row.finalStatusKo : row.finalStatusEn}</p>
          <p className="text-[12px] text-sam-muted">{ko ? row.paymentStateLabelKo : row.paymentStateLabelEn}</p>
        </td>
        <td className="py-2 pr-2">
          <AdminActionButton
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={onToggle}
            data-ads-history-open="1"
          >
            {open ? adminCta("close", ko) : adminCta("detail", ko)}
          </AdminActionButton>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-sam-border/70 bg-sam-app/40">
          <td colSpan={6} className="px-2 py-3">
            <RowDetail row={row} ko={ko} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RowDetail({ row, ko }: { row: AdsHistoryLedgerRow; ko: boolean }) {
  return (
    <div className="space-y-3" data-ads-history-detail="1">
      <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
        <div>
          <dt className="text-sam-muted">{ko ? "출처" : "Source"}</dt>
          <dd className="font-medium">{ko ? row.sourceLabelKo : row.sourceLabelEn}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "신청자" : "Applicant"}</dt>
          <dd className="font-medium">{row.applicantLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
          <dd className="font-medium" data-ads-history-amount-proven={row.historicalAmountProven ? "1" : "0"}>
            {row.historicalAmountLabel ??
              (row.paymentCurrency === "NONE"
                ? ko
                  ? "결제 없음"
                  : "No payment"
                : ko
                  ? "금액 정보 없음"
                  : "Amount not stored")}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "노출 위치" : "Placement"}</dt>
          <dd className="font-medium">
            {(ko ? row.placementLabelKo : row.placementLabelEn) ?? "—"}
            <span className="ml-1 text-[12px] text-sam-muted" data-ads-history-placement-evidence={row.placementEvidence}>
              ({adminStatusLabelText("ads.historyEvidence", row.placementEvidence, ko)})
            </span>
          </dd>
        </div>
      </dl>

      <div data-ads-history-timeline="1">
        <p className="mb-2 text-[12px] font-semibold text-sam-fg">
          {ko ? "타임라인" : "Timeline"}
        </p>
        <ol className="space-y-2">
          {row.timeline.map((ev, i) => (
            <li
              key={`${ev.kind}-${i}-${ev.at ?? "na"}`}
              className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
              data-ads-history-event={ev.kind}
              data-ads-history-evidence={ev.evidence}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-sam-fg">
                  {ko ? ev.labelKo : ev.labelEn}
                </p>
                <p className="text-[12px] text-sam-muted">{formatAdminManilaDateTime(ev.at)}</p>
              </div>
              <p className="mt-1 text-[12px] text-sam-muted">
                {ko ? "행위자" : "Actor"}:{" "}
                {ev.actorProven ? ev.actorLabel ?? "—" : "—"}
                {!ev.actorProven ? (
                  <span className="ml-1 text-[12px]">
                    ({ko ? "추정 금지 / NOT_PROVEN" : "no inference / NOT_PROVEN"})
                  </span>
                ) : null}
              </p>
              {ev.amountLabel ? (
                <p className="text-[12px] text-sam-fg">{ev.amountLabel}</p>
              ) : null}
              {ev.reason ? (
                <p className="text-[12px] text-sam-muted">
                  {ko ? "사유" : "Reason"}: {ev.reason}
                </p>
              ) : null}
              {ev.evidenceNoteKo || ev.evidenceNoteEn ? (
                <p className="mt-1 text-[12px] text-sam-muted">
                  {ko ? ev.evidenceNoteKo : ev.evidenceNoteEn}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {row.gapsKo.length > 0 ? (
        <ul className="space-y-1 text-[12px] text-sam-muted" data-ads-history-gaps="1">
          {(ko ? row.gapsKo : row.gapsEn).map((g) => (
            <li key={g}>· {g}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3 text-[12px]">
        {row.applicationsHref ? (
          <AdminActionLink href={row.applicationsHref} variant="ghost" size="sm">
            {ko ? "신청 상세" : "Application details"}
          </AdminActionLink>
        ) : null}
        {row.operationsHref ? (
          <AdminActionLink href={row.operationsHref} variant="ghost" size="sm">
            {ko ? "노출 관리 상세" : "Operations details"}
          </AdminActionLink>
        ) : null}
        {row.detailHref && row.detailHref !== row.operationsHref ? (
          <AdminActionLink href={row.detailHref} variant="ghost" size="sm">
            {adminCta("detail", ko)}
          </AdminActionLink>
        ) : null}
      </div>
      <p className="text-[12px] text-sam-muted" data-ads-history-mutation="0">
        {ko
          ? "이력 화면에서는 수정·결제·승인 mutation이 없습니다."
          : "History has no edit/payment/approval mutations."}
      </p>
    </div>
  );
}

const HISTORY_DOMAINS: readonly Exclude<AdsHistoryDomainFilter, "all">[] = ["community", "trade", "delivery", "popup"];
const HISTORY_STATUSES: readonly Exclude<AdsHistoryStatusFilter, "all">[] = [
  "approved",
  "rejected",
  "ended",
  "refunded",
  "paused",
];

export function AdminAdsHistoryLedgerView() {
  return (
    <Suspense fallback={<AdminLoadingState ko />}>
      <AdminAdsHistoryLedgerViewInner />
    </Suspense>
  );
}

function AdminAdsHistoryLedgerViewInner() {
  const { language } = useI18n();
  const ko = language !== "en";
  /** R7 서버 페이지 — 원천 합치기·필터·정렬·페이지·전체 건수(total)는 서버(DB). */
  const [ledger, setLedger] = useState<(AdsHistoryLedgerModel & { total?: number }) | null>(null);
  const [err, setErr] = useState("");
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** R7 목록 표준 8 — 영역(`domain`)·상태(`status`)·검색어(`q`)를 주소에 둔다. */
  const lq = useAdminListQuery<"domain">({
    statuses: HISTORY_STATUSES,
    extras: ["domain"],
  });
  const domain: AdsHistoryDomainFilter = (HISTORY_DOMAINS as readonly string[]).includes(lq.query.extras.domain)
    ? (lq.query.extras.domain as AdsHistoryDomainFilter)
    : "all";
  const status = (lq.query.status || "all") as AdsHistoryStatusFilter;
  const q = lq.query.q;
  const [openId, setOpenId] = useState<string | null>(null);
  const { refreshKey } = lq;
  const { page, size } = lq.query;

  const load = useCallback(async () => {
    setErr("");
    setErrStatus(undefined);
    setBusy(true);
    const params = new URLSearchParams();
    if (domain !== "all") params.set("domain", domain);
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", String(size));
    params.set("offset", String((page - 1) * size));
    try {
      const res = await fetch(`/api/admin/advertising/history?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        ledger?: AdsHistoryLedgerModel & { total?: number };
      };
      if (!res.ok || !json.ok || !json.ledger) {
        // 실패해도 이전 정상 목록은 지우지 않는다 (지시서 §8-5).
        setErr(json.error || "load_failed");
        setErrStatus(res.status);
        return;
      }
      setLedger(json.ledger);
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
    // refreshKey — 같은 조건 「조회」도 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, q, status, page, size, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = ledger?.rows ?? [];
  const total = typeof ledger?.total === "number" ? ledger.total : rows.length;
  const productCoverage = useMemo(() => {
    const keys = new Set(rows.map((r) => r.productKey));
    return keys;
  }, [rows]);

  return (
    <div
      className="space-y-5"
      data-admin-ads-history="1"
      data-admin-ads-r7="1"
      data-ads-history-mutation="0"
    >
      <AdminPageHeader
        titleKey="admin_menu_ads_authority_history"
        description={
          ko
            ? "저장된 신청·결제·승인·운영·환불 증거만 시간순으로 표시합니다. 없는 이벤트는 없음/NOT_PROVEN입니다."
            : "Only stored application/payment/approval/ops/refund evidence in time order. Missing events stay NOT_PROVEN."
        }
      />

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={busy}
        showPeriod={false}
        searchPlaceholder={ko ? "캠페인·신청자·ID" : "Title, applicant, id"}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: [
            { value: "", label: ko ? "전체 상태" : "All statuses" },
            { value: "approved", label: ko ? "승인" : "Approved" },
            { value: "rejected", label: ko ? "반려" : "Rejected" },
            { value: "ended", label: ko ? "종료" : "Ended" },
            { value: "refunded", label: ko ? "환불" : "Refunded" },
            { value: "paused", label: ko ? "제재/중지" : "Paused" },
          ],
        }}
      >
        <div className="flex flex-wrap gap-2 pb-1" data-ads-history-filters="1">
          {(
            [
              ["all", ko ? "전체" : "All"],
              ["community", "Community"],
              ["trade", ko ? "거래" : "Trade"],
              ["delivery", ko ? "배달" : "Delivery"],
              ["popup", "Popup"],
            ] as const
          ).map(([id, label]) => (
            <AdminChipButton
              key={id}
              selected={domain === id}
              data-ads-history-domain={id}
              onClick={() => lq.setExtra("domain", id === "all" ? "" : id)}
            >
              {label}
            </AdminChipButton>
          ))}
        </div>
      </AdminFilterBar>
      <p
        className="text-[12px] text-sam-muted"
        data-ads-history-export={ledger?.exportAvailable ? "1" : "0"}
      >
        {ko ? ledger?.exportGapKo : ledger?.exportGapEn}
      </p>

      {ledger?.sectionErrors?.length ? (
        <div className="text-[12px] text-sam-warning" data-ads-history-section-errors="1">
          <p>
            {ko
              ? `일부 영역(${ledger.sectionErrors.length}개)의 이력을 불러오지 못했습니다. 표시된 목록이 전체가 아닐 수 있습니다.`
              : `History for ${ledger.sectionErrors.length} section(s) failed to load. The list may be incomplete.`}
          </p>
          <AdminTechDetails ko={ko}>
            <ul>
              {ledger.sectionErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AdminTechDetails>
        </div>
      ) : null}

      <div className="text-[12px] text-sam-muted" data-ads-history-coverage={productCoverage.size}>
        <AdminTechDetails ko={ko}>
          {ko ? "로드된 제품군 키" : "Loaded product keys"}: {[...productCoverage].join(", ") || "—"}
        </AdminTechDetails>
      </div>

      {err ? (
        <AdminErrorState ko={ko} code={err} httpStatus={errStatus} onRetry={() => void load()} />
      ) : null}
      {!ledger ? (
        err ? null : <AdminLoadingState ko={ko} />
      ) : rows.length === 0 && page <= 1 ? (
        <div data-ads-history-empty="1">
          <AdminEmptyState
            ko={ko}
            message={lq.isFiltered ? undefined : ko ? "광고 이력이 없습니다." : "No ad history."}
            onReset={lq.isFiltered ? lq.reset : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          <table className="w-full min-w-[56rem] border-collapse text-left sam-text-body-secondary" data-ads-history-table="1">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{ko ? "최근 일시" : "Last event"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "영역·상품" : "Domain / product"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "캠페인" : "Campaign"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "출처·금액" : "Source / amount"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "최종 상태·결제" : "Final status / payment"}</th>
                <th className="py-2 pr-2 font-medium">{adminCta("detail", ko)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LedgerRow
                  key={row.id}
                  row={row}
                  ko={ko}
                  open={openId === row.id}
                  onToggle={() => setOpenId((prev) => (prev === row.id ? null : row.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ledger && (total > 0 || page > 1) ? (
        <AdminPagination
          ko={ko}
          page={page}
          size={size}
          total={total}
          disabled={busy}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
        />
      ) : null}
    </div>
  );
}
