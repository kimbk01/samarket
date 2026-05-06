"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatMoneyPhp } from "@/lib/utils/format";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  order_no: string;
  order_completed_at?: string | null;
  gross_amount: number;
  fee_amount: number;
  settlement_amount: number;
  platform_fee_percent?: number;
  platform_fee_amount?: number;
  fixed_fee_amount?: number;
  delivery_income_amount?: number;
  refund_amount?: number;
  net_settlement_amount?: number;
  settlement_status: string;
  settlement_due_date: string;
  paid_at: string | null;
  hold_reason: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  payout_note?: string | null;
  payout_confirmed_at?: string | null;
  created_at: string;
};

type StoreOpt = { id: string; store_name?: string | null };

type OpsMode = "paid" | "held" | "processing";

const SETTLEMENT_STATUS_OPTS = [
  { value: "", label: "전체" },
  { value: "scheduled", label: "예정(scheduled)" },
  { value: "processing", label: "처리중(processing)" },
  { value: "paid", label: "지급완료(paid)" },
  { value: "held", label: "보류(held)" },
  { value: "cancelled", label: "취소(cancelled)" },
];

const PAYOUT_STATUS_OPTS = [
  { value: "", label: "전체" },
  { value: "paid", label: "지급 완료만" },
  { value: "unpaid", label: "미지급(paid 제외)" },
];

const PAYOUT_METHOD_OPTS = [
  { value: "", label: "선택" },
  { value: "cash", label: "현금" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank", label: "은행" },
  { value: "other", label: "기타" },
];

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

function settlementErrKo(code: string): string {
  switch (code.trim()) {
    case "invalid_state":
      return "이미 처리되었거나 이 작업을 할 수 없는 상태입니다. 목록을 새로고침해 주세요.";
    case "hold_reason_required":
      return "보류 사유를 입력해 주세요.";
    case "invalid_status":
      return "유효하지 않은 처리 유형입니다.";
    default:
      return code || "요청에 실패했습니다.";
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = status.trim();
  if (s === "held") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 sam-text-xxs font-semibold text-amber-950">보류</span>
    );
  }
  if (s === "paid") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 sam-text-xxs font-semibold text-emerald-900">
        지급완료
      </span>
    );
  }
  if (s === "scheduled") {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 sam-text-xxs text-slate-800">예정</span>;
  }
  if (s === "processing") {
    return <span className="rounded-full bg-blue-100 px-2 py-0.5 sam-text-xxs text-blue-900">처리중</span>;
  }
  if (s === "cancelled") {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 sam-text-xxs text-red-900">취소</span>;
  }
  return <span className="sam-text-xxs text-sam-muted">{s}</span>;
}

function payoutLabel(method: string | null | undefined): string {
  const m = String(method ?? "").trim();
  const hit = PAYOUT_METHOD_OPTS.find((o) => o.value === m);
  return hit?.label ?? (m || "—");
}

function netAmount(r: Row): number {
  return Number(r.net_settlement_amount ?? r.settlement_amount) || 0;
}

function platformFeeSum(r: Row): number {
  return (Number(r.platform_fee_amount ?? 0) || 0) + (Number(r.fixed_fee_amount ?? 0) || 0);
}

function payoutStatusLabel(r: Row): string {
  if (r.settlement_status === "paid") return "지급 완료";
  if (r.settlement_status === "held") return "보류(미지급)";
  if (r.settlement_status === "cancelled") return "취소";
  return "미지급";
}

function allowedModes(row: Row): Record<OpsMode, boolean> {
  const s = row.settlement_status;
  return {
    paid: s === "scheduled" || s === "processing" || s === "held",
    processing: s === "scheduled",
    held: s === "scheduled",
  };
}

