import { describe, expect, it } from "vitest";
import {
  ADMIN_LIST_QUERY_MAX_PAGE,
  adminListQueryHref,
  adminListQueryToApiParams,
  applyAdminListQueryPatch,
  defaultAdminListQuery,
  isAdminListDateString,
  normalizeAdminListPageSize,
  normalizeAdminListSearch,
  parseAdminListQuery,
  writeAdminListQuery,
  type AdminListQueryConfig,
} from "@/lib/admin/list-query/admin-list-query";

const CFG: AdminListQueryConfig<"domain"> = {
  statuses: ["pending", "completed", "failed"],
  sorts: ["newest", "oldest"],
  defaults: { sort: "newest" },
  extras: ["domain"],
};

describe("parseAdminListQuery", () => {
  it("빈 주소 = 기본값 (page 1 · size 20)", () => {
    expect(parseAdminListQuery(new URLSearchParams(""), CFG)).toEqual({
      page: 1,
      size: 20,
      status: "",
      q: "",
      from: "",
      to: "",
      sort: "newest",
      extras: { domain: "" },
    });
  });

  it("정상 값을 그대로 읽는다", () => {
    const s = parseAdminListQuery(
      new URLSearchParams("page=3&size=50&status=pending&q=%20hello%20%20world%20&from=2026-10-01&to=2026-10-20&sort=oldest&domain=trade&tab=x"),
      CFG
    );
    expect(s).toEqual({
      page: 3,
      size: 50,
      status: "pending",
      q: "hello world",
      from: "2026-10-01",
      to: "2026-10-20",
      sort: "oldest",
      extras: { domain: "trade" },
    });
  });

  it("잘못된 값은 기본값으로", () => {
    const s = parseAdminListQuery(
      new URLSearchParams("page=-2&size=30&status=bogus&sort=weird&from=2026-02-30&to=20261001"),
      CFG
    );
    expect(s.page).toBe(1);
    expect(s.size).toBe(20);
    expect(s.status).toBe("");
    expect(s.sort).toBe("newest");
    expect(s.from).toBe("");
    expect(s.to).toBe("");
  });

  it("page 는 정수만, 상한 고정", () => {
    expect(parseAdminListQuery({ page: "2.5" }).page).toBe(1);
    expect(parseAdminListQuery({ page: "abc" }).page).toBe(1);
    expect(parseAdminListQuery({ page: "999999" }).page).toBe(ADMIN_LIST_QUERY_MAX_PAGE);
  });

  it("from > to 이면 서로 바꾼다", () => {
    const s = parseAdminListQuery({ from: "2026-10-20", to: "2026-10-01" });
    expect([s.from, s.to]).toEqual(["2026-10-01", "2026-10-20"]);
  });

  it("레코드(Next searchParams) 입력 · 배열은 첫 값", () => {
    const s = parseAdminListQuery({ status: ["completed", "failed"], q: undefined }, CFG);
    expect(s.status).toBe("completed");
    expect(s.q).toBe("");
  });

  it("기본 상태가 있는 화면에서 `status=` 는 「전체」", () => {
    const cfg = { defaults: { status: "pending" } };
    expect(parseAdminListQuery(new URLSearchParams(""), cfg).status).toBe("pending");
    expect(parseAdminListQuery(new URLSearchParams("status="), cfg).status).toBe("");
  });

  it("예약 키를 extras 로 쓰면 오류", () => {
    expect(() => parseAdminListQuery({}, { extras: ["page"] as never })).toThrow(/reserved/);
  });
});

describe("writeAdminListQuery / href", () => {
  it("기본값은 생략하고 관리하지 않는 키(tab)는 유지", () => {
    const state = { ...defaultAdminListQuery(CFG), status: "pending", page: 2 };
    const out = writeAdminListQuery("tab=queue&page=9&q=old", state, CFG);
    expect(out.toString()).toBe("tab=queue&status=pending&page=2");
  });

  it("왕복: parse(write(state)) === state", () => {
    const state = {
      page: 4,
      size: 100 as const,
      status: "failed",
      q: "a b",
      from: "2026-01-01",
      to: "2026-01-31",
      sort: "oldest",
      extras: { domain: "community" },
    };
    const qs = writeAdminListQuery("", state, CFG);
    expect(parseAdminListQuery(qs, CFG)).toEqual(state);
  });

  it("기본 상태가 있는 화면의 「전체」는 `status=` 로 남는다", () => {
    const cfg = { defaults: { status: "pending" } };
    const state = { ...defaultAdminListQuery(cfg), status: "" };
    const qs = writeAdminListQuery("", state, cfg);
    expect(qs.toString()).toBe("status=");
    expect(parseAdminListQuery(qs, cfg).status).toBe("");
  });

  it("href — 쿼리가 비면 경로만", () => {
    expect(adminListQueryHref("/admin/x", "", defaultAdminListQuery(), {})).toBe("/admin/x");
    expect(adminListQueryHref("/admin/x", "", { ...defaultAdminListQuery(), size: 50 }, {})).toBe("/admin/x?size=50");
  });
});

describe("applyAdminListQueryPatch", () => {
  const base = { ...defaultAdminListQuery(CFG), page: 5 };

  it("즉시 필드(상태·정렬·크기·추가 키) 변경 → 1쪽", () => {
    expect(applyAdminListQueryPatch(base, { status: "pending" }).page).toBe(1);
    expect(applyAdminListQueryPatch(base, { sort: "oldest" }).page).toBe(1);
    expect(applyAdminListQueryPatch(base, { size: 50 }).page).toBe(1);
    expect(applyAdminListQueryPatch(base, { extras: { domain: "trade" } }).page).toBe(1);
  });

  it("page 만 바꾸면 그대로", () => {
    expect(applyAdminListQueryPatch(base, { page: 7 }).page).toBe(7);
  });

  it("검색 적용 시 정리 + 1쪽", () => {
    const next = applyAdminListQueryPatch(base, { q: "  x   y ", from: "2026-10-09", to: "2026-10-01" });
    expect(next).toMatchObject({ q: "x y", from: "2026-10-01", to: "2026-10-09", page: 1 });
  });
});

describe("adminListQueryToApiParams", () => {
  it("limit/offset + 비어 있지 않은 필터만", () => {
    const state = { ...defaultAdminListQuery(CFG), page: 3, size: 50 as const, status: "pending", extras: { domain: "trade" } };
    expect(adminListQueryToApiParams(state, CFG).toString()).toBe(
      "limit=50&offset=100&status=pending&sort=newest&domain=trade"
    );
  });
});

describe("helpers", () => {
  it("날짜 검증", () => {
    expect(isAdminListDateString("2028-02-29")).toBe(true);
    expect(isAdminListDateString("2026-02-29")).toBe(false);
    expect(isAdminListDateString("2026-13-01")).toBe(false);
    expect(isAdminListDateString("2026-1-01")).toBe(false);
  });

  it("검색어 100자 제한", () => {
    expect(normalizeAdminListSearch("a".repeat(150))).toHaveLength(100);
  });

  it("페이지 크기 20/50/100 만", () => {
    expect(normalizeAdminListPageSize(50)).toBe(50);
    expect(normalizeAdminListPageSize("100")).toBe(100);
    expect(normalizeAdminListPageSize(10)).toBe(20);
    expect(normalizeAdminListPageSize(undefined)).toBe(20);
  });
});
