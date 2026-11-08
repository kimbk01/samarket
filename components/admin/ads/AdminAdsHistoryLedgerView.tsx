"use client";

/**
 * CUT R7 — Ads History / Audit Ledger UI (read-only).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translateBy } from "@/lib/i18n/translate-by";
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
import { adsOpsStatusLabel, mapRawToAdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { canAccessAdminRoute, type AdminRouteAccessActor } from "@/lib/admin/access/admin-route-access";
import { AdminAdsDeletedList } from "@/components/admin/ads/AdminAdsDeletedList";

/** 원래 상태 코드(영문 소문자·밑줄)면 운영 상태 이름, 이미 사람이 읽는 문구면 그대로 */
function historyStatusDisplay(raw: string, ko: boolean): string {
  return /^[A-Za-z_]+$/.test(raw.trim()) ? adsOpsStatusLabel(mapRawToAdsOpsStatus(raw), ko) : raw;
}

/**
 * AD-129 · AD-308: 상세 주소를 열 권한이 없으면 링크를 숨긴다 (접근표 = 서버 가드와 같은 키).
 * 권한 정보를 아직 모르면(셸 스냅샷 없음) 기존처럼 보이고 서버 가드가 막는다.
 */
export function historyDetailHrefForActor(
  href: string | null,
  actor: AdminRouteAccessActor | null
): string | null {
  if (!href) return null;
  if (!actor) return href;
  return canAccessAdminRoute(href, actor) ? href : null;
}