export function AdminStoreSettlementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreOpt[]>([]);

  const [filterStoreId, setFilterStoreId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSettlementStatus, setFilterSettlementStatus] = useState("");
  const [filterPayoutStatus, setFilterPayoutStatus] = useState("");
  const [filterHeldOnly, setFilterHeldOnly] = useState(false);
  const [filterUnpaidOnly, setFilterUnpaidOnly] = useState(false);
  const [filterRefundOnly, setFilterRefundOnly] = useState(false);

  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [opsRow, setOpsRow] = useState<Row | null>(null);
  const [opsMode, setOpsMode] = useState<OpsMode>("paid");
  const [opsMethod, setOpsMethod] = useState("");
  const [opsRef, setOpsRef] = useState("");
  const [opsNote, setOpsNote] = useState("");
  const [opsHoldReason, setOpsHoldReason] = useState("");
  const [opsPaidAtLocal, setOpsPaidAtLocal] = useState("");
  const [opsError, setOpsError] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stores?status=all", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; stores?: any[] };
      if (!json?.ok || !Array.isArray(json.stores)) return;
      setStores(
        json.stores.map((s) => ({
          id: String(s.id),
          store_name: (s.store_name ?? null) as string | null,
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams();
    if (filterStoreId.trim()) qs.set("store_id", filterStoreId.trim());
    if (filterFrom.trim()) qs.set("from", filterFrom.trim());
    if (filterTo.trim()) qs.set("to", filterTo.trim());
    if (filterSettlementStatus.trim()) qs.set("settlement_status", filterSettlementStatus.trim());
    else if (filterPayoutStatus.trim()) qs.set("payout_status", filterPayoutStatus.trim());
    if (filterHeldOnly) qs.set("held_only", "1");
    if (filterUnpaidOnly) qs.set("unpaid_only", "1");
    if (filterRefundOnly) qs.set("refund_only", "1");
    qs.set("limit", "500");
    return qs.toString();
  }, [
    filterStoreId,
    filterFrom,
    filterTo,
    filterSettlementStatus,
    filterPayoutStatus,
    filterHeldOnly,
    filterUnpaidOnly,
    filterRefundOnly,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery();
      const res = await fetch(`/api/admin/store-settlements?${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(
          json?.error === "table_missing" ? "store_settlements 테이블을 적용해 주세요." : json?.error ?? "load_failed"
        );
        setRows([]);
        return;
      }
      setRows(json.settlements ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = useCallback(() => {
    setFilterStoreId("");
    setFilterFrom("");
    setFilterTo("");
    setFilterSettlementStatus("");
    setFilterPayoutStatus("");
    setFilterHeldOnly(false);
    setFilterUnpaidOnly(false);
    setFilterRefundOnly(false);
  }, []);

  const openOps = useCallback((r: Row) => {
    const allow = allowedModes(r);
    const defaultMode: OpsMode = allow.paid ? "paid" : allow.processing ? "processing" : "held";
    setOpsRow(r);
    setOpsMode(defaultMode);
    setOpsMethod(String(r.payout_method ?? ""));
    setOpsRef(String(r.payout_reference ?? ""));
    setOpsNote(String(r.payout_note ?? ""));
    setOpsHoldReason("");
    setOpsPaidAtLocal("");
    setOpsError(null);
  }, []);

  const closeOps = useCallback(() => {
    if (busyId) return;
    setOpsRow(null);
    setOpsError(null);
  }, [busyId]);

  const submitOps = useCallback(async () => {
    if (!opsRow) return;
    const allow = allowedModes(opsRow);
    if (!allow[opsMode]) {
      setOpsError("현재 상태에서는 선택한 처리를 할 수 없습니다.");
      return;
    }

    const id = opsRow.id;
    setBusyId(id);
    setOpsError(null);
    try {
      let body: Record<string, unknown> = {};
      if (opsMode === "paid") {
        body = {
          settlement_status: "paid",
          payout_method: opsMethod.trim() || null,
          payout_reference: opsRef.trim() || null,
          payout_note: opsNote.trim() || null,
        };
        if (opsPaidAtLocal.trim()) {
          const iso = new Date(opsPaidAtLocal).toISOString();
          body.paid_at = iso;
          body.payout_confirmed_at = iso;
        }
      } else if (opsMode === "processing") {
        body = {
          settlement_status: "processing",
          payout_method: opsMethod.trim() || null,
          payout_reference: opsRef.trim() || null,
          payout_note: opsNote.trim() || null,
        };
      } else {
        const hr = opsHoldReason.trim();
        if (!hr) {
          setOpsError(settlementErrKo("hold_reason_required"));
          setBusyId(null);
          return;
        }
        body = {
          settlement_status: "held",
          hold_reason: hr.slice(0, 500),
          payout_method: opsMethod.trim() || null,
          payout_reference: opsRef.trim() || null,
          payout_note: opsNote.trim() || null,
        };
      }

      const res = await fetch(`/api/admin/store-settlements/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json?.ok) {
        setOpsError(settlementErrKo(String(json?.error ?? "")));
        return;
      }
      setOpsRow(null);
      setOpsError(null);
      await load();
    } catch {
      setOpsError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }, [load, opsHoldReason, opsMethod, opsMode, opsNote, opsPaidAtLocal, opsRef, opsRow]);

  const anyOpsOpen = opsRow !== null;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장 정산센터" />
      <p className="sam-text-body-secondary text-sam-muted">
        주문 완료(completed) 시점에 원장이 생성됩니다. 기간 필터는 원장의 생성 시각(UTC) 기준입니다. 완료 반영 열은 주문이
        completed일 때의 주문 수정 시각입니다.
      </p>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-sam-fg">필터</h2>
        <p className="mt-1 sam-text-xxs text-sam-muted">
          「정산 상태」를 고르면 「지급 상태」는 무시됩니다. 보류만·미지급만·환불 반영만은 정산 상태와 함께 AND 로
          적용됩니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 sam-text-body-secondary">
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">기간 (원장 생성일 UTC)</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="rounded border border-sam-border px-2 py-1 text-sm"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
              <span className="text-sam-muted">~</span>
              <input
                type="date"
                className="rounded border border-sam-border px-2 py-1 text-sm"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">업체</span>
            <select
              className="min-w-[220px] rounded border border-sam-border px-2 py-1 text-sm"
              value={filterStoreId}
              onChange={(e) => setFilterStoreId(e.target.value)}
            >
              <option value="">전체</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.store_name ?? "매장")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">settlement_status</span>
            <select
              className="rounded border border-sam-border px-2 py-1 text-sm"
              value={filterSettlementStatus}
              onChange={(e) => {
                setFilterSettlementStatus(e.target.value);
                if (e.target.value) setFilterPayoutStatus("");
              }}
            >
              {SETTLEMENT_STATUS_OPTS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">payout_status</span>
            <select
              className="rounded border border-sam-border px-2 py-1 text-sm"
              value={filterPayoutStatus}
              disabled={Boolean(filterSettlementStatus)}
              onChange={(e) => setFilterPayoutStatus(e.target.value)}
            >
              {PAYOUT_STATUS_OPTS.map((o) => (
                <option key={o.value || "pall"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={filterHeldOnly} onChange={(e) => setFilterHeldOnly(e.target.checked)} />
            held only
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={filterUnpaidOnly} onChange={(e) => setFilterUnpaidOnly(e.target.checked)} />
            unpaid only
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={filterRefundOnly} onChange={(e) => setFilterRefundOnly(e.target.checked)} />
            refund affected only
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white"
            onClick={() => void load()}
          >
            적용·새로고침
          </button>
          <button type="button" className="rounded border border-sam-border px-3 py-2 text-sm" onClick={resetFilters}>
            필터 초기화
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">조건에 맞는 정산 건이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <table className="min-w-[1280px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2">정산 ID</th>
                <th className="px-2 py-2">주문 ID</th>
                <th className="px-2 py-2">업체명</th>
                <th className="px-2 py-2">주문금액</th>
                <th className="px-2 py-2">플랫폼 수수료</th>
                <th className="px-2 py-2">배달수익</th>
                <th className="px-2 py-2">환불</th>
                <th className="px-2 py-2">최종 정산</th>
                <th className="px-2 py-2">정산 상태</th>
                <th className="px-2 py-2">지급 상태</th>
                <th className="px-2 py-2">완료 반영</th>
                <th className="px-2 py-2">지급 완료일</th>
                <th className="px-2 py-2">메모</th>
                <th className="px-2 py-2">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const held = r.settlement_status === "held";
                const net = netAmount(r);
                const completedTs = r.order_completed_at ?? r.created_at;
                return (
                  <tr key={r.id} className={`border-b border-sam-border-soft ${held ? "bg-amber-50/70" : ""}`}>
                    <td className="px-2 py-2 font-mono sam-text-xxs text-sam-muted" title={r.id}>
                      {r.id.slice(0, 10)}…
                    </td>
                    <td className="px-2 py-2 font-mono sam-text-xxs text-sam-muted" title={r.order_id}>
                      {r.order_no || `${r.order_id.slice(0, 10)}…`}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sam-fg">{r.store_name || "—"}</span>
                        {held ? (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 sam-text-xxs font-semibold text-amber-950">
                            보류
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">{formatMoneyPhp(Number(r.gross_amount) || 0)}</td>
                    <td className="px-2 py-2">{formatMoneyPhp(platformFeeSum(r))}</td>
                    <td className="px-2 py-2">{formatMoneyPhp(Number(r.delivery_income_amount ?? 0) || 0)}</td>
                    <td className="px-2 py-2">{formatMoneyPhp(Number(r.refund_amount ?? 0) || 0)}</td>
                    <td className="px-2 py-2 font-medium">
                      {net < 0 ? <span className="text-red-700">{formatMoneyPhp(net)}</span> : formatMoneyPhp(net)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={r.settlement_status} />
                    </td>
                    <td className="px-2 py-2 sam-text-xxs">{payoutStatusLabel(r)}</td>
                    <td className="px-2 py-2 sam-text-xxs text-sam-muted">{fmtDt(completedTs)}</td>
                    <td className="px-2 py-2 sam-text-xxs text-sam-muted">{fmtDt(r.paid_at)}</td>
                    <td className="px-2 py-2 max-w-[200px] sam-text-xxs">
                      {held && r.hold_reason ? (
                        <span className="font-medium text-amber-950">보류: {r.hold_reason}</span>
                      ) : (
                        <span className="truncate text-sam-muted" title={r.payout_note ?? ""}>
                          {(r.payout_note ?? "").trim() || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="rounded border border-sam-border px-2 py-1 sam-text-xxs disabled:opacity-40"
                          disabled={busyId === r.id || anyOpsOpen}
                          onClick={() => setDetailRow(r)}
                        >
                          상세
                        </button>
                        {allowedModes(r).paid || allowedModes(r).processing || allowedModes(r).held ? (
                          <button
                            type="button"
                            className="rounded bg-sam-ink px-2 py-1 sam-text-xxs text-white disabled:opacity-40"
                            disabled={busyId === r.id || anyOpsOpen}
                            onClick={() => openOps(r)}
                          >
                            입금·지급
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailRow ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailRow(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settlement-detail-title"
          >
            <h2 id="settlement-detail-title" className="text-base font-bold text-sam-fg">
              정산 상세
            </h2>
            <dl className="mt-3 space-y-2 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">정산 ID</dt>
                <dd className="break-all font-mono sam-text-xxs">{detailRow.id}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">주문 ID</dt>
                <dd className="break-all font-mono sam-text-xxs">{detailRow.order_id}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">업체명</dt>
                <dd>{detailRow.store_name}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">금액</dt>
                <dd>
                  주문금액 {formatMoneyPhp(Number(detailRow.gross_amount) || 0)} · 플랫폼 수수료{" "}
                  {formatMoneyPhp(platformFeeSum(detailRow))} · 배달수익{" "}
                  {formatMoneyPhp(Number(detailRow.delivery_income_amount ?? 0) || 0)} · 환불{" "}
                  {formatMoneyPhp(Number(detailRow.refund_amount ?? 0) || 0)}
                  <div className="mt-1 font-medium text-sam-fg">최종 정산 {formatMoneyPhp(netAmount(detailRow))}</div>
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">상태</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={detailRow.settlement_status} />
                  <span className="sam-text-xxs text-sam-muted">지급 {payoutStatusLabel(detailRow)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">예정일</dt>
                <dd>{detailRow.settlement_due_date}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">완료 반영 시각</dt>
                <dd className="font-mono sam-text-xxs">{fmtDt(detailRow.order_completed_at ?? detailRow.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">지급</dt>
                <dd className="sam-text-xxs">
                  수단 {payoutLabel(detailRow.payout_method)} · 참조 {detailRow.payout_reference ?? "—"}
                  <div>paid_at {fmtDt(detailRow.paid_at)}</div>
                  <div>payout_confirmed_at {fmtDt(detailRow.payout_confirmed_at)}</div>
                </dd>
              </div>
              {detailRow.hold_reason ? (
                <div>
                  <dt className="text-sam-muted">보류 사유</dt>
                  <dd className="text-amber-950">{detailRow.hold_reason}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-sam-muted">운영 메모</dt>
                <dd className="whitespace-pre-wrap break-words">{detailRow.payout_note ?? "—"}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="mt-4 w-full rounded border border-sam-border py-2 text-sm font-medium text-sam-fg"
              onClick={() => setDetailRow(null)}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {opsRow ? (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busyId) closeOps();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-base font-bold text-sam-fg">입금·지급 확인</h2>
            <p className="mt-2 sam-text-helper text-sam-muted">
              <span className="font-medium text-sam-fg">{opsRow.store_name}</span> · 주문{" "}
              {opsRow.order_no || opsRow.order_id.slice(0, 12)} · 최종{" "}
              <span className="font-semibold text-sam-fg">{formatMoneyPhp(netAmount(opsRow))}</span>
            </p>

            <div className="mt-3 space-y-2 rounded-ui-rect border border-sam-border-soft bg-sam-app p-3 sam-text-xxs text-sam-muted">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="opsMode"
                  checked={opsMode === "paid"}
                  disabled={!allowedModes(opsRow).paid}
                  onChange={() => setOpsMode("paid")}
                />
                지급 완료 처리
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="opsMode"
                  checked={opsMode === "processing"}
                  disabled={!allowedModes(opsRow).processing}
                  onChange={() => setOpsMode("processing")}
                />
                처리중 (scheduled만)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="opsMode"
                  checked={opsMode === "held"}
                  disabled={!allowedModes(opsRow).held}
                  onChange={() => setOpsMode("held")}
                />
                보류 (사유 필수, scheduled만)
              </label>
            </div>

            {opsMode === "paid" && opsRow.settlement_status === "held" ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                보류 상태에서 지급 완료로 넘깁니다. 환불·분쟁 여부를 반드시 확인하세요.
              </p>
            ) : null}
            {opsMode === "paid" && Number(opsRow.refund_amount ?? 0) > 0 ? (
              <p className="mt-2 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
                환불이 반영된 건입니다. 금액과 상태를 다시 확인하세요.
              </p>
            ) : null}

            <label className="mt-3 block text-xs font-medium text-sam-muted">지급 수단</label>
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={opsMethod}
              disabled={Boolean(busyId)}
              onChange={(e) => setOpsMethod(e.target.value)}
            >
              {PAYOUT_METHOD_OPTS.map((o) => (
                <option key={o.value || "pm-none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-medium text-sam-muted">지급 reference</label>
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={opsRef}
              disabled={Boolean(busyId)}
              onChange={(e) => setOpsRef(e.target.value)}
              placeholder="거래번호·송금표시 등"
            />

            <label className="mt-3 block text-xs font-medium text-sam-muted">운영 메모</label>
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              rows={3}
              value={opsNote}
              disabled={Boolean(busyId)}
              onChange={(e) => setOpsNote(e.target.value)}
              placeholder="내부 메모"
            />

            {opsMode === "paid" ? (
              <>
                <label className="mt-3 block text-xs font-medium text-sam-muted">지급·입금 확인 일시 (선택)</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                  value={opsPaidAtLocal}
                  disabled={Boolean(busyId)}
                  onChange={(e) => setOpsPaidAtLocal(e.target.value)}
                />
                <p className="mt-1 sam-text-xxs text-sam-muted">비워두면 서버 시각으로 기록됩니다.</p>
              </>
            ) : null}

            {opsMode === "held" ? (
              <>
                <label className="mt-3 block text-xs font-medium text-amber-900">보류 사유 (필수)</label>
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm"
                  rows={3}
                  value={opsHoldReason}
                  disabled={Boolean(busyId)}
                  onChange={(e) => setOpsHoldReason(e.target.value)}
                  placeholder="사유를 입력하세요"
                />
              </>
            ) : null}

            {opsError ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {opsError}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => closeOps()}
                className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void submitOps()}
                className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
