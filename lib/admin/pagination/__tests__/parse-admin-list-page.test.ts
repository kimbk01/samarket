import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_LIST_MAX_OFFSET,
  adminListOffsetForPage,
  adminListPageCount,
  adminListRange,
  escapeAdminIlike,
  parseAdminListPage,
  quotePostgrestOrValue,
  sanitizeAdminListSearch,
} from "@/lib/admin/pagination/parse-admin-list-page";
import { parsePointChargeStatusFilter } from "@/lib/points/admin-point-charge-list-query";

const sp = (q: string) => new URLSearchParams(q);

describe("parseAdminListPage", () => {
  it("defaults to limit 50 / offset 0 when params are absent", () => {
    expect(parseAdminListPage(sp(""))).toEqual({ limit: 50, offset: 0 });
  });
  it("clamps limit to 1..200 and ignores junk", () => {
    expect(parseAdminListPage(sp("limit=500"))).toEqual({ limit: 200, offset: 0 });
    expect(parseAdminListPage(sp("limit=0"))).toEqual({ limit: 50, offset: 0 });
    expect(parseAdminListPage(sp("limit=-3"))).toEqual({ limit: 50, offset: 0 });
    expect(parseAdminListPage(sp("limit=abc&offset=1.5"))).toEqual({ limit: 50, offset: 0 });
    expect(parseAdminListPage(sp("limit=25&offset=75"))).toEqual({ limit: 25, offset: 75 });
  });
  it("clamps offset and honours custom defaults", () => {
    expect(parseAdminListPage(sp("offset=-10")).offset).toBe(0);
    expect(parseAdminListPage(sp("offset=999999999")).offset).toBe(ADMIN_LIST_MAX_OFFSET);
    expect(parseAdminListPage(sp(""), { defaultLimit: 100, maxLimit: 80 })).toEqual({ limit: 80, offset: 0 });
    expect(parseAdminListPage({ limit: "10", offset: "20" })).toEqual({ limit: 10, offset: 20 });
  });
  it("range / page helpers", () => {
    expect(adminListRange({ limit: 50, offset: 100 })).toEqual([100, 149]);
    expect(adminListOffsetForPage(3, 50)).toBe(100);
    expect(adminListOffsetForPage(0, 50)).toBe(0);
    expect(adminListPageCount(0, 50)).toBe(1);
    expect(adminListPageCount(101, 50)).toBe(3);
  });
  it("search sanitising + ilike escaping", () => {
    expect(sanitizeAdminListSearch("  a,(b)*  c\"\\ ")).toBe("a b c");
    expect(sanitizeAdminListSearch(null)).toBe("");
    expect(sanitizeAdminListSearch("x".repeat(80))).toHaveLength(60);
    expect(escapeAdminIlike("50%_off")).toBe("50\\%\\_off");
    expect(quotePostgrestOrValue("%a\\_b%")).toBe('"%a\\\\_b%"');
  });
});

describe("parsePointChargeStatusFilter", () => {
  it("all / empty / junk → null (no filter)", () => {
    expect(parsePointChargeStatusFilter(null)).toBeNull();
    expect(parsePointChargeStatusFilter("all")).toBeNull();
    expect(parsePointChargeStatusFilter("bogus")).toBeNull();
  });
  it("whitelists single and comma lists; open = actionable trio", () => {
    expect(parsePointChargeStatusFilter("approved")).toEqual(["approved"]);
    expect(parsePointChargeStatusFilter("pending, waiting_confirm,x")).toEqual(["pending", "waiting_confirm"]);
    expect(parsePointChargeStatusFilter("open")).toEqual(["pending", "waiting_confirm", "on_hold"]);
    expect(parsePointChargeStatusFilter("OPEN,on_hold")).toEqual(["pending", "waiting_confirm", "on_hold"]);
  });
});

describe("GET /api/admin/point-charges contract", () => {
  // 본문은 공용 처리로 이동 (라우트는 권한 키 `point` 확인 후 위임)
  const route = readFileSync(join(process.cwd(), "lib/admin/shared-handlers/admin-point-charges-list.ts"), "utf8");
  it("pages server-side with exact count — no hard 300-row cap", () => {
    expect(route).not.toContain(".limit(300)");
    expect(route).toContain('{ count: "exact" }');
    expect(route).toContain(".range(from, to)");
    expect(route).toContain("parseAdminListPage(sp)");
    expect(route).toContain("parsePointChargeStatusFilter(");
    expect(route).toMatch(/requests,\s*total:/);
  });
  it("nickname search resolves profile ids first (escaped ilike)", () => {
    expect(route).toContain('.ilike("nickname", `%${escapeAdminIlike(search)}%`)');
    expect(route).toContain("user_id.in.(");
  });
  it("count-only callers use the server total, not a truncated client filter", () => {
    const ops = readFileSync(join(process.cwd(), "components/admin/finance/AdminFinanceOpsQueue.tsx"), "utf8");
    expect(ops).toContain("/api/admin/point-charges?status=open&limit=1");
    expect(ops).toContain("json.total");
  });
});
