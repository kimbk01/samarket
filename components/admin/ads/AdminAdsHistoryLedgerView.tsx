"use client";

/**
 * CUT R7 — Ads History / Audit Ledger UI (read-only).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  AdsHistoryDomainFilter,
  AdsHistoryLedgerModel,
  AdsHistoryLedgerRow,
  AdsHistoryStatusFilter,
} from "@/lib/admin/ads-history/types";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
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


function RowCard({
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
    <article
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-ads-history-row={row.id}
      data-ads-history-product={row.productKey}
      data-ads-history-legacy={row.legacy ? "1" : "0"}
      data-ads-history-sellable={row.sellable ? "1" : "0"}
    >
      <AdminActionButton
        variant="quiet"
        className="!h-auto w-full !items-stretch !justify-start !whitespace-normal !p-0 text-left !font-normal hover:!no-underline"
        aria-expanded={open}
        onClick={onToggle}
        data-ads-history-open="1"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[12px] text-sam-muted">{formatAdminManilaDateTime(row.lastEventAt)}</p>
            <p className="text-[13px] font-semibold text-sam-fg">
              [{adminStatusLabelText("ads.domain", row.domain, ko)}]{" "}
              {ko ? row.productLabelKo : row.productLabelEn}
              {row.legacy ? (
                <span className="ml-2 rounded-full bg-sam-app px-2 py-0.5 text-[12px] font-bold text-sam-muted">
                  {ko ? "레거시" : "Legacy"}
                </span>
              ) : null}
            </p>
            <p className="truncate text-[14px] text-sam-fg">{row.campaignTitle}</p>
            <p className="text-[12px] text-sam-muted">
              {ko ? row.sourceLabelKo : row.sourceLabelEn}
              {row.historicalAmountLabel ? ` · ${row.historicalAmountLabel}` : ""}
              {!row.historicalAmountProven && row.paymentCurrency !== "NONE"
                ? ko
                  ? " · 금액 정보 없음"
                  : " · Amount unknown"
                : ""}
            </p>
            <p className="text-[12px] text-sam-muted">
              {ko ? row.lifecycleSummaryKo : row.lifecycleSummaryEn}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-semibold text-sam-fg">
              {ko ? row.finalStatusKo : row.finalStatusEn}
            </p>
            <p className="text-[12px] text-sam-muted">
              {ko ? row.paymentStateLabelKo : row.paymentStateLabelEn}
            </p>
          </div>
        </div>
      </AdminActionButton>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-sam-border pt-3" data-ads-history-detail="1">
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
      ) : null}
    </article>
  );
}

export function AdminAdsHistoryLedgerView() {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const [ledger, setLedger] = useState<AdsHistoryLedgerModel | null>(null);
  const [err, setErr] = useState("");
  const [domain, setDomain] = useState<AdsHistoryDomainFilter>("all");
  const [status, setStatus] = useState<AdsHistoryStatusFilter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    const params = new URLSearchParams();
    if (domain !== "all") params.set("domain", domain);
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/advertising/history?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      ledger?: AdsHistoryLedgerModel;
    };
    if (!res.ok || !json.ok || !json.ledger) {
      setErr(json.error || "load_failed");
      setLedger(null);
      return;
    }
    setLedger(json.ledger);
  }, [domain, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = ledger?.rows ?? [];
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
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-sam-fg">{t("admin_menu_ads_authority_history")}</h1>
        <p className="text-[13px] text-sam-muted">
          {ko
            ? "저장된 신청·결제·승인·운영·환불 증거만 시간순으로 표시합니다. 없는 이벤트는 없음/NOT_PROVEN입니다."
            : "Only stored application/payment/approval/ops/refund evidence in time order. Missing events stay NOT_PROVEN."}
        </p>
      </header>

      <div className="flex flex-wrap gap-2" data-ads-history-filters="1">
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
            onClick={() => setDomain(id)}
          >
            {label}
          </AdminChipButton>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-ads-history-status-filters="1">
        {(
          [
            ["all", ko ? "전체 상태" : "All statuses"],
            ["approved", ko ? "승인" : "Approved"],
            ["rejected", ko ? "반려" : "Rejected"],
            ["ended", ko ? "종료" : "Ended"],
            ["refunded", ko ? "환불" : "Refunded"],
            ["paused", ko ? "제재/중지" : "Paused"],
          ] as const
        ).map(([id, label]) => (
          <AdminChipButton
            key={id}
            selected={status === id}
            data-ads-history-status={id}
            onClick={() => setStatus(id)}
          >
            {label}
          </AdminChipButton>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ko ? "캠페인·신청자·ID 조회" : "Search title, applicant, id"}
          className="min-w-[16rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
          data-ads-history-search="1"
        />
        <AdminActionButton variant="secondary" onClick={() => void load()}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
        <span
          className="text-[12px] text-sam-muted"
          data-ads-history-export={ledger?.exportAvailable ? "1" : "0"}
        >
          {ko ? ledger?.exportGapKo : ledger?.exportGapEn}
        </span>
      </div>

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
        <AdminErrorState ko={ko} code={err} onRetry={() => void load()} />
      ) : !ledger ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        <div data-ads-history-empty="1">
          <AdminEmptyState
            ko={ko}
            message={
              domain !== "all" || status !== "all" || q.trim()
                ? undefined
                : ko
                  ? "광고 이력이 없습니다."
                  : "No ad history."
            }
            onReset={
              domain !== "all" || status !== "all" || q.trim()
                ? () => {
                    setDomain("all");
                    setStatus("all");
                    setQ("");
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <RowCard
              key={row.id}
              row={row}
              ko={ko}
              open={openId === row.id}
              onToggle={() => setOpenId((prev) => (prev === row.id ? null : row.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
