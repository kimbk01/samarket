/**
 * finance-ssot-19 → P0 DB-1 — creditUserPoints 는 원자 RPC `credit_user_points` 한 번만 호출한다.
 * 같은 환원·환급 키 재요청은 RPC 가 (중복 확인 또는 point_ledger_refund_release_once_uidx 위반 처리로)
 * duplicate 를 돌려준다 → ok:true duplicate:true (다시 지급하지 않음).
 * DB 동작 자체는 scripts/qa/finance-p0-local-pg (DB1-12·DB1-13·CONC-02) 에서 검증한다.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX,
  creditUserPoints,
  isPointLedgerRefundReleaseOnceViolation,
} from "@/lib/points/user-point-ledger";

function mockSb(result: { data: unknown; error: { message: string } | null }) {
  const sb = {
    rpc: vi.fn(async () => result),
    from: vi.fn(() => {
      throw new Error("creditUserPoints must not touch tables directly");
    }),
  } as unknown as SupabaseClient;
  return sb;
}

const input = {
  userId: "u1",
  amount: 100,
  entryType: "ad_refund" as const,
  relatedType: "feed_ad_request" as const,
  relatedId: "req-1",
  description: "refund",
  actorType: "system" as const,
};

describe("creditUserPoints refund/release once (atomic RPC)", () => {
  it("RPC duplicate → ok:true duplicate, no ledgerId", async () => {
    const sb = mockSb({ data: { ok: true, duplicate: true, balance_after: 1000 }, error: null });
    const r = await creditUserPoints(sb, input);
    expect(r).toEqual({ ok: true, duplicate: true, balanceAfter: 1000, ledgerId: undefined });
    expect((sb as unknown as { rpc: { mock: { calls: unknown[][] } } }).rpc.mock.calls[0][0]).toBe("credit_user_points");
  });

  it("successful credit → ledgerId, no duplicate flag", async () => {
    const r = await creditUserPoints(
      mockSb({ data: { ok: true, duplicate: false, ledger_id: "led-1", balance_after: 1100 }, error: null }),
      input
    );
    expect(r).toEqual({ ok: true, balanceAfter: 1100, ledgerId: "led-1" });
  });

  it("RPC transport error → ok:false (never a fake success)", async () => {
    const r = await creditUserPoints(mockSb({ data: null, error: { message: "boom" } }), input);
    expect(r).toEqual({ ok: false, error: "boom" });
  });

  it("RPC refusal (e.g. invalid_entry_type) → ok:false with the code", async () => {
    const r = await creditUserPoints(
      mockSb({ data: { ok: false, error: "invalid_entry_type" }, error: null }),
      input
    );
    expect(r).toMatchObject({ ok: false, error: "invalid_entry_type" });
  });

  it("predicate is exact to the index name and code", () => {
    expect(isPointLedgerRefundReleaseOnceViolation(null)).toBe(false);
    expect(isPointLedgerRefundReleaseOnceViolation({ code: "23505", message: "other_uidx" })).toBe(false);
    expect(
      isPointLedgerRefundReleaseOnceViolation({ code: "23505", message: POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX })
    ).toBe(true);
  });
});
