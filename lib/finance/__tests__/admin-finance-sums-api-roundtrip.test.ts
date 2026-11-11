/**
 * 실기 A-1·A-5 FAIL (2026-11-04) 재발 방지 — 실제 API 처리 함수가 낸 응답을 화면 읽기 함수에 그대로 넣어 칸 값까지 본다.
 * 원인: 서버가 DB 이름(entry_kind·due_minor)을 화면용 이름(entryKind·dueMinor)으로 바꿔 보내는데, 화면이 같은 값을
 * DB 이름으로 다시 읽어 종류가 하나로 뭉치고(A-1·Coin 전환) 금액이 0(A-5)이 됐다. 단위 테스트는 DB 모양만 넣어 봐서 못 잡았다.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  adFundingSumCells,
  conversionSumCells,
  outstandingSumCells,
  readAdFundingSums,
  readOutstandingSums,
  readUnifiedTxSums,
  unifiedTxSumCells,
} from "@/lib/finance/admin-finance-period-sums";

const requireAdminPermission = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));

/** 목록 조회는 빈 결과 · RPC 는 이름별 DB 모양 결과 */
function fakeSb(rpcData: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "eq", "in", "order", "range", "limit", "gte", "lt", "or"]) chain[m] = vi.fn(self);
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(async (name: string) => ({ data: rpcData[name] ?? null, error: null })),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("API 응답 → 화면 읽기 → 칸 (서버·화면 이름 계약)", () => {
  it("A-1 통합 거래 · Coin 전환 — 종류별 칸이 갈라지고 전환 Coin·Cash 가 0 이 아니다", async () => {
    requireAdminPermission.mockResolvedValue({
      ok: true,
      sb: fakeSb({
        admin_finance_unified_tx_page: {
          total: 0,
          rows: [],
          sums_by_kind: [
            { wallet: "CASH", entry_kind: "TOP_UP", direction: "credit", count: 5, amount: 542200, coin_out: 0 },
            { wallet: "CASH", entry_kind: "AD_SPEND", direction: "debit", count: 2, amount: 1000000, coin_out: 0 },
            { wallet: "CASH", entry_kind: "CONVERT_FROM_STORE_POINTS", direction: "credit", count: 6, amount: 21300, coin_out: 213 },
          ],
        },
      }),
    });
    const { GET } = await import("@/app/api/admin/finance/transactions/route");
    const json = await (await GET(new NextRequest("https://x.test/api/admin/finance/transactions?wallet=CASH"))).json();
    const sums = readUnifiedTxSums(json.sumsByKind);
    expect(sums).not.toBeNull();
    const cells = unifiedTxSumCells(sums!, true);
    expect(cells.map((c) => c.key)).toEqual(["CASH:AD_SPEND", "CASH:CONVERT_FROM_STORE_POINTS", "CASH:TOP_UP"]);
    expect(cells.find((c) => c.key === "CASH:TOP_UP")?.amount).toBe("+₱5,422.00");
    const conv = conversionSumCells(sums!, true);
    expect(conv.map((c) => [c.key, c.count])).toEqual([
      ["coin_out", 6],
      ["cash_in", 6],
    ]);
    expect(conv[1].amount).toBe("₱213.00");
    expect(conv[0].amount).toContain("213");
  });

  it("A-5 미납 — Fee Due·Cash Paid·Remaining 금액이 그대로", async () => {
    requireAdminPermission.mockResolvedValue({
      ok: true,
      sb: fakeSb({
        admin_finance_outstanding_sums: { count: 2, due_minor: 16800, paid_minor: 9500, outstanding_minor: 7300, by_status: [] },
      }),
    });
    const { GET } = await import("@/app/api/admin/finance/outstanding/route");
    const json = await (await GET(new NextRequest("https://x.test/api/admin/finance/outstanding"))).json();
    const s = readOutstandingSums(json.sums);
    expect(outstandingSumCells(s!, true).map((c) => [c.label, c.amount])).toEqual([
      ["Fee Due", "₱168.00"],
      ["Cash Paid", "₱95.00"],
      ["Remaining", "₱73.00"],
    ]);
  });

  it("A-4 광고 지출 — 출처·상태 칸", async () => {
    requireAdminPermission.mockResolvedValue({
      ok: true,
      sb: fakeSb({
        admin_finance_ad_funding_page: {
          total: 0,
          rows: [],
          sums_by_source: [{ source: "delivery_ad_canonical_bc_fundings", status: "SECURED", count: 16, amount: 1679000 }],
        },
      }),
    });
    const { GET } = await import("@/app/api/admin/finance/ad-funding-traces/route");
    const json = await (await GET(new NextRequest("https://x.test/api/admin/finance/ad-funding-traces"))).json();
    const cells = adFundingSumCells(readAdFundingSums(json.sumsBySource)!, true);
    expect(cells[0]).toMatchObject({ amount: "₱16,790.00", count: 16 });
  });

  it("화면 읽기는 DB 이름 모양을 받지 않는다 (이중 변환 금지)", () => {
    expect(readUnifiedTxSums([{ wallet: "CASH", entry_kind: "TOP_UP", direction: "credit", count: 1, amount: 100 }])).toBeNull();
    expect(readOutstandingSums({ count: 1, due_minor: 100, paid_minor: 0, outstanding_minor: 100 })).toBeNull();
  });

  it("화면 4곳은 화면 읽기 함수만 쓴다 (서버 전용 DB 변환 함수 import 금지)", () => {
    for (const f of [
      "components/finance/AdminFinanceTransactionsView.tsx",
      "components/finance/AdminFinanceConversionsView.tsx",
      "components/finance/AdminFinanceOutstandingView.tsx",
      "components/finance/AdminFinanceAdsView.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/read(UnifiedTx|Outstanding|AdFunding)Sums\(/);
      expect(src, f).not.toMatch(/FromRpc/);
    }
  });
});
