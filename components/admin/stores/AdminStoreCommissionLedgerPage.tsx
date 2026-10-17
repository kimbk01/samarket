"use client";

/**
 * Admin — 배달 정산 = 매장 수수료 원장 (`/admin/store-settlements`).
 *
 * 매장 직접 결제 모델: 주문별 "지급/정산" 버튼 없음.
 * - 조리 시작 시 수수료 자동 차감 (캐시 부족분은 미납 → 순잔액 마이너스)
 * - 관리자 수동 작업은 취소·환불된 주문의 수수료 처리(환급 / 환급 안 함)뿐
 * Owner 화면과 같은 loader·같은 컴포넌트(StoreCommissionLedgerParts)를 쓴다.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  STORE_CASH_ORDER_GATE_LABEL,
  STORE_CASH_ORDER_GATE_MODES,
  type StoreCashOrderGateMode,
  type StoreCashPosition,
  type StoreCommissionRowState,
} from "@/lib/stores/commission/store-commission-contract";
import type {
  StoreCommissionLedgerRow,
  StoreCommissionLedgerSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { buildStoreCommissionLedgerSearch } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  COMMISSION_STATE_FILTERS,
  CommissionRowMoney,
  CommissionStateChip,
  CommissionSummaryGrid,
  commissionFilterLabel,
  formatCashMinor,
  pickCommissionCopy,
  StoreCashPositionCard,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";

const PAGE_SIZE = 100;

type LedgerResponse = {
  ok: boolean;
  error?: string;
  gateMode?: StoreCashOrderGateMode;
  rows?: StoreCommissionLedgerRow[];
  totalRows?: number;
  summary?: StoreCommissionLedgerSummary;
  positions?: StoreCashPosition[];
  storeNames?: Record<string, string>;
  truncated?: boolean;
};

type ReviewModal = {
  row: StoreCommissionLedgerRow;
  decision: "refund" | "keep" | null;
  note: string;
};

const ADJUST_ERROR: Record<string, { ko: string; en: string }> = {
  note_required: { ko: "처리 사유를 2자 이상 입력하세요.", en: "Enter a reason (2+ characters)." },
  not_in_review: { ko: "이미 처리된 건입니다. 새로고침하세요.", en: "Already decided. Refresh." },
  order_not_closed: { ko: "주문이 취소/환불 상태가 아닙니다.", en: "Order is not cancelled/refunded." },
  admin_required: { ko: "관리자 권한이 필요합니다.", en: "Admin permission required." },
  rpc_missing: { ko: "DB 마이그레이션이 적용되지 않았습니다.", en: "DB migration not applied." },
};

export function AdminStoreCommissionLedgerPage() {
  const { language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const router = useRouter();
  const searchParams = useSearchParams();

  const storeId = searchParams.get("store_id")?.trim() ?? "";
  const stateParam = (searchParams.get("state")?.trim() ?? "all") as StoreCommissionRowState | "all";
  const state = COMMISSION_STATE_FILTERS.includes(stateParam) ? stateParam : "all";

  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ReviewModal | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);

  const setUrl = useCallback(
    (next: { store_id?: string; state?: string }) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== "all") sp.set(k, v);
        else sp.delete(k);
      }
      setOffset(0);
      router.replace(`/admin/store-settlements${sp.toString() ? `?${sp}` : ""}`);
    },
    [router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildStoreCommissionLedgerSearch({
        storeId,
        state,
        from: fromDay || null,
        to: toDay || null,
        orderNo: orderNo || null,
        limit: PAGE_SIZE,
        offset,
      });
      const res = await fetch(`/api/admin/store-commission-ledger?${qs}`, { credentials: "include" });
      const json = (await res.json()) as LedgerResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("network_error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromDay, offset, orderNo, state, storeId, toDay]);

  useEffect(() => {
    void load();
  }, [load]);

  const positions = useMemo(() => data?.positions ?? [], [data?.positions]);
  const sortedPositions = useMemo(
    () => [...positions].sort((a, b) => a.netMinor - b.netMinor),
    [positions]
  );
  const storeNames = useMemo(() => new Map(Object.entries(data?.storeNames ?? {})), [data?.storeNames]);
  const selectedPosition = storeId ? positions.find((p) => p.storeId === storeId) ?? null : null;
  const blockedCount = positions.filter((p) => !p.orderable).length;
  const negativeCount = positions.filter((p) => p.netMinor < 0).length;

  const saveGate = async (mode: StoreCashOrderGateMode) => {
    if (mode === data?.gateMode) return;
    const msg =
      mode === "block_when_not_positive"
        ? pickCommissionCopy(
            lang,
            `순잔액이 0 이하인 매장은 즉시 신규 주문이 차단됩니다. (현재 ${positions.filter((p) => p.netMinor <= 0).length}개 매장 해당) 적용할까요?`,
            `Stores with net <= 0 stop receiving new orders immediately (${positions.filter((p) => p.netMinor <= 0).length} stores now). Apply?`
          )
        : pickCommissionCopy(lang, "캐시가 부족해도 주문을 받도록 차단을 해제할까요?", "Turn off the order block?");
    if (!window.confirm(msg)) return;
    setGateBusy(true);
    try {
      const res = await fetch("/api/admin/store-commission-ledger/gate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        window.alert(json.error ?? `HTTP ${res.status}`);
        return;
      }
      await load();
    } finally {
      setGateBusy(false);
    }
  };

  const submitDecision = async () => {
    if (!modal?.decision) return;
    setBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/admin/store-commission-ledger/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order_id: modal.row.orderId, decision: modal.decision, note: modal.note.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        const code = json.error ?? `HTTP ${res.status}`;
        setModalError(ADJUST_ERROR[code]?.[lang] ?? code);
        return;
      }
      setModal(null);
      emitAdminQueueChanged("settlements");
      await load();
    } catch {
      setModalError(pickCommissionCopy(lang, "네트워크 오류", "Network error"));
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.rows ?? [];
  const totalRows = data?.totalRows ?? 0;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={pickCommissionCopy(lang, "배달 정산 · 매장 수수료 원장", "Delivery settlement · Store commission ledger")}
        description={pickCommissionCopy(
          lang,
          "고객은 매장에 직접 결제합니다(COD·GCash·계좌이체). 플랫폼 수수료는 조리 시작 시 매장 캐시에서 자동 차감되며, 주문별 지급 처리는 없습니다. 관리자는 취소·환불된 주문의 수수료만 처리합니다.",
          "Buyers pay the store directly. Commission is auto-charged from the store's Cash at cooking start; there is no per-order payout. Admins only decide commission on cancelled/refunded orders."
        )}
      />

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" aria-label="policy">
        <h2 className="text-sm font-semibold text-sam-fg">
          {pickCommissionCopy(lang, "정산 규칙", "Settlement rules")}
        </h2>
        <ol className="mt-2 list-inside list-decimal space-y-0.5 sam-text-helper text-sam-muted">
          <li>{pickCommissionCopy(lang, "조리 시작(접수 → 조리중) 순간 수수료가 캐시에서 차감됩니다.", "Commission is debited from Cash when cooking starts.")}</li>
          <li>{pickCommissionCopy(lang, "캐시가 모자라면 남은 금액은 미납으로 남고 순잔액이 마이너스가 됩니다.", "Any shortfall stays unpaid; net Cash goes negative.")}</li>
          <li>{pickCommissionCopy(lang, "캐시 충전·Coin 전환 시 가장 오래된 미납부터 자동 정산됩니다.", "Top-up / Coin conversion pays the oldest unpaid first.")}</li>
          <li>{pickCommissionCopy(lang, "조리 시작 후 취소·환불되면 자동 환급하지 않고 아래 '검토 대기'에서 관리자가 결정합니다.", "Cancel/refund after cooking start → admin decides below (no auto refund).")}</li>
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="sam-text-helper font-medium text-sam-fg">
            {pickCommissionCopy(lang, "캐시 부족 매장 주문 차단", "Block orders when Cash is short")}
          </span>
          {STORE_CASH_ORDER_GATE_MODES.map((mode) => {
            const active = data?.gateMode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={gateBusy || loading}
                onClick={() => void saveGate(mode)}
                className={
                  active
                    ? "rounded-full bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white"
                    : "rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50"
                }
                aria-pressed={active}
              >
                {STORE_CASH_ORDER_GATE_LABEL[mode][lang]}
              </button>
            );
          })}
        </div>
      </section>

      {error ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sam-fg">
            {pickCommissionCopy(lang, "매장별 캐시 현황", "Cash by store")}
          </h2>
          <p className="sam-text-xxs text-sam-muted">
            {pickCommissionCopy(
              lang,
              `마이너스 ${negativeCount}개 · 주문 차단 ${blockedCount}개`,
              `${negativeCount} negative · ${blockedCount} blocked`
            )}
            {storeId ? (
              <button type="button" className="ml-2 font-medium text-signature underline" onClick={() => setUrl({ store_id: "" })}>
                {pickCommissionCopy(lang, "전체 매장 보기", "All stores")}
              </button>
            ) : null}
          </p>
        </div>
        {selectedPosition ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold text-sam-fg">{storeNames.get(selectedPosition.storeId) || storeId}</p>
            <StoreCashPositionCard position={selectedPosition} lang={lang} />
            <Link href={businessCcFinancialStatementHref(storeId)} className="inline-block sam-text-helper font-medium text-signature underline">
              {pickCommissionCopy(lang, "매장 재무제표 · 캐시 원장 보기", "Store financial statement · Cash ledger")}
            </Link>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sam-text-xxs text-sam-muted">
                <tr>
                  <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "매장", "Store")}</th>
                  <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "캐시 잔액", "Cash")}</th>
                  <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "미납", "Unpaid")}</th>
                  <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "순잔액", "Net")}</th>
                  <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "주문", "Orders")}</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((p) => (
                  <tr key={p.storeId} className="border-t border-sam-border-soft">
                    <td className="py-1.5 pr-3">{storeNames.get(p.storeId) || p.storeId.slice(0, 8)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatCashMinor(p.balanceMinor)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${p.outstandingMinor > 0 ? "text-red-700" : ""}`}>
                      {formatCashMinor(p.outstandingMinor)}
                    </td>
                    <td className={`py-1.5 pr-3 text-right font-semibold tabular-nums ${p.netMinor < 0 ? "text-red-700" : "text-sam-fg"}`}>
                      {formatCashMinor(p.netMinor)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={`sam-text-xxs font-semibold ${p.orderable ? "text-emerald-800" : "text-red-700"}`}>
                        {p.orderable ? pickCommissionCopy(lang, "접수 가능", "Open") : pickCommissionCopy(lang, "차단", "Blocked")}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      <button type="button" className="sam-text-xxs font-medium text-signature underline" onClick={() => setUrl({ store_id: p.storeId })}>
                        {pickCommissionCopy(lang, "원장 보기", "Ledger")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "수수료 합계", "Commission totals")}</h2>
        <div className="mt-3">{data?.summary ? <CommissionSummaryGrid summary={data.summary} lang={lang} /> : null}</div>
        {data?.truncated ? (
          <p className="mt-2 sam-text-xxs text-amber-800">
            {pickCommissionCopy(lang, "5,000건 초과 — 기간을 좁혀 주세요.", "Over 5,000 rows — narrow the period.")}
          </p>
        ) : null}
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap gap-1.5">
          {COMMISSION_STATE_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setUrl({ state: s })}
              className={
                state === s
                  ? "rounded-full bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white"
                  : "rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted"
              }
            >
              {commissionFilterLabel(s, lang)}
              {s === "review_required" && (data?.summary?.reviewCount ?? 0) > 0 && state !== s
                ? ` ${data?.summary?.reviewCount}`
                : ""}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input type="date" className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper" value={fromDay} onChange={(e) => { setOffset(0); setFromDay(e.target.value); }} aria-label="from" />
          <input type="date" className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper" value={toDay} onChange={(e) => { setOffset(0); setToDay(e.target.value); }} aria-label="to" />
          <input
            className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
            value={orderNo}
            onChange={(e) => { setOffset(0); setOrderNo(e.target.value); }}
            placeholder={pickCommissionCopy(lang, "주문번호", "Order no.")}
          />
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
            {loading ? pickCommissionCopy(lang, "불러오는 중…", "Loading…") : pickCommissionCopy(lang, "새로고침", "Refresh")}
          </button>
        </div>

        {rows.length === 0 && !loading ? (
          <p className="mt-4 sam-text-body text-sam-muted">{pickCommissionCopy(lang, "해당하는 수수료 내역이 없습니다.", "No commission rows.")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.obligationId} className="rounded-ui-rect border border-sam-border-soft bg-sam-app/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sam-fg">
                      <Link href={`/admin/stores/orders/${encodeURIComponent(r.orderId)}`} className="hover:underline">
                        #{r.orderNo}
                      </Link>{" "}
                      <span className="font-normal text-sam-muted">· {r.storeName || r.storeId.slice(0, 8)}</span>
                    </p>
                    <p className="sam-text-xxs text-sam-muted">
                      {pickCommissionCopy(lang, "주문 상태", "Order")}: {r.orderStatus || "—"}
                      {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
                      {r.adjustmentTrigger
                        ? ` · ${r.adjustmentTrigger === "cancelled" ? pickCommissionCopy(lang, "조리 후 취소", "cancelled after cooking") : pickCommissionCopy(lang, "환불", "refunded")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CommissionStateChip state={r.state} lang={lang} />
                    {r.state === "review_required" ? (
                      <button
                        type="button"
                        className={Sam.btn.primary}
                        onClick={() => {
                          setModalError(null);
                          setModal({ row: r, decision: null, note: "" });
                        }}
                      >
                        {pickCommissionCopy(lang, "수수료 처리", "Decide")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2">
                  <CommissionRowMoney row={r} lang={lang} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalRows > PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-between sam-text-helper">
            <button type="button" className={Sam.btn.secondary} disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              {pickCommissionCopy(lang, "이전", "Prev")}
            </button>
            <span className="text-sam-muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, totalRows)} / {totalRows}
            </span>
            <button type="button" className={Sam.btn.secondary} disabled={offset + PAGE_SIZE >= totalRows || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
              {pickCommissionCopy(lang, "다음", "Next")}
            </button>
          </div>
        ) : null}
      </section>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-ui-rect bg-sam-surface p-4 shadow-lg">
            <h3 className="text-base font-semibold text-sam-fg">
              {pickCommissionCopy(lang, "취소·환불 주문 수수료 처리", "Commission on cancelled/refunded order")}
            </h3>
            <p className="mt-1 sam-text-helper text-sam-muted">
              #{modal.row.orderNo} · {modal.row.storeName}
            </p>
            <div className="mt-3 rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
              <CommissionRowMoney row={modal.row} lang={lang} />
            </div>
            <fieldset className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border-soft p-2">
                <input type="radio" name="decision" checked={modal.decision === "refund"} onChange={() => setModal({ ...modal, decision: "refund" })} />
                <span className="sam-text-helper text-sam-fg">
                  <b>{pickCommissionCopy(lang, "수수료 환급", "Refund commission")}</b>
                  <br />
                  {pickCommissionCopy(
                    lang,
                    `캐시 +${formatCashMinor(modal.row.feePaidMinor)} 환급, 미납 ${formatCashMinor(modal.row.feeOutstandingMinor)} 취소`,
                    `Cash +${formatCashMinor(modal.row.feePaidMinor)}, unpaid ${formatCashMinor(modal.row.feeOutstandingMinor)} cancelled`
                  )}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border-soft p-2">
                <input type="radio" name="decision" checked={modal.decision === "keep"} onChange={() => setModal({ ...modal, decision: "keep" })} />
                <span className="sam-text-helper text-sam-fg">
                  <b>{pickCommissionCopy(lang, "환급 안 함", "Keep commission")}</b>
                  <br />
                  {pickCommissionCopy(
                    lang,
                    "매장 귀책 취소 등. 차감액 유지, 미납이 있으면 계속 청구됩니다.",
                    "e.g. store-fault cancel. Charge stays; unpaid remains owed."
                  )}
                </span>
              </label>
            </fieldset>
            <textarea
              className="mt-3 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              rows={3}
              placeholder={pickCommissionCopy(lang, "처리 사유 (필수, 매장에도 표시됨)", "Reason (required, visible to the store)")}
              value={modal.note}
              onChange={(e) => setModal({ ...modal, note: e.target.value })}
            />
            {modalError ? <p className="mt-2 sam-text-helper text-red-700">{modalError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={Sam.btn.secondary} disabled={busy} onClick={() => setModal(null)}>
                {pickCommissionCopy(lang, "닫기", "Close")}
              </button>
              <button
                type="button"
                className={Sam.btn.primary}
                disabled={busy || !modal.decision || modal.note.trim().length < 2}
                onClick={() => void submitDecision()}
              >
                {busy ? pickCommissionCopy(lang, "처리 중…", "Saving…") : pickCommissionCopy(lang, "확정", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