/** 표준 표 행 — 요약 열 + 「상세」 토글. 펼치면 아래 행에 증거·타임라인(읽기 전용)을 보인다. */
function LedgerRow({
  row,
  ko,
  open,
  onToggle,
  actor,
}: {
  row: AdsHistoryLedgerRow;
  ko: boolean;
  open: boolean;
  onToggle: () => void;
  actor: AdminRouteAccessActor | null;
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
              {translateBy(ko ? "ko" : "en", "admin_ads_legacy")}
            </span>
          ) : null}
        </td>
        <td className="max-w-[16rem] py-2 pr-2 text-sam-fg">
          <p className="truncate">{row.campaignTitle}</p>
          <p className="text-[12px] text-sam-muted">{ko ? row.lifecycleSummaryKo : row.lifecycleSummaryEn}</p>
        </td>
        <td className="py-2 pr-2 text-[12px] text-sam-muted">
          {ko ? row.sourceLabelKo : row.sourceLabelEn}
          {row.historicalAmountLabel ? ` · ${ko ? row.historicalAmountLabel : row.historicalAmountLabelEn ?? row.historicalAmountLabel}` : ""}
          {!row.historicalAmountProven && row.paymentCurrency !== "NONE"
            ? translateBy(ko ? "ko" : "en", "admin_ads_amount_unknown")
            : ""}
        </td>
        <td className="py-2 pr-2">
          {/* 재감사 S-2 (H-7): 원래 상태 코드(active·rejected 등)는 화면에서만 운영 상태 이름으로 (상태 필터는 원래 값으로 거름) */}
          <p className="font-semibold text-sam-fg">{historyStatusDisplay(ko ? row.finalStatusKo : row.finalStatusEn, ko)}</p>
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
            <RowDetail row={row} ko={ko} actor={actor} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function RowDetail({
  row,
  ko,
  actor,
}: {
  row: AdsHistoryLedgerRow;
  ko: boolean;
  actor: AdminRouteAccessActor | null;
}) {
  const detailHref = historyDetailHrefForActor(row.detailHref, actor);
  return (
    <div className="space-y-3" data-ads-history-detail="1">
      <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
        <div>
          <dt className="text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_source")}</dt>
          <dd className="font-medium">{ko ? row.sourceLabelKo : row.sourceLabelEn}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_label_applicant")}</dt>
          <dd className="font-medium">{row.applicantLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_payment")}</dt>
          <dd className="font-medium" data-ads-history-amount-proven={row.historicalAmountProven ? "1" : "0"}>
            {(ko ? row.historicalAmountLabel : row.historicalAmountLabelEn ?? row.historicalAmountLabel) ??
              (row.paymentCurrency === "NONE"
                ? translateBy(ko ? "ko" : "en", "admin_ads_no_payment")
                : translateBy(ko ? "ko" : "en", "admin_ads_amount_not_stored"))}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_label_placement")}</dt>
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
          {translateBy(ko ? "ko" : "en", "admin_ads_timeline")}
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
                {translateBy(ko ? "ko" : "en", "admin_ads_actor")}:{" "}
                {ev.actorProven ? ev.actorLabel ?? "—" : "—"}
                {!ev.actorProven ? (
                  <span className="ml-1 text-[12px]">
                    ({translateBy(ko ? "ko" : "en", "admin_ads_no_inference_not_proven")})
                  </span>
                ) : null}
              </p>
              {ev.amountLabel ? (
                <p className="text-[12px] text-sam-fg">{ko ? ev.amountLabel : ev.amountLabelEn ?? ev.amountLabel}</p>
              ) : null}
              {ev.reason ? (
                <p className="text-[12px] text-sam-muted">
                  {translateBy(ko ? "ko" : "en", "admin_ads_reason")}: {ev.reason}
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
            {translateBy(ko ? "ko" : "en", "admin_ads_application_details")}
          </AdminActionLink>
        ) : null}
        {row.operationsHref ? (
          <AdminActionLink href={row.operationsHref} variant="ghost" size="sm">
            {translateBy(ko ? "ko" : "en", "admin_ads_operations_details")}
          </AdminActionLink>
        ) : null}
        {detailHref && detailHref !== row.operationsHref ? (
          <AdminActionLink href={detailHref} variant="ghost" size="sm" data-ads-history-detail-link="1">
            {adminCta("detail", ko)}
          </AdminActionLink>
        ) : null}
      </div>
      <p className="text-[12px] text-sam-muted" data-ads-history-mutation="0">
        {translateBy(ko ? "ko" : "en", "admin_ads_history_has_no_edit_payment")}
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
  const { language, t } = useI18n();
  const ko = language !== "en";
  const { actor: accessActor } = useAdminAccessActor();
  /** R7 서버 페이지 — 원천 합치기·필터·정렬·페이지·전체 건수(total)는 서버(DB). */
  const [ledger, setLedger] = useState<(AdsHistoryLedgerModel & { total?: number }) | null>(null);
  const [err, setErr] = useState("");
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** R7 목록 표준 8 — 영역(`domain`)·상태(`status`)·검색어(`q`)를 주소에 둔다. */
  const lq = useAdminListQuery<"domain" | "view">({
    statuses: HISTORY_STATUSES,
    extras: ["domain", "view"],
  });
  /** R2 (2026-11-07 · §3-2): 「삭제됨」 = 삭제 표시된 광고 목록 + 삭제 취소. 주소 `?view=deleted`. */
  const deletedView = lq.query.extras.view === "deleted";
  const domain: AdsHistoryDomainFilter = (HISTORY_DOMAINS as readonly string[]).includes(lq.query.extras.domain)
    ? (lq.query.extras.domain as AdsHistoryDomainFilter)
    : "all";
  const status = (lq.query.status || "all") as AdsHistoryStatusFilter;
  const q = lq.query.q;
  const [openId, setOpenId] = useState<string | null>(null);
  const { refreshKey } = lq;
  const { page, size } = lq.query;

  const load = useCallback(async () => {
    if (deletedView) return;
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
  }, [domain, q, status, page, size, refreshKey, deletedView]);

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
          t("admin_ads_stored_application_payment_approval_ops")
        }
      />

      <div className="flex flex-wrap gap-2" data-ads-history-view="1">
        <AdminChipButton
          selected={!deletedView}
          data-ads-history-view-option="ledger"
          onClick={() => lq.setExtra("view", "")}
        >
          {t("admin_ads_all_history")}
        </AdminChipButton>
        <AdminChipButton
          selected={deletedView}
          data-ads-history-view-option="deleted"
          onClick={() => lq.setExtra("view", "deleted")}
        >
          {t("admin_ads_history_filter_deleted")}
        </AdminChipButton>
      </div>

      {deletedView ? (
        <AdminAdsDeletedList page={page} size={size} onPageChange={lq.setPage} onSizeChange={lq.setSize} />
      ) : (
      <>
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={busy}
        showPeriod={false}
        searchPlaceholder={t("admin_ads_title_applicant_id")}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: [
            { value: "", label: t("admin_ads_all_statuses") },
            { value: "approved", label: t("admin_ads_approved") },
            { value: "rejected", label: t("admin_ads_summary_rejected") },
            { value: "ended", label: t("admin_ads_ended") },
            { value: "refunded", label: t("admin_ads_payment_status_refunded") },
            { value: "paused", label: t("admin_ads_paused") },
          ],
        }}
      >
        <div className="flex flex-wrap gap-2 pb-1" data-ads-history-filters="1">
          {(
            [
              ["all", t("common_all")],
              ["community", t("admin_ads_community")],
              ["trade", t("admin_ads_trade")],
              ["delivery", t("common_delivery")],
              ["popup", t("admin_ads_popup")],
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
            {t("admin_ads_history_length_section_s_failed", { length: String(ledger.sectionErrors.length) })}
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
          {t("admin_ads_loaded_product_keys")}: {[...productCoverage].join(", ") || "—"}
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
            message={lq.isFiltered ? undefined : t("admin_ads_no_ad_history")}
            onReset={lq.isFiltered ? lq.reset : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          <table className="w-full min-w-[56rem] border-collapse text-left sam-text-body-secondary" data-ads-history-table="1">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{t("admin_ads_last_event")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_domain_product")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_campaign")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_source_amount")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_final_status_payment")}</th>
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
                  actor={accessActor}
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
      </>
      )}
    </div>
  );
}
