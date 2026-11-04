/**
 * 재감사 P-7 — 쪽 경계에 걸린 같은 시각 묶음이 고정 여유(8줄)보다 길어도 순서가 맞는지.
 * 운영 최대 같은 시각 줄 수(2026-11-04 SELECT): Cash 3 · Coin 1 · 포인트 2 — 지금은 드러나지 않는 잠재 결함.
 */
import { describe, expect, it, vi } from "vitest";
import { orderLedgerChainDesc, sliceLedgerChainPage, type LedgerChainView } from "@/lib/finance/ledger-chain-order";

type Row = { id: string; createdAt: string; signed: number; balanceAfter: number };
const view = (r: Row): LedgerChainView => r;

/** 오래된 → 최신 순으로 잔액 사슬을 만들고, DB 정렬(created_at DESC, id DESC — id 는 사슬과 무관한 무작위)로 돌려준다. */
function ledger(spec: Array<{ at: string; n: number }>): { dbOrder: Row[]; truth: Row[] } {
  const asc: Row[] = [];
  let bal = 0;
  let k = 0;
  for (const g of spec) {
    for (let i = 0; i < g.n; i += 1) {
      bal += 10;
      // id 는 사슬 순서와 반대로 — DB 정렬만으로는 순서가 틀리게
      asc.push({ id: `id-${String(999 - k).padStart(3, "0")}`, createdAt: g.at, signed: 10, balanceAfter: bal });
      k += 1;
    }
  }
  const truth = [...asc].reverse();
  const dbOrder = [...asc].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1
  );
  return { dbOrder, truth };
}

async function page(db: Row[], offset: number, limit: number, margin: number) {
  const start = Math.max(0, offset - margin);
  const end = offset + limit - 1 + margin;
  const windowRows = db.slice(start, end + 1);
  const loadGroup = vi.fn(async (at: string) => ({
    rows: db.filter((r) => r.createdAt === at),
    newerCount: db.filter((r) => r.createdAt > at).length,
  }));
  const rows = await sliceLedgerChainPage({
    windowRows,
    windowStart: start,
    windowFull: windowRows.length === end - start + 1,
    offset,
    limit,
    view,
    loadGroup,
  });
  return { rows, loadGroup };
}

describe("P-7 쪽 경계 같은 시각 묶음", () => {
  it("묶음이 창 안에서 끝나면 추가 조회 없이 예전과 같은 결과", async () => {
    const { dbOrder, truth } = ledger([
      { at: "2026-11-01T00:00:01Z", n: 5 },
      { at: "2026-11-01T00:00:02Z", n: 3 },
      { at: "2026-11-01T00:00:03Z", n: 5 },
    ]);
    const { rows, loadGroup } = await page(dbOrder, 5, 5, 8);
    expect(rows!.map((r) => r.id)).toEqual(truth.slice(5, 10).map((r) => r.id));
    expect(loadGroup).not.toHaveBeenCalled();
  });

  it("같은 시각 30줄이 두 쪽에 걸쳐도(여유 8 초과) 각 쪽 = 사슬 순서 그대로 · 겹침·누락 없음", async () => {
    const { dbOrder, truth } = ledger([
      { at: "2026-11-01T00:00:01Z", n: 4 },
      { at: "2026-11-01T00:00:02Z", n: 30 },
      { at: "2026-11-01T00:00:03Z", n: 4 },
    ]);
    const all: string[] = [];
    for (let off = 0; off < dbOrder.length; off += 10) {
      const { rows } = await page(dbOrder, off, 10, 8);
      all.push(...rows!.map((r) => r.id));
    }
    expect(all).toEqual(truth.map((r) => r.id));
    // 비교: 고정 여유만 쓰던 방식은 이 경우 틀린다(결함 재현)
    const windowOnly = orderLedgerChainDesc(dbOrder.slice(12, 30), view).slice(8, 18).map((r) => r.id);
    expect(windowOnly).not.toEqual(truth.slice(20, 30).map((r) => r.id));
  });

  it("묶음 조회가 실패하면 null(화면은 오류) — 틀린 순서를 보여 주지 않는다", async () => {
    const { dbOrder } = ledger([{ at: "2026-11-01T00:00:02Z", n: 30 }]);
    const rows = await sliceLedgerChainPage({
      windowRows: dbOrder.slice(2, 22),
      windowStart: 2,
      windowFull: true,
      offset: 10,
      limit: 10,
      view,
      loadGroup: async () => null,
    });
    expect(rows).toBeNull();
  });
});
