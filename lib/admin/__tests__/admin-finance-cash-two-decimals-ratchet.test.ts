/**
 * R7 (재감사 2026-11-03) ratchet — 관리자 재무 화면의 Cash 금액은 소수점 2자리 고정
 * (`formatFinanceAmount({ wallet: "CASH" … })` / `formatCashPhp2`). `formatAdminPhp`(소수 0~2자리 → 「₱22.5」)·
 * `formatAdminPhpMinor`·`formatMoneyPhp`(정수 반올림)로 Cash·수수료·미납·잔액 값을 그리면 실패한다.
 * Point·Coin 은 정수 그대로. 판매(gross)·상품 소계·지급 의무(payable) 같은 비-Cash 페소 값은 허용.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatOrderMoneyChainEventAmount } from "@/components/finance/OrderMoneyChainView";

const ROOT = process.cwd();

const CASH_SCREENS = [
  "components/finance/OrderMoneyChainView.tsx",
  "components/finance/AdminFinanceStoreViews.tsx",
  "components/finance/AdminFinanceOutstandingView.tsx",
  "components/admin/finance/AdminFinanceControlPlane.tsx",
  "components/admin/finance/AdminStoreFinancePanels.tsx",
] as const;

/** Cash 성격 값 이름 — 이 이름이 인자에 들어가면 PHP 포맷터 금지. */
const CASH_ARG = /fee|cash|outstanding|minor|balance|topup|top_up|charge|due\b|paid|settlementFee|obligation/i;

function callArgs(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1);
}

function violations(rel: string): string[] {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  const out: string[] = [];
  if (/\bformatAdminPhpMinor\s*\(/.test(src)) out.push(`${rel}: formatAdminPhpMinor (Cash centavo → 2자리 아님)`);
  const re = /\b(formatAdminPhp|formatMoneyPhp|formatPrice)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const args = callArgs(src, m.index + m[0].length - 1);
    if (CASH_ARG.test(args)) out.push(`${rel}: ${m[1]}(${args.trim()})`);
  }
  return out;
}

describe("R7 — 관리자 재무 Cash 2자리 ratchet", () => {
  it("Cash·수수료·미납·잔액을 formatAdminPhp*/formatMoneyPhp 로 그리지 않는다", () => {
    const all = CASH_SCREENS.flatMap(violations);
    expect(all).toEqual([]);
  });

  it("주문 돈 흐름 타임라인 줄: Cash = 센타보 2자리, Coin = 정수, 판매 줄 = 페소", () => {
    expect(formatOrderMoneyChainEventAmount({ wallet: "CASH", amount: 23, amountMinor: 2250 })).toBe("₱22.50");
    expect(formatOrderMoneyChainEventAmount({ wallet: "CASH", amount: 1234.5, amountMinor: null })).toBe("₱1,234.50");
    expect(formatOrderMoneyChainEventAmount({ wallet: "CASH", amount: null, amountMinor: null })).toBe("—");
    expect(formatOrderMoneyChainEventAmount({ wallet: "COIN", amount: 120, amountMinor: null })).toContain("120");
    expect(formatOrderMoneyChainEventAmount({ wallet: "COIN", amount: 120, amountMinor: null })).not.toContain(".");
    expect(formatOrderMoneyChainEventAmount({ wallet: "SETTLEMENT", amount: 500, amountMinor: null })).toBe("₱500");
  });

  it("주문 돈 흐름 시각은 UTC 원문이 아니라 PHT 관리자 포맷", () => {
    const src = readFileSync(path.join(ROOT, "components/finance/OrderMoneyChainView.tsx"), "utf8");
    expect(src).not.toMatch(/\{ev\.at\}/);
    expect(src).toMatch(/formatAdminManilaDateTime\(ev\.at\)/);
  });

  it("미납 목록: 중복 열(Outstanding Created/Collected) 없음", () => {
    const src = readFileSync(path.join(ROOT, "components/finance/AdminFinanceOutstandingView.tsx"), "utf8");
    expect(src).not.toMatch(/Outstanding Created/);
    expect(src).not.toMatch(/Outstanding Collected/);
    // 남은 열의 회계 용어는 유지
    expect(src).toMatch(/Fee Due/);
    expect(src).toMatch(/Cash Paid/);
    expect(src).toMatch(/Remaining/);
  });
});
