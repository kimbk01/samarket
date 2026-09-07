"use client";

/**
 * CUT R7 — Ads History / Audit Ledger UI (read-only).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  AdsHistoryDomainFilter,
  AdsHistoryLedgerModel,
  AdsHistoryLedgerRow,
  AdsHistoryStatusFilter,
} from "@/lib/admin/ads-history/types";
import { Sam } from "@/lib/ui/sam-component-classes";

function formatDate(iso: string | null, ko: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return ko ? d.toLocaleString("ko-KR") : d.toLocaleString("en-US");
}

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
      <button type="button" className="w-full text-left" onClick={onToggle} data-ads-history-open="1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] text-sam-muted">{formatDate(row.lastEventAt, ko)}</p>
            <p className="text-[13px] font-semibold text-sam-fg">
              [{ko ? (row.domain === "trade" ? "거래" : row.domain === "delivery" ? "배달" : row.domain === "popup" ? "Popup" : "Community") : row.domain}]{" "}
              {ko ? row.productLabelKo : row.productLabelEn}
              {row.legacy ? (
                <span className="ml-2 rounded-full bg-sam-app px-2 py-0.5 text-[10px] font-bold text-sam-muted">
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
            <p className="text-[11px] text-sam-muted">
              {ko ? row.paymentStateLabelKo : row.paymentStateLabelEn}
            </p>
          </div>
        </div>
      </button>

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
                <span className="ml-1 text-[10px] text-sam-muted">({row.placementEvidence})</span>
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
                    <p className="text-[11px] text-sam-muted">{formatDate(ev.at, ko)}</p>
                  </div>
                  <p className="mt-1 text-[12px] text-sam-muted">
                    {ko ? "행위자" : "Actor"}:{" "}
                    {ev.actorProven ? ev.actorLabel ?? "—" : "—"}
                    {!ev.actorProven ? (
                      <span className="ml-1 text-[10px]">
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
                    <p className="mt-1 text-[11px] text-sam-muted">
                      {ko ? ev.evidenceNoteKo : ev.evidenceNoteEn}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          {row.gapsKo.length > 0 ? (
            <ul className="space-y-1 text-[11px] text-sam-muted" data-ads-history-gaps="1">
              {(ko ? row.gapsKo : row.gapsEn).map((g) => (
                <li key={g}>· {g}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-3 text-[12px]">
            {row.applicationsHref ? (
              <Link href={row.applicationsHref} className="text-sam-brand underline">
                {ko ? "신청 상세 보기" : "View application"}
              </Link>
            ) : null}
            {row.operationsHref ? (
              <Link href={row.operationsHref} className="text-sam-brand underline">
                {ko ? "노출 관리에서 보기" : "View in operations"}
              </Link>
            ) : null}
            {row.detailHref && row.detailHref !== row.operationsHref ? (
              <Link href={row.detailHref} className="text-sam-brand underline">
                {ko ? "상세 이동" : "Open detail"}
              </Link>
            ) : null}
          </div>
          <p className="text-[10px] text-sam-muted" data-ads-history-mutation="0">
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
  const { language } = useI18n();
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
      setErr(json.error || (ko ? "이력을 불러오지 못했습니다." : "Failed to load history."));
      setLedger(null);
      return;
    }
    setLedger(json.ledger);
  }, [domain, ko, q, status]);

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
        <h1 className="text-[20px] font-bold text-sam-fg">{ko ? "광고 이력" : "Ads history"}</h1>
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
          <button
            key={id}
            type="button"
            className={domain === id ? Sam.chip.activeCombo : Sam.chip.inactiveCombo}
            data-ads-history-domain={id}
            onClick={() => setDomain(id)}
          >
            {label}
          </button>
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
          <button
            key={id}
            type="button"
            className={status === id ? Sam.chip.activeCombo : Sam.chip.inactiveCombo}
            data-ads-history-status={id}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ko ? "캠페인·신청자·ID 검색" : "Search title, applicant, id"}
          className="min-w-[16rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
          data-ads-history-search="1"
        />
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
          {ko ? "새로고침" : "Refresh"}
        </button>
        <span
          className="text-[11px] text-sam-muted"
          data-ads-history-export={ledger?.exportAvailable ? "1" : "0"}
        >
          {ko ? ledger?.exportGapKo : ledger?.exportGapEn}
        </span>
      </div>

      {err ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {err}
        </p>
      ) : null}

      {ledger?.sectionErrors?.length ? (
        <p className="text-[11px] text-amber-800" data-ads-history-section-errors="1">
          {ledger.sectionErrors.join(" · ")}
        </p>
      ) : null}

      <p className="text-[11px] text-sam-muted" data-ads-history-coverage={productCoverage.size}>
        {ko ? "로드된 제품군 키" : "Loaded product keys"}:{" "}
        {[...productCoverage].join(", ") || "—"}
      </p>

      {!ledger ? (
        <p className="text-[13px] text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-6 text-center text-[13px] text-sam-muted" data-ads-history-empty="1">
          {ko ? "광고 이력이 없습니다." : "No ad history."}
        </p>
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
