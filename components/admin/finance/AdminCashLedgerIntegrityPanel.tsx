"use client";

/**
 * P0-6 — 매장 Cash 원장 무결성 (관리자 감사).
 * 원장 연쇄가 끊기거나 잔액 ≠ 원장 합계면 FAIL 로 그대로 보인다.
 * 「QA 직접 잔액 변경 의심」은 조사 메모일 뿐 정상 판정이 아니다 (정정은 Owner 승인 사항).
 */
import type { CashLedgerIntegrityReport } from "@/lib/finance/cash-ledger-chain-integrity";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

export type AdminCashIntegrityPayload =
  | CashLedgerIntegrityReport
  | { status: "UNAVAILABLE"; error: string };

function php(minor: number): string {
  return formatFinanceAmount({ wallet: "CASH", amount: minor, isMinor: true });
}

function phtTime(iso: string | null): string {
  return iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—";
}

export function AdminCashLedgerIntegrityPanel({ report, ko }: { report: AdminCashIntegrityPayload | null | undefined; ko: boolean }) {
  if (!report) return null;
  const c = (key: MessageKey, vars?: Record<string, unknown>) => translateBy(ko ? "ko" : "en", key, vars);
  if (!("rowCount" in report)) {
    return (
      <section className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-cash-integrity="UNAVAILABLE">
        <p className="text-sm font-semibold text-sam-fg">{c("admin_finance_cash_integrity_title")}</p>
        <p className="mt-1 text-sm text-sam-danger">{c("admin_finance_cash_integrity_read_failed")}</p>
      </section>
    );
  }
  const fail = report.status !== "PASS";
  return (
    <section
      className={`mt-4 rounded-ui-rect border p-3 ${fail ? "border-sam-danger bg-sam-surface" : "border-sam-border bg-sam-surface"}`}
      data-admin-cash-integrity={report.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sam-fg">{c("admin_finance_cash_integrity_title")}</p>
        <span className={`text-sm font-bold ${fail ? "text-sam-danger" : "text-sam-fg"}`}>
          {report.status === "PASS" ? c("admin_finance_cash_integrity_pass") : report.status === "FAIL" ? c("admin_finance_cash_integrity_fail") : c("admin_finance_cash_integrity_unavailable")}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-sam-muted">{c("admin_finance_cash_integrity_account_balance")}</dt>
        <dd className="tabular-nums">{report.balanceMinor == null ? "—" : php(report.balanceMinor)}</dd>
        <dt className="text-sam-muted">{c("admin_finance_cash_integrity_ledger_sum")}</dt>
        <dd className="tabular-nums">{php(report.ledgerSumMinor)}</dd>
        <dt className="text-sam-muted">{c("admin_finance_cash_integrity_balance_minus_sum")}</dt>
        <dd className={`tabular-nums ${report.balanceVsLedgerSumDiffMinor ? "font-semibold text-sam-danger" : ""}`}>
          {report.balanceVsLedgerSumDiffMinor == null ? "—" : php(report.balanceVsLedgerSumDiffMinor)}
        </dd>
        <dt className="text-sam-muted">{c("admin_finance_cash_integrity_balance_minus_last")}</dt>
        <dd className={`tabular-nums ${report.balanceVsLastAfterDiffMinor ? "font-semibold text-sam-danger" : ""}`}>
          {report.balanceVsLastAfterDiffMinor == null ? "—" : php(report.balanceVsLastAfterDiffMinor)}
        </dd>
      </dl>
      {report.truncated ? (
        <p className="mt-2 text-sm text-sam-danger">
          {c("admin_finance_cash_integrity_truncated", { rows: formatAdminNumber(report.rowCount) })}
        </p>
      ) : null}
      {report.breaks.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-sam-danger">
            {c("admin_finance_cash_integrity_breaks", { n: report.breaks.length })}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {report.breaks.map((b, i) => (
              <li key={`${b.id ?? i}`} className="rounded-ui-rect border border-sam-border-soft px-2 py-1" data-admin-cash-integrity-break="1">
                <span className="tabular-nums">{phtTime(b.created_at)}</span> · {b.entry_kind} {b.direction === "debit" ? "−" : "+"}
                {php(b.amount_minor)} · {c("admin_finance_cash_integrity_prev")} {php(b.prev_after)} → {c("admin_finance_cash_integrity_expected")} {php(b.expected_after)} /{" "}
                {c("admin_finance_cash_integrity_recorded")} {php(b.actual_after)} ({c("admin_finance_cash_integrity_diff")} {php(b.delta)})
                {b.suspected_cause === "qa_direct_balance_write_pattern" ? (
                  <span className="ml-1 text-sam-muted">
                    {c("admin_finance_cash_integrity_qa_note")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
