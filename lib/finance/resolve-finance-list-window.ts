/**
 * Resolve finance list window from query — server-side day boundary only.
 */
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { resolveStoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";

export function resolveFinanceListWindow(input: {
  date?: string | null;
  from?: string | null;
  to?: string | null;
}): { fromIso: string | null; toIso: string | null; day: string | null } {
  const date = String(input.date ?? "").trim().toLowerCase();
  if (date === "today") {
    const p = resolveStoreFinancialPeriod({ period: "today" });
    return { fromIso: p.fromIso, toIso: p.toIso, day: p.fromDay };
  }
  // 기간 입력 검사는 API 앞단(`invalidPeriodResponse` · D-12·D-16)이 한다 — 여기 오는 날짜는 둘 다 있거나 둘 다 없다.
  // 이전: 「시작일만」 = 그날 하루(정산·신청 화면은 그날 이후) · ISO 원문 통과 → 해석이 화면마다 달랐다.
  const fromDay = String(input.from ?? "").trim() || null;
  const toDay = String(input.to ?? "").trim() || null;
  if (!fromDay || !toDay) return { fromIso: null, toIso: null, day: null };
  // 경계 = PHT 날짜(정산·신청 화면과 같은 `resolveStoreCommissionPeriod`). 이전: UTC 날짜(`settlementPeriodDayToIso`)라
  // 화면의 「(PHT)」 표기와 8시간 어긋났다. DB 함수는 끝을 포함(`<= p_to`)하므로 다음 날 0시 직전(−1ms)으로 넘긴다.
  const { fromIso, toIso } = resolveStoreCommissionPeriod("custom", fromDay, toDay);
  return { fromIso, toIso: toIso ? new Date(Date.parse(toIso) - 1).toISOString() : null, day: null };
}
