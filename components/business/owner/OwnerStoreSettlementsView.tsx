"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { fetchOwnerStoreSettlementsDeduped } from "@/lib/business/fetch-owner-store-settlements-deduped";
import {
  OWNER_STORE_SETTLEMENT_STATUS_FILTERS,
  OWNER_STORE_SETTLEMENT_STATUS_LABEL,
  ownerStoreSettlementStatusChipClass,
  type OwnerStoreSettlementStatusFilter,
} from "@/lib/business/owner-store-settlement-labels";
import type {
  OwnerStoreSettlementRow,
  OwnerStoreSettlementsMeta,
} from "@/lib/business/owner-store-settlement-types";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { summarizeOwnerStoreSettlements } from "@/lib/business/summarize-owner-store-settlements";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { formatMoneyPhp } from "@/lib/utils/format";

function formatSettlementDate(iso: string | null | undefined): string {
  const t = typeof iso === "string" ? iso.trim() : "";
  if (!t) return "—";
  const d = t.slice(0, 10);
  return d.replace(/-/g, ". ");
}

function SettlementRowCard({ row }: { row: OwnerStoreSettlementRow }) {
  const status = String(row.settlement_status ?? "");
  const net = Number(row.net_settlement_amount ?? row.settlement_amount) || 0;
  return (
    <li className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sam-fg">
            주문 {row.order_no || row.order_id.slice(0, 8)}
          </p>
          <p className="mt-0.5 sam-text-xxs text-sam-muted">
            정산 예정일 {formatSettlementDate(row.settlement_due_date)}
            {row.paid_at ? ` · 지급 ${formatSettlementDate(row.paid_at)}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${ownerStoreSettlementStatusChipClass(status)}`}
        >
          {OWNER_STORE_SETTLEMENT_STATUS_LABEL[status] ?? status}
        </span>
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums text-sam-fg">{formatMoneyPhp(net)}</p>
      <p className="mt-1 sam-text-xxs text-sam-muted">
        매출 {formatMoneyPhp(Number(row.gross_amount) || 0)} · 수수료{" "}
        {formatMoneyPhp(Number(row.fee_amount) || 0)} · 환불{" "}
        {formatMoneyPhp(Number(row.refund_amount ?? 0) || 0)}
      </p>
      <p className="mt-0.5 sam-text-xxs text-sam-meta">
        플랫폼 {formatMoneyPhp(Number(row.platform_fee_amount ?? 0) || 0)} · 고정{" "}
        {formatMoneyPhp(Number(row.fixed_fee_amount ?? 0) || 0)} · 배달 차감{" "}
        {formatMoneyPhp(Number(row.delivery_income_amount ?? 0) || 0)}
      </p>
      {row.hold_reason ? (
        <p className="mt-2 rounded-ui-rect bg-amber-50 px-2 py-1.5 sam-text-xxs text-amber-950">
          보류: {row.hold_reason}
        </p>
      ) : null}
      {row.payout_confirmed_at ? (
        <p className="mt-2 sam-text-xxs text-sam-muted">
          입금 확인 {formatSettlementDate(row.payout_confirmed_at)}
          {row.payout_method ? ` · ${row.payout_method}` : ""}
          {row.payout_reference ? ` · ${row.payout_reference}` : ""}
        </p>
      ) : null}
      <Link
        href={buildStoreOrdersHref({
          storeId: row.store_id,
          orderId: row.order_id,
        })}
        className="mt-2 inline-block sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
      >
        해당 주문 보기
      </Link>
    </li>
  );
}

