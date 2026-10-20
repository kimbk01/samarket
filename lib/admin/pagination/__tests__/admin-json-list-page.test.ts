import { describe, expect, it } from "vitest";
import {
  ADMIN_JSON_LIST_DEFAULT_LIMIT,
  parseAdminJsonListPage,
  sliceAdminJsonList,
  sortAdminJsonListByDateDesc,
  sortAdminJsonListNewestFirst,
} from "@/lib/admin/pagination/admin-json-list-page";

const sp = (q: string) => new URLSearchParams(q);

describe("parseAdminJsonListPage (R7 — limit 20/50/100 · offset)", () => {
  it.each([
    ["", 20],
    ["limit=20", 20],
    ["limit=50", 50],
    ["limit=100", 100],
    ["limit=30", 20],
    ["limit=200", 20],
    ["limit=0", 20],
    ["limit=-50", 20],
    ["limit=abc", 20],
  ])("%s → limit %d (그 외 값은 기본 20)", (q, limit) => {
    expect(parseAdminJsonListPage(sp(q)).limit).toBe(limit);
  });

  it("offset 은 0 이상 정수, 잘못된 값은 0, 상한 100,000", () => {
    expect(parseAdminJsonListPage(sp("offset=40")).offset).toBe(40);
    expect(parseAdminJsonListPage(sp("offset=-1")).offset).toBe(0);
    expect(parseAdminJsonListPage(sp("offset=1.5")).offset).toBe(0);
    expect(parseAdminJsonListPage(sp("offset=x")).offset).toBe(0);
    expect(parseAdminJsonListPage(sp("offset=999999999")).offset).toBe(100_000);
  });

  it("기본 크기 상수 = 20", () => {
    expect(ADMIN_JSON_LIST_DEFAULT_LIMIT).toBe(20);
  });
});

describe("sliceAdminJsonList — total = 전체 건수, 고정 상한 없음", () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ id: i }));

  it("250건 중 3쪽(50건) → 100..149, total 250", () => {
    const r = sliceAdminJsonList(rows, { limit: 50, offset: 100 });
    expect(r.total).toBe(250);
    expect(r.items.map((x) => x.id)).toEqual(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(r).toMatchObject({ limit: 50, offset: 100 });
  });

  it("마지막 쪽은 남은 만큼, 범위 밖은 빈 배열(total 유지)", () => {
    expect(sliceAdminJsonList(rows, { limit: 100, offset: 200 }).items).toHaveLength(50);
    const out = sliceAdminJsonList(rows, { limit: 20, offset: 300 });
    expect(out.items).toEqual([]);
    expect(out.total).toBe(250);
  });
});

describe("정렬 — 최신 먼저", () => {
  it("createdAt 내림차순, 원본 불변", () => {
    const src = [
      { id: "a", createdAt: "2026-10-01T00:00:00Z" },
      { id: "b", createdAt: "2026-10-03T00:00:00Z" },
      { id: "c", createdAt: "2026-10-02T00:00:00Z" },
    ];
    expect(sortAdminJsonListNewestFirst(src).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(src.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("임의 필드 · 잘못된 시각은 맨 뒤", () => {
    const src = [
      { id: "x", at: "bad" },
      { id: "y", at: "2026-01-01T00:00:00Z" },
      { id: "z", at: "2026-02-01T00:00:00Z" },
    ];
    expect(sortAdminJsonListByDateDesc(src, (r) => r.at).map((r) => r.id)).toEqual(["z", "y", "x"]);
  });
});
