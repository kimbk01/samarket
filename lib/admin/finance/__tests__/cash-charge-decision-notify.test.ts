/**
 * R8-h (재감사 2026-11-03) — Cash 충전 같은 결정 재처리(idempotent) 시 사장님 알림 재발송 금지.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shouldNotifyOwnerOnCashChargeDecision } from "@/lib/admin/finance/cash-charge-decision-notify";

describe("shouldNotifyOwnerOnCashChargeDecision", () => {
  it("첫 처리만 알림 · idempotent 재처리는 알림 없음", () => {
    expect(shouldNotifyOwnerOnCashChargeDecision({ idempotent: false, hasNotifyTarget: true })).toBe(true);
    expect(shouldNotifyOwnerOnCashChargeDecision({ idempotent: true, hasNotifyTarget: true })).toBe(false);
    expect(shouldNotifyOwnerOnCashChargeDecision({ idempotent: false, hasNotifyTarget: false })).toBe(false);
  });

  it("승인·반려 두 경로 모두 이 판정을 거쳐 알림을 보낸다", () => {
    const src = readFileSync(path.join(process.cwd(), "app/api/admin/business-cash-charges/route.ts"), "utf8");
    const guards = src.match(/shouldNotifyOwnerOnCashChargeDecision\(\{ idempotent: result\.idempotent/g) ?? [];
    expect(guards).toHaveLength(2);
    expect(src).not.toMatch(/if \(notify\) \{\s*await safeNotifyOwnerBusinessCashCharge/);
  });
});