/** 매장 어드민 — 정산 내역 (`/stores/owner/settlements?storeId=`) */
export function OwnerStoreSettlementsView() {
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  const [rows, setRows] = useState<OwnerStoreSettlementRow[]>([]);
  const [meta, setMeta] = useState<OwnerStoreSettlementsMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OwnerStoreSettlementStatusFilter>("all");

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.settlement_status === statusFilter);
  }, [rows, statusFilter]);

  const summary = useMemo(() => summarizeOwnerStoreSettlements(filteredRows), [filteredRows]);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      setRows([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchOwnerStoreSettlementsDeduped(storeId);
      const body = json as {
        ok?: boolean;
        error?: string;
        settlements?: OwnerStoreSettlementRow[];
        meta?: OwnerStoreSettlementsMeta;
      };
      if (status === 401) {
        setError("로그인이 필요합니다.");
        setRows([]);
        return;
      }
      if (status === 403) {
        setError("이 매장에 대한 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!body?.ok) {
        setError(
          body?.error === "table_missing"
            ? "정산 테이블이 아직 적용되지 않았습니다."
            : typeof body?.error === "string"
              ? body.error
              : "load_failed"
        );
        setRows([]);
        return;
      }
      setRows(body.settlements ?? []);
      setMeta(body.meta ?? {});
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!storeId) {
    return (
      <div className={`mx-auto max-w-4xl ${OWNER_STORE_STACK_Y_CLASS}`}>
        <OwnerStoreAdminDashSection title="정산 안내">
          <p className="sam-text-body text-sam-muted">
            정산 내역은 운영 중인 매장을 선택한 뒤 확인할 수 있습니다.
          </p>
          <Link href={OwnerRoutes.hub()} className="inline-flex font-medium text-signature underline">
            내 매장으로 이동
          </Link>
        </OwnerStoreAdminDashSection>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-4xl min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}>
      <OwnerStoreAdminDashSection title="정산 안내">
        <p className="sam-text-body text-sam-muted">
          주문이 <strong className="font-semibold text-sam-fg">완료(completed)</strong>되면 정산 예정 건이
          생성됩니다. 실제 입금·보류 해제는 플랫폼 운영에서 처리하며, 이 화면에서는 조회만 가능합니다.
        </p>
        {meta.settlement_delay_days != null || meta.settlement_fee_percent != null ? (
          <ul className="mt-2 list-inside list-disc sam-text-helper text-sam-muted">
            {meta.settlement_delay_days != null ? (
              <li>완료 후 약 {meta.settlement_delay_days}일 뒤 지급 예정일이 잡힙니다.</li>
            ) : null}
            {meta.settlement_fee_percent != null ? (
              <li>플랫폼 수수료 기본 {meta.settlement_fee_percent}% (매장·카테고리 정책에 따라 달라질 수 있음)</li>
            ) : null}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-medium text-sam-fg disabled:opacity-50"
          >
            {loading ? "새로고침 중…" : "새로고침"}
          </button>
          <Link
            href={OwnerRoutes.orders(storeId)}
            className="rounded-ui-rect border border-signature/40 bg-signature/5 px-3 py-2 sam-text-helper font-medium text-signature"
          >
            주문 관리
          </Link>
        </div>
      </OwnerStoreAdminDashSection>

      {error ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="sam-text-body text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 && !error ? (
        <OwnerStoreAdminDashSection title="정산 내역">
          <p className="sam-text-body text-sam-muted">
            아직 정산 내역이 없습니다. 완료된 주문이 생기면 여기에 표시됩니다.
          </p>
        </OwnerStoreAdminDashSection>
      ) : (
        <>
          <OwnerStoreAdminDashSection title="정산 요약">
            <p className="sam-text-xxs text-sam-muted">
              {meta.store_name ? `${meta.store_name} · ` : ""}
              {statusFilter === "all" ? "전체" : OWNER_STORE_SETTLEMENT_STATUS_LABEL[statusFilter]}{" "}
              {summary.count}건 기준
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCell label="총 매출" value={formatMoneyPhp(summary.gross)} />
              <SummaryCell label="플랫폼·고정 수수료" value={formatMoneyPhp(summary.platformFee)} />
              <SummaryCell label="배달비 차감" value={formatMoneyPhp(summary.deliveryIncome)} />
              <SummaryCell label="환불 차감" value={formatMoneyPhp(summary.refund)} />
              <SummaryCell label="정산 예정금" value={formatMoneyPhp(summary.pendingNet)} />
              <SummaryCell
                label="정산 완료금"
                value={formatMoneyPhp(summary.paidNet)}
                valueClassName="text-emerald-800"
              />
            </div>
            <p className="mt-2 sam-text-xxs text-sam-muted">
              예정금은 scheduled·processing·held, 완료금은 paid 상태만 합산합니다.
            </p>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title="상태별 보기">
            <div className="flex flex-wrap gap-1.5">
              {OWNER_STORE_SETTLEMENT_STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={
                      active
                        ? "rounded-full bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white"
                        : "rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted"
                    }
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            {filteredRows.length === 0 ? (
              <p className="mt-3 sam-text-body text-sam-muted">선택한 상태의 정산 건이 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {filteredRows.map((r) => (
                  <SettlementRowCard key={r.id} row={r} />
                ))}
              </ul>
            )}
          </OwnerStoreAdminDashSection>
        </>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  valueClassName = "text-sam-fg",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
      <p className="sam-text-xxs text-sam-muted">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  );
}
