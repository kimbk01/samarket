/**
 * 매장 재무 기간 해석 (오늘·최근 7일·최근 30일·직접 — Asia/Manila 영업일).
 * 재감사 P-8 (2026-11-04): 예전 「매장 재무제표」 화면(AdminStoreFinancialStatement)과 그 API·로더는 화면 연결 0 이라 삭제했다.
 * 같은 내용(주문·판매·수수료·미납·Coin·Cash·광고·일자별)은 /admin/finance/stores/[storeId] (store-statement · daily-statement)가 보여 준다.
 * 이 파일에는 여러 재무 경로가 함께 쓰는 기간 해석만 남는다.
 */
import { resolveStoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import type { StoreFinancialPeriodKey } from "@/lib/admin/store-financial-statement/types";

function dayInManila(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysIsoDay(day: string, delta: number): string {
  const t = new Date(`${day}T12:00:00+08:00`).getTime() + delta * 86400000;
  return dayInManila(new Date(t));
}

export function resolveStoreFinancialPeriod(input: {
  period?: string | null;
  fromDay?: string | null;
  toDay?: string | null;
}): { key: StoreFinancialPeriodKey; fromIso: string; toIso: string; fromDay: string; toDay: string } {
  const today = dayInManila();
  const raw = String(input.period ?? "30d").trim().toLowerCase();
  let key: StoreFinancialPeriodKey = "30d";
  let fromDay = addDaysIsoDay(today, -29);
  let toDay = today;
  if (raw === "today") {
    key = "today";
    fromDay = today;
  } else if (raw === "7d") {
    key = "7d";
    fromDay = addDaysIsoDay(today, -6);
  } else if (raw === "custom" && input.fromDay && input.toDay) {
    key = "custom";
    fromDay = String(input.fromDay).trim();
    toDay = String(input.toDay).trim();
  }
  // Manila calendar days → [fromIso, toIso) UTC instants (same resolver as the commission ledger).
  const bounds = resolveStoreCommissionPeriod("custom", fromDay, toDay);
  return {
    key,
    fromDay,
    toDay,
    fromIso: bounds.fromIso ?? `${fromDay}T00:00:00.000+08:00`,
    toIso: bounds.toIso ?? new Date(Date.parse(`${toDay}T00:00:00.000+08:00`) + 86_400_000).toISOString(),
  };
}
