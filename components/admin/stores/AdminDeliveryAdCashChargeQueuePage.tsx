"use client";

/**
 * CUT B — Cash top-up queue wired to canonical AST-005 API.
 * Legacy `/api/admin/delivery-ads/business-cash/charge-requests` PATCH stays 410 (NO_NEW_WRITE).
 */

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { adminOperatorErrorMessage, adminOperatorLabel } from "@/lib/admin/operator-ux/operator-labels";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { ownerCashTopUpMethodLabel } from "@/lib/business/owner-form-request-key";
import { AdminRequestPeriodSummaryLine } from "@/components/admin/finance/AdminRequestPeriodSummaryLine";
import type { AdminRequestPeriodSummary } from "@/lib/admin/finance/admin-request-period-summary";
import { formatCashPhp2 } from "@/lib/currency/currency-display-contract";

/** API `status` 값 (business_cash_charge_requests.status CHECK) — 「전체」 = API `all`. */
const CASH_CHARGE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
const CASH_CHARGE_FILTER_EXTRAS = ["store_id"] as const;

type ChargeRequest = {
  id: string;
  store_id: string;
  /** Joined from `stores.store_name` by the API (null when unavailable). */
  store_name?: string | null;
  owner_user_id: string;
  amount_minor: number;
  status: string;
  created_at: string;
  /** 승인·반려 처리 시각 (API 가 이미 돌려주던 열). */
  decided_at?: string | null;
  reject_reason?: string | null;
  /** FIN-04 — deposit evidence (NULL on requests created before 2027-06-03). */
  payment_method?: string | null;
  payment_reference?: string | null;
  proof_file_path?: string | null;
  decided_reason?: string | null;
  /** 처리 관리자 — 관리자 화면에만 (회원·오너는 「운영팀」) */
  admin_user_id?: string | null;
  admin_name?: string | null;
};

/** 처리 근거 코드 → 사람 문구 (원문 코드는 접힌 기술 정보에만) */
function cashDecidedReasonLabel(code: string | null | undefined, ko: boolean): string | null {
  const c = String(code ?? "").trim();
  if (!c) return null;
  if (c === "apple_iap_verified") return ko ? "Apple 결제 자동 확인" : "Apple payment auto-verified";
  return c;
}

type ActionResult = {
  ok: boolean;
  error?: string;
  idempotent?: boolean;
  ledgerId?: string;
  balanceAfterMinor?: number;
};

