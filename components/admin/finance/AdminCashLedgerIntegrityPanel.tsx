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
  const c = (k: string, e: string) => (ko ? k : e);
  if (!("rowCount" in report)) {
    return (
      <section className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-cash-integrity="UNAVAILABLE">
        <p className="text-sm font-semibold text-sam-fg">{c("Cash 원장 무결성", "Cash ledger integrity")}</p>
        <p className="mt-1 text-sm text-sam-danger">{c("원장을 읽지 못해 확인할 수 없습니다.", "Could not read the ledger.")}</p>
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
        <p className="text-sm font-semibold text-sam-fg">{c("Cash 원장 무결성", "Cash ledger integrity")}</p>
        <span className={`text-sm font-bold ${fail ? "text-sam-danger" : "text-sam-fg"}`}>
          {report.status === "PASS" ? c("일치", "PASS") : report.status === "FAIL" ? c("불일치 (FAIL)", "FAIL") : c("확인 불가", "UNAVAILABLE")}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-sam-muted">{c("계정 잔액", "Account balance")}</dt>
        <dd className="tabular-nums">{report.balanceMinor == null ? "—" : php(report.balanceMinor)}</dd>
        <dt className="text-sam-muted">{c("원장 합계", "Ledger sum")}</dt>
        <dd className="tabular-nums">{php(report.ledgerSumMinor)}</dd>
        <dt className="text-sam-muted">{c("잔액 − 원장 합계", "Balance − ledger sum")}</dt>
        <dd className={`tabular-nums ${report.balanceVsLedgerSumDiffMinor ? "font-semibold text-sam-danger" : ""}`}>
          {report.balanceVsLedgerSumDiffMinor == null ? "—" : php(report.balanceVsLedgerSumDiffMinor)}
        </dd>
        <dt className="text-sam-muted">{c("잔액 − 마지막 기록", "Balance − last after")}</dt>
        <dd className={`tabular-nums ${report.balanceVsLastAfterDiffMinor ? "font-semibold text-sam-danger" : ""}`}>
          {report.balanceVsLastAfterDiffMinor == null ? "—" : php(report.balanceVsLastAfterDiffMinor)}
        </dd>
      </dl>
      {report.truncated ? (
        <p className="mt-2 text-sm text-sam-danger">
          {c(`원장이 ${formatAdminNumber(report.rowCount)}행을 넘어 앞부분만 검사했습니다 — 전체 PASS 아님.`, "Ledger exceeds the scan limit — partial check only.")}
        </p>
      ) : null}
      {report.breaks.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-sam-danger">
            {c(`원장 연쇄 끊김 ${report.breaks.length}건 (직전 잔액 ± 금액 ≠ 기록 잔액)`, `${report.breaks.length} chain break(s)`)}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {report.breaks.map((b, i) => (
              <li key={`${b.id ?? i}`} className="rounded-ui-rect border border-sam-border-soft px-2 py-1" data-admin-cash-integrity-break="1">
                <span className="tabular-nums">{phtTime(b.created_at)}</span> · {b.entry_kind} {b.direction === "debit" ? "−" : "+"}
                {php(b.amount_minor)} · {c("직전", "prev")} {php(b.prev_after)} → {c("예상", "expected")} {php(b.expected_after)} /{" "}
                {c("기록", "recorded")} {php(b.actual_after)} ({c("차이", "diff")} {php(b.delta)})
                {b.suspected_cause === "qa_direct_balance_write_pattern" ? (
                  <span className="ml-1 text-sam-muted">
                    {c(
                      "· 조사 메모: 원장 없이 잔액을 직접 바꾼 흔적(2026-09-01 QA 하네스 패턴). 정정 여부는 Owner 승인 대기 — 정상 처리 아님",
                      "· Note: balance changed without a ledger row (QA harness pattern). Correction awaits Owner approval — not resolved"
                    )}
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
