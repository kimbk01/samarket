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

describe("G-07 · G-08 (감사 2026-10-30) — 중앙 고객지원 이의신청·커뮤니티 범위·매장 문의 보기", () => {
  it("범위 없는 ?type=appeal = 전 도메인 이의신청 (커뮤니티 ∪ 거래) · 도메인 화면 범위는 그대로", async () => {
    const { listSupportCasesForAdmin } = await import("@/lib/support/support-case-service");
    const f = await import("@/lib/support/support-community-filter");
    const run = async (scope: "trade" | "community" | null) => {
      const { ops, sb } = fakeSb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await listSupportCasesForAdmin(sb as any, { filter: "ALL", scope, kind: "appeal" } as any);
      return ops.filter(([m]) => m === "or").map(([, a]) => String(a[0]));
    };
    expect(await run(null)).toEqual([f.supportAllDomainAppealOrFilter()]);
    expect(f.supportAllDomainAppealOrFilter()).toBe(`${f.supportAppealOrFilter()},${f.supportTradeAppealOrFilter()}`);
    expect(await run("community")).toContain(f.supportAppealOrFilter());
    expect(await run("community")).not.toContain(f.supportAllDomainAppealOrFilter());
    expect(await run("trade")).toContain(f.supportTradeAppealOrFilter());
  });

  it("API group=COMMUNITY → 커뮤니티 범위 (카테고리 그룹 아님)", async () => {
    const { parseSupportCaseScope } = await import("@/lib/support/support-community-filter");
    const { getSupportCategoryGroup } = await import("@/lib/support/support-category-groups");
    expect(parseSupportCaseScope("COMMUNITY")).toBe("community");
    expect(getSupportCategoryGroup("COMMUNITY")).toBeNull();
    expect(parseSupportCaseScope("TRADE")).toBe("trade");
  });

  it("중앙 화면: 커뮤니티 분야 · 이의신청만 · 매장 문의 조회 전용 보기 (기존 API · 원장 분리)", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("components/admin/support/AdminSupportPage.tsx", "utf8");
    expect(page).toContain('{ id: "COMMUNITY", label: ko ? "커뮤니티" : "Community" }');
    expect(page).toContain('if (appealOnly) qs.set("type", "appeal");');
    expect(page).toContain("<AdminSupportStoreInquiriesPanel ko={ko} />");
    const panel = readFileSync("components/admin/support/AdminSupportStoreInquiriesPanel.tsx", "utf8");
    expect(panel).toContain("/api/admin/store-inquiries?");
    expect(panel).not.toMatch(/method:\s*["'](POST|PATCH|PUT|DELETE)/);
    expect(panel).not.toContain("/api/admin/support/cases");
    const { storeInquiryAdminHref } = await import("@/components/admin/support/AdminSupportStoreInquiriesPanel");
    expect(storeInquiryAdminHref("s-1")).toBe("/admin/store-inquiries?store_id=s-1");
  });
});
