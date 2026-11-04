/**
 * Owner 권장안 (2026-11-04) — 거래 상세 「이전 잔액」「처리 주체」.
 * 예전 매장 패널(화면 연결 0 · 재감사 P-8 삭제)에만 있던 두 값을 지금 쓰는 거래 상세 화면이 보여 준다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { financeTxBalanceBefore } from "@/lib/finance/finance-tx-balance-before";

describe("거래 상세 이전 잔액 = 이후 잔액 − 증감", () => {
  it("Cash(센타보) 입금·출금", () => {
    expect(financeTxBalanceBefore({ wallet: "CASH", direction: "credit", amount: 1, amountMinor: 100, balanceAfter: null, balanceAfterMinor: 9400 })).toBe(9300);
    expect(financeTxBalanceBefore({ wallet: "CASH", direction: "debit", amount: 120, amountMinor: 12000, balanceAfter: null, balanceAfterMinor: 481800 })).toBe(493800);
  });
  it("Coin·Point 정수 · 이후 잔액이 없으면 null", () => {
    expect(financeTxBalanceBefore({ wallet: "COIN", direction: "debit", amount: 5, amountMinor: null, balanceAfter: 10, balanceAfterMinor: null })).toBe(15);
    expect(financeTxBalanceBefore({ wallet: "POINT", direction: "credit", amount: 500, amountMinor: null, balanceAfter: 1500, balanceAfterMinor: null })).toBe(1000);
    expect(financeTxBalanceBefore({ wallet: "COIN", direction: "credit", amount: 5, amountMinor: null, balanceAfter: null, balanceAfterMinor: null })).toBeNull();
  });
  it("상세 화면에 두 칸이 있다 (처리 주체 = 원장 actor · 없으면 시스템)", () => {
    const src = readFileSync(resolve(process.cwd(), "components/finance/FinanceTransactionDetail.tsx"), "utf8");
    expect(src).toContain('data-finance-tx-balance-before="1"');
    expect(src).toContain('data-finance-tx-actor="1"');
    expect(src).toContain("<AdminTechId id={tx.ownerId} />");
  });
});
