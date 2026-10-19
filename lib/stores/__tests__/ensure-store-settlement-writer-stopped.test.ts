import { describe, expect, it, vi } from "vitest";

/** C-9 · DEF-4: 레거시 store_settlements 신규 행 생성 중단 — DB 를 건드리지 않는다. */
describe("ensureStoreSettlementForCompletedOrder — legacy writer stopped", () => {
  it("does not read or insert even for a completed order without a settlement row", async () => {
    const from = vi.fn(() => {
      throw new Error("must not query");
    });
    const { ensureStoreSettlementForCompletedOrder, ensureStoreSettlementForPaidOrder } = await import(
      "@/lib/stores/ensure-store-settlement"
    );
    await ensureStoreSettlementForCompletedOrder({ from } as never, "ord-1");
    await ensureStoreSettlementForPaidOrder({ from } as never, "ord-1");
    expect(from).not.toHaveBeenCalled();
  });
});
