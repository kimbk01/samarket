import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** 문의 목록 쿼리 호출 기록 (가짜 PostgREST 체인) */
function fakeSb() {
  const ops: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "in", "is", "lt", "or", "ilike", "range", "limit", "not", "neq", "gte"]) {
    q[m] = (...a: unknown[]) => {
      ops.push([m, a]);
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
  return { ops, sb: { from: () => q } };
}

describe("문의 목록 — 도메인 범위(?group=trade|community)와 카테고리 그룹 겹침 (재실측 F1)", () => {
  it("범위가 있으면 카테고리 그룹 category in(...) 을 걸지 않는다 — 범위 or 식만 (홍보 주문 = 계산 열)", async () => {
    const { listSupportCasesForAdmin } = await import("@/lib/support/support-case-service");
    const { ops, sb } = fakeSb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listSupportCasesForAdmin(sb as any, { filter: "ALL", group: "TRADE", scope: "trade" } as any);
    expect(ops.some(([m, a]) => m === "in" && a[0] === "category")).toBe(false);
    const ors = ops.filter(([m]) => m === "or").map(([, a]) => String(a[0]));
    expect(ors.some((o) => o.includes("support_case_promotion_domain.eq.trade") && o.includes("category.eq.TRADE"))).toBe(true);
  });

  it("범위가 아닌 카테고리 그룹(예: AD)은 기존대로 category in(...)", async () => {
    const { listSupportCasesForAdmin } = await import("@/lib/support/support-case-service");
    const { ops, sb } = fakeSb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listSupportCasesForAdmin(sb as any, { filter: "ALL", group: "AD", scope: null } as any);
    expect(ops.some(([m, a]) => m === "in" && a[0] === "category")).toBe(true);
  });
});