export function AdminDeliveryAdCashChargeQueuePage() {
  const { t, safeT, language } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const writeAction = useAdminRouteAction("/admin/delivery-ads/cash-charges");
  const pathname = usePathname();
  const focusRequestId = (searchParams.get("requestId") ?? "").trim();
  /**
   * 목록 조건 (AdminFilterBar + useAdminListQuery) — 상태(기본 대기) · 매장 ID · 쪽/크기가 주소에 남는다.
   * API `/api/admin/business-cash-charges` 가 `status`·`store_id`·`limit`/`offset` 을 지원한다.
   */
  const lq = useAdminListQuery<(typeof CASH_CHARGE_FILTER_EXTRAS)[number]>({
    defaults: { status: "PENDING" },
    statuses: CASH_CHARGE_STATUSES,
    extras: CASH_CHARGE_FILTER_EXTRAS,
  });
  const statusFilter = lq.query.status;
  /** `?store_id=` (legacy `?storeId=`) — server-side store filter on the queue API. */
  const storeFilter = (lq.query.extras.store_id || searchParams.get("storeId") || "").trim();
  const [storeIdDraft, setStoreIdDraft] = useState(storeFilter);
  const [storeIdDraftKey, setStoreIdDraftKey] = useState(storeFilter);
  if (storeIdDraftKey !== storeFilter) {
    setStoreIdDraftKey(storeFilter);
    setStoreIdDraft(storeFilter);
  }
  const clearStoreFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("store_id");
    next.delete("storeId");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, router, searchParams]);
  const [rows, setRows] = useState<ChargeRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ko = language !== "en";
  /** List load failure (code) — rendered via AdminErrorState, never raw. */
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  /** Action failure (operator sentence already mapped). */
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** Ledger id of the last credit — technical detail only (not in the banner). */
  const [successLedgerId, setSuccessLedgerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** R7 서버 페이지 — 20/50/100건 · 총 건수 (예전 100건 상한 없음). 쪽·크기는 주소(useAdminListQuery). */
  const page = lq.query.page;
  const size = lq.query.size;
  const [total, setTotal] = useState(0);
  /** H-10 — 고른 기간(신청 시각) 전체 합계 (서버 계산 · 상태 필터·쪽과 무관). */
  const [periodSummary, setPeriodSummary] = useState<AdminRequestPeriodSummary | null>(null);
  const periodFrom = lq.query.from;
  const periodTo = lq.query.to;
  /** R5-a — 요청 번호: 늦게 온 이전 조건 응답은 버린다. */
  const loadSeqRef = useRef(0);
  /** 화면에 보이는 목록이 어떤 조건의 결과인지 — 조건이 바뀌면 새 결과가 올 때까지 「불러오는 중」. */
  const conditionKey = [focusRequestId, storeFilter, statusFilter, page, size, periodFrom, periodTo].join("|");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /**
   * P-5 — 기간 합계(`summary=1`)는 처음·기간(from/to) 변경·새로고침(다시 시도·처리 후 재조회) 때만 요청한다.
   * 쪽·상태만 바뀌면 목록만 요청하고 이미 받은 합계를 그대로 둔다. 서버 합계가 매장 조건(`store_id`)으로도
   * 좁혀지므로 매장 조건이 바뀌어도 다시 받는다 (값이 달라지므로).
   */
  const summaryLoadedKeyRef = useRef<string | null>(null);
  /** 합계를 다시 받는 중 — 이전 기간 값을 새 기간 아래 보이지 않게 숨긴다. */
  const [summaryPending, setSummaryPending] = useState(true);

  const load = useCallback(async (opts?: { refreshSummary?: boolean }) => {
    const seq = ++loadSeqRef.current;
    const key = [focusRequestId, storeFilter, statusFilter, page, size, periodFrom, periodTo].join("|");
    const summaryKey = [storeFilter, periodFrom, periodTo].join("|");
    const withSummary = opts?.refreshSummary === true || summaryLoadedKeyRef.current !== summaryKey;
    if (withSummary) {
      // 받기 전에 비워 둔다 — 늦게 온 이전 요청이 끝나도 이 요청이 다시 채울 때까지 다시 받게
      summaryLoadedKeyRef.current = null;
      setSummaryPending(true);
    }
    setError(null);
    setErrorStatus(undefined);
    try {
      const qs = new URLSearchParams({
        status: statusFilter || "all",
        limit: String(size),
        offset: String((page - 1) * size),
      });
      if (storeFilter) qs.set("store_id", storeFilter);
      if (periodFrom) qs.set("from", periodFrom);
      if (periodTo) qs.set("to", periodTo);
      if (withSummary) qs.set("summary", "1");
      // 딥링크 신고 1건은 상태·쪽과 무관하게 따로 읽어 맨 위에 둔다 (이미 처리된 건이어도 보이게)
      const focusQs = focusRequestId ? new URLSearchParams({ status: "all", request_id: focusRequestId }) : null;
      const [res, focusRes] = await Promise.all([
        fetch(`/api/admin/business-cash-charges?${qs.toString()}`, { credentials: "include", cache: "no-store" }),
        focusQs
          ? fetch(`/api/admin/business-cash-charges?${focusQs.toString()}`, { credentials: "include", cache: "no-store" })
          : Promise.resolve(null),
      ]);
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        requests?: ChargeRequest[];
        total?: number;
        periodSummary?: AdminRequestPeriodSummary | null;
        error?: string;
      };
      if (seq !== loadSeqRef.current) return;
      if (!res.ok || !json.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5). 기간 합계는 이전 조건 값이라 지운다 (R8-g).
        setError(json.error || "load_failed");
        setErrorStatus(res.status);
        setPeriodSummary(null);
        summaryLoadedKeyRef.current = null;
        setSummaryPending(false);
        setLoaded(true);
        setLoadedKey(key);
        return;
      }
      let next = json.requests ?? [];
      if (focusRes?.ok) {
        const fj = (await focusRes.json().catch(() => null)) as { ok?: boolean; requests?: ChargeRequest[] } | null;
        const hit = fj?.ok ? (fj.requests ?? [])[0] : undefined;
        if (hit) next = [hit, ...next.filter((r) => r.id !== hit.id)];
      }
      if (seq !== loadSeqRef.current) return;
      setRows(next);
      setTotal(typeof json.total === "number" ? json.total : next.length);
      if (withSummary) {
        setPeriodSummary(json.periodSummary ?? null);
        summaryLoadedKeyRef.current = summaryKey;
        setSummaryPending(false);
      }
      setLoadedKey(key);
    } catch {
      if (seq !== loadSeqRef.current) return;
      setError("network_error");
      setPeriodSummary(null);
      summaryLoadedKeyRef.current = null;
      setSummaryPending(false);
      setLoadedKey(key);
    } finally {
      if (seq === loadSeqRef.current) setLoaded(true);
    }
  }, [focusRequestId, storeFilter, statusFilter, page, size, periodFrom, periodTo]);
  /** 첫 조회 전이거나 조건이 바뀐 뒤 새 결과가 아직 없으면 「불러오는 중」(이전 조건 목록을 새 조건 결과처럼 보이지 않게). */
  const listPending = !loaded || loadedKey !== conditionKey;

  const storeFilterLabel =
    (storeFilter && rows.find((r) => r.store_id === storeFilter)?.store_name?.trim()) || storeFilter;

  useEffect(() => {
    void load();
  }, [load, lq.refreshKey]);

  useEffect(() => {
    if (!loaded || !focusRequestId) return;
    const el = document.querySelector(`[data-admin-cash-charge-row="${CSS.escape(focusRequestId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-admin-cash-charge-focus", "1");
      el.classList.add("ring-2", "ring-signature");
    }
  }, [loaded, focusRequestId, rows]);

  const act = async (id: string, op: "approve" | "reject", reason: string) => {
    setBusyId(id);
    setSuccess(null);
    setSuccessLedgerId(null);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/business-cash-charges", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          requestId: id,
          // R2 — 적립(moneyApprove L2)·반려(reject L2) 모두 확인창 사유를 보내 감사에 남긴다.
          reason: reason.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as ActionResult;
      if (!res.ok || !json.ok) {
        // 다른 관리자가 먼저 처리했거나 사라진 신청 — 안내 후 최신 목록으로 다시 불러온다.
        if (json.error === "not_pending" || json.error === "not_found") {
          setActionError(t("admin_r4_cash_charge_not_pending"));
          await load({ refreshSummary: true });
          return;
        }
        setActionError(
          json.error || res.status === 403
            ? adminOperatorErrorMessage(res.status === 403 ? "forbidden" : String(json.error), ko)
            : safeT("admin_delivery_ads_cash_charges_action_failed")
        );
        return;
      }
      emitAdminQueueChanged("cash_charges");
      if (op === "approve") {
        // 카탈로그 「적립 완료」 키는 잔액·중복 여부를 담지 못해 결과 문구가 같아졌다 — 전용 키로 구분.
        setSuccess(
          json.idempotent
            ? t("admin_r4_cash_charge_approve_idempotent")
            : t("admin_r4_cash_charge_approve_ok", {
                balance: formatDeliveryAdPhpMinor(json.balanceAfterMinor ?? 0),
              })
        );
        setSuccessLedgerId(json.ledgerId ?? null);
      } else {
        setSuccess(
          safeT("admin_delivery_ads_cash_charges_reject_ok")
        );
      }
      await load({ refreshSummary: true });
    } catch {
      setActionError(adminOperatorErrorMessage("network_error", ko));
    } finally {
      setBusyId(null);
    }
  };

  /** Confirm-first (R2): 적립 = moneyApprove(L2) · 반려 = reject(L2) — 사유는 API `reason` 으로 전송. */
  const requestConfirm = async (target: { id: string; op: "approve" | "reject" }) => {
    if (busyId != null || !writeAction.allowed) return;
    const { id, op } = target;
    const row = rows.find((r) => r.id === id);
    const when = row?.created_at ? formatAdminManilaDateTime(String(row.created_at)) : "";
    const evidence = row?.payment_reference
      ? ` · ${row.payment_method ? `${ownerCashTopUpMethodLabel(row.payment_method, ko)} ` : ""}${row.payment_reference}`
      : ko
        ? " · 입금 참조번호 없음"
        : " · No deposit reference";
    const amountLine = row ? `${formatDeliveryAdPhpMinor(row.amount_minor)} · ${when}${evidence}` : "";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(op === "approve" ? "moneyApprove" : "reject"),
      ko,
      title:
        op === "approve"
          ? ko
            ? "이 충전 건을 Cash로 적립하시겠습니까?"
            : "Credit Cash for this top-up?"
          : ko
            ? "이 Cash 충전 신청을 반려하시겠습니까?"
            : "Reject this Cash top-up?",
      description:
        op === "reject"
          ? ko
            ? `${amountLine} — 반려 사유는 매장 사장님에게 전달되고 작업 기록에 남습니다. 캐시 잔액은 바뀌지 않습니다.`
            : `${amountLine} — The reason is sent to the store owner and kept in the activity log. Cash balance does not change.`
          : amountLine || undefined,
      confirmLabel: op === "approve" ? (ko ? "적립" : "Credit") : ko ? "반려" : "Reject",
      destructive: op === "reject",
      reasonPlaceholder:
        op === "reject"
          ? ko
            ? "예: 입금 내역이 확인되지 않음"
            : "e.g. Payment not found"
          : ko
            ? "예: 입금 내역 확인 완료"
            : "e.g. Payment confirmed",
    });
    if (!confirmed.ok) return;
    const reason = confirmed.reason ?? "";
    void act(id, op, reason);
  };

  return (
    <div
      className="space-y-4 p-4"
      data-admin-delivery-ads-cash-charges="1"
      data-admin-cash-charges-canonical="1"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CurrencyBadge currency="cash" />
            <h1 className="text-[20px] font-bold text-sam-fg">
              {ko ? "매장 캐시 충전 승인" : "Cash top-up approval"}
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_cash_charges_help")}
          </p>
          {storeFilter ? (
            <span
              className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
              data-admin-cash-charge-store-filter-chip="1"
            >
              <span className="truncate" title={storeFilter}>
                {ko ? "매장 필터" : "Store filter"}: {storeFilterLabel}
              </span>
              <AdminActionButton variant="quiet" size="sm" className="shrink-0"
                onClick={clearStoreFilter}
                aria-label={ko ? "매장 필터 해제" : "Clear store filter"}
              >
                {ko ? "해제" : "Clear"}
              </AdminActionButton>
            </span>
          ) : null}
        </div>
        <Link
          href="/admin/finance"
          className="min-h-[36px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
        >
          {ko ? "재무 홈" : "Finance home"}
        </Link>
      </div>

      {success ? (
        <p
          className="rounded-ui-rect border border-sam-success/40 bg-sam-success-soft px-3 py-2 text-[13px] text-sam-success"
          role="status"
          data-admin-cash-charge-success="1"
        >
          {success}
          {successLedgerId ? <AdminTechDetails ko={ko}>ledger {successLedgerId}</AdminTechDetails> : null}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-[13px] text-sam-danger"
          role="alert"
          data-admin-cash-charge-action-error="1"
        >
          {actionError}
        </p>
      ) : null}

      <AdminFilterBar
        ko={ko}
        requireCompletePeriod
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={() => {
          const next = storeIdDraft.trim();
          if (!next && searchParams.get("storeId")) {
            clearStoreFilter();
            return;
          }
          lq.patch({ from: lq.draft.from, to: lq.draft.to, extras: { store_id: next } });
        }}
        onReset={() => {
          setStoreIdDraft("");
          if (searchParams.get("storeId")) clearStoreFilter();
          else lq.reset();
        }}
        pending={listPending}
        showSearch={false}
        status={{
          value: statusFilter,
          onChange: lq.setStatus,
          options: CASH_CHARGE_STATUSES.map((v) => ({ value: v, label: adminOperatorLabel(v, ko) })),
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          {ko ? "매장 ID" : "Store ID"}
          <input
            className="h-10 min-w-[16rem] rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
            value={storeIdDraft}
            onChange={(e) => setStoreIdDraft(e.target.value)}
            name="store_id"
            data-admin-cash-charge-store-filter-input="1"
          />
        </label>
      </AdminFilterBar>

      <AdminRequestPeriodSummaryLine
        ko={ko}
        summary={summaryPending ? null : periodSummary}
        formatAmount={(minor) => formatCashPhp2(minor / 100)}
      />

      <AdminCard
        title={safeT("admin_delivery_ads_cash_charges_title")}
      >
        {listPending ? (
          <AdminLoadingState ko={ko} />
        ) : error ? (
          <div data-admin-cash-charge-error="1">
            <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load({ refreshSummary: true })} />
          </div>
        ) : rows.length === 0 ? (
          lq.isFiltered || storeFilter ? (
            <AdminEmptyState
              ko={ko}
              onReset={() => {
                setStoreIdDraft("");
                if (searchParams.get("storeId")) clearStoreFilter();
                else lq.reset();
              }}
            />
          ) : (
            <AdminEmptyState
              ko={ko}
              message={safeT("admin_delivery_ads_cash_charges_empty")}
            />
          )
        ) : (
          <>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-[13px]" data-admin-cash-charge-table="1">
            <thead className="border-b border-sam-border text-[12px] text-sam-muted">
              <tr>
                <th className="px-2 py-2 font-medium">{ko ? "신청 시각 (PHT)" : "Requested (PHT)"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "매장" : "Store"}</th>
                <th className="px-2 py-2 text-right font-medium">{ko ? "금액" : "Amount"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "입금 확인" : "Deposit"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "처리 시각 (PHT)" : "Processed (PHT)"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "처리" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border">
            {rows.map((r) => (
              <tr key={r.id} className="align-top" data-admin-cash-charge-row={r.id}>
                <td className="whitespace-nowrap px-2 py-3 text-sam-muted">
                  {r.created_at ? formatAdminManilaDateTime(String(r.created_at)) : "—"}
                </td>
                <td className="px-2 py-3">
                  <p className="text-sam-fg">
                    {r.store_name?.trim() ||
                      (ko ? "매장 이름 없음 · 기술 정보 참고" : "Unnamed store · see technical details")}
                  </p>
                  <Link
                    href={`/admin/finance?storeId=${encodeURIComponent(r.store_id)}`}
                    className="mt-1 inline-block text-[12px] font-semibold text-[var(--currency-cash-accent)] hover:underline"
                  >
                    {ko ? "매장 재무" : "Store finance"}
                  </Link>
                  {/* 광고 원장 §2 반대 방향 (2026-11-07): 충전 대기열 → 이 광고주(매장)의 광고 */}
                  <Link href={`/admin/advertising?advertiser=${encodeURIComponent(r.store_id)}`} className="mt-1 ml-2 inline-block text-[12px] font-semibold text-sam-primary hover:underline" data-admin-cash-charge-advertiser-ads="1">{t("ads_ledger_sc_ads_of_advertiser")}</Link>
                  <AdminTechDetails ko={ko}>
                    store {r.store_id}
                    <br />
                    owner {r.owner_user_id}
                    {r.decided_reason ? (
                      <>
                        <br />
                        approve reason {r.decided_reason}
                      </>
                    ) : null}
                    {r.proof_file_path ? (
                      <>
                        <br />
                        proof {r.proof_file_path}
                      </>
                    ) : null}
                  </AdminTechDetails>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right text-[14px] font-semibold text-sam-fg">
                  {formatDeliveryAdPhpMinor(r.amount_minor)}
                </td>
                <td
                  className={`break-all px-2 py-3 text-[12px] ${r.payment_reference ? "text-sam-fg" : "text-sam-danger"}`}
                  data-admin-cash-charge-reference={r.payment_reference ? "1" : "missing"}
                >
                  {r.payment_reference && r.payment_method === "apple_iap" ? (
                    <>
                      {ownerCashTopUpMethodLabel(r.payment_method, ko)} · {r.payment_reference.replace(/^apple:/, "")}
                      <Link
                        href={`/admin/apple-iap?txn=${encodeURIComponent(r.payment_reference.replace(/^apple:/, ""))}`}
                        className="block font-semibold text-sam-primary hover:underline"
                        data-admin-cash-charge-apple-link="1"
                      >
                        {t("apple_iap_admin_link_apple")}
                      </Link>
                    </>
                  ) : r.payment_reference
                    ? `${r.payment_method ? `${ownerCashTopUpMethodLabel(r.payment_method, ko)} · ` : ""}${r.payment_reference}`
                    : r.status === "PENDING"
                      ? ko
                        ? "참조번호 없음 — 적립 불가"
                        : "No reference — cannot credit"
                      : r.status === "APPROVED"
                        ? ko
                          ? "참조번호 없음 — 근거 없이 적립됨 (확인 필요)"
                          : "No reference — credited without evidence (review)"
                        : ko
                          ? "참조번호 없음"
                          : "No reference"}
                </td>
                <td className="px-2 py-3">
                  <AdminStatusLabel code={r.status} ko={ko} />
                  {/* R6-g — 반려 사유는 목록 줄에 바로 (접힌 기술 정보 안에 숨기지 않음) */}
                  {r.status === "REJECTED" ? (
                    <p className="mt-1 max-w-[16rem] break-words text-[12px] text-sam-fg" data-admin-cash-charge-reject-reason="1">
                      {ko ? "반려 사유" : "Reject reason"}: {r.reject_reason?.trim() || r.decided_reason?.trim() || "—"}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-sam-muted" data-admin-cash-charge-decided-at="1">
                  {r.decided_at ? formatAdminManilaDateTime(String(r.decided_at)) : "—"}
                  {r.decided_at ? (
                    <span className="block text-[12px]" data-admin-cash-charge-processor="1">
                      {r.admin_name ?? (ko ? "처리자 기록 없음" : "No processor recorded")}
                    </span>
                  ) : null}
                  {r.status === "APPROVED" && cashDecidedReasonLabel(r.decided_reason, ko) ? (
                    <span className="block text-[12px]">{cashDecidedReasonLabel(r.decided_reason, ko)}</span>
                  ) : null}
                </td>
                <td className="px-2 py-3">
                  {r.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2">
                  <AdminActionButton variant="secondary" size="sm"
                    disabled={busyId != null || !writeAction.allowed}
                    title={!writeAction.allowed ? writeAction.reason ?? undefined : undefined}
                    onClick={() => void requestConfirm({ id: r.id, op: "approve" })}
                    data-admin-cash-charge-complete={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_complete")}
                  </AdminActionButton>
                  <AdminActionButton variant="secondary" size="sm"
                    disabled={busyId != null || !writeAction.allowed}
                    title={!writeAction.allowed ? writeAction.reason ?? undefined : undefined}
                    onClick={() => void requestConfirm({ id: r.id, op: "reject" })}
                    data-admin-cash-charge-reject={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_reject")}
                  </AdminActionButton>
                  </div>
                  ) : (
                    <span className="text-[12px] text-sam-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
          </div>
          <AdminPagination
            ko={ko}
            page={page}
            size={size}
            total={total}
            onPageChange={lq.setPage}
            onSizeChange={lq.setSize}
            className="mt-3"
          />
          </>
        )}
      </AdminCard>
    </div>
  );
}
