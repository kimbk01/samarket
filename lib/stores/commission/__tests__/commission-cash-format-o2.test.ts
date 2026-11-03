import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatCashPhp2 } from "@/lib/currency/currency-display-contract";
import { formatCashMinorSigned } from "@/lib/stores/commission/store-commission-contract";

/** 실기 FAIL O-2 (2026-11-03): 수수료·캐시 내역 Cash 합계 DB ₱22.50 → 화면 「₱23」 (정수 반올림). */
describe("수수료·캐시 내역 Cash 금액 = 소수점 2자리 (통화 계약 §3)", () => {
  it("2,250 센타보 → ₱22.50 · 음수 부호 유지", () => {
    expect(formatCashMinorSigned(2250, formatCashPhp2)).toBe("₱22.50");
    expect(formatCashMinorSigned(-1150, formatCashPhp2)).toBe("-₱11.50");
    expect(formatCashMinorSigned(840000, formatCashPhp2)).toBe("₱8,400.00");
  });

  it("공용 부품의 Cash 표시는 정수 반올림(formatMoneyPhp)을 쓰지 않는다", () => {
    const parts = readFileSync(resolve(process.cwd(), "components/stores/commission/StoreCommissionLedgerParts.tsx"), "utf8");
    expect(parts).toContain("formatCashMinorSigned(minor, (php) => formatCashPhp2(php))");
    const table = readFileSync(resolve(process.cwd(), "components/stores/commission/StoreCommissionLedgerTable.tsx"), "utf8");
    expect(table).toContain("formatCashPhp2(b.percentFeePhp)");
    expect(table).toContain("formatCashPhp2(b.fixedFeePhp)");
    expect(table).toContain("formatCashPhp2(b.deliveryIncomePhp)");
  });
});

describe("같은 원인 2곳 — 관리자 주문 돈 흐름·사업자 패널 Cash 수수료 (Owner 「2곳도 수정」 2026-11-03)", () => {
  it("센타보 값을 Cash SSOT(소수점 2자리)로 표시, 정수 반올림 금지", () => {
    const chain = readFileSync(resolve(process.cwd(), "components/finance/OrderMoneyChainView.tsx"), "utf8");
    expect(chain).toContain("amount: chain.financial.feeDueMinor, isMinor: true");
    expect(chain).toContain("amount: chain.financial.cashFeePaidMinor, isMinor: true");
    expect(chain).toContain("amount: chain.financial.outstandingFeeMinor, isMinor: true");
    expect(chain).not.toContain("formatMoneyPhp(chain.financial.feeDue)");
    const panels = readFileSync(resolve(process.cwd(), "components/admin/business/AdminBusinessCcPanels.tsx"), "utf8");
    expect(panels).toContain('formatFinanceAmount({ wallet: "CASH", amount: s.feeDueMinor, isMinor: true })');
    expect(panels).not.toContain("formatMoneyPhp(s.feeDueMinor / 100)");
  });
});
