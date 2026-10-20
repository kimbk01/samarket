import { describe, expect, it } from "vitest";
import {
  MYPAGE_LIST_PAGE_DEFAULT,
  MYPAGE_LIST_PAGE_MAX,
  compareKeysetDesc,
  encodeMypageListCursor,
  mypageKeysetOrFilter,
  paginateMypageRowsDesc,
  parseMypageListCursor,
  parseMypageListLimit,
  sliceMypageKeysetPage,
} from "@/lib/mypage/mypage-list-cursor";

describe("mypage list cursor (C.0.2 `ts|id`, 20/page, max 50)", () => {
  it("limit: 없음=null(옵트인), 기본 20, 최대 50, 최소 1", () => {
    expect(parseMypageListLimit(null)).toBeNull();
    expect(parseMypageListLimit("")).toBeNull();
    expect(parseMypageListLimit("abc")).toBe(MYPAGE_LIST_PAGE_DEFAULT);
    expect(parseMypageListLimit("20")).toBe(20);
    expect(parseMypageListLimit("999")).toBe(MYPAGE_LIST_PAGE_MAX);
    expect(parseMypageListLimit("0")).toBe(1);
  });

  it("encode/parse 왕복 — DB 원문 타임스탬프(마이크로초) 유지", () => {
    const c = encodeMypageListCursor("2026-10-20T01:02:03.123456+00:00", "a1b2-c3");
    expect(c).toBe("2026-10-20T01:02:03.123456+00:00|a1b2-c3");
    expect(parseMypageListCursor(c)).toEqual({ ts: "2026-10-20T01:02:03.123456+00:00", id: "a1b2-c3" });
  });

  it("잘못된 커서·주입 문자열은 null", () => {
    expect(parseMypageListCursor("nope")).toBeNull();
    expect(parseMypageListCursor("2026-10-20T00:00:00Z|")).toBeNull();
    expect(parseMypageListCursor('2026-10-20T00:00:00Z|x",id.gt.0')).toBeNull();
    expect(parseMypageListCursor("not-a-date|abc")).toBeNull();
  });

  it("keyset or 필터 — (ts,id) < (cursor.ts, cursor.id)", () => {
    expect(mypageKeysetOrFilter({ ts: "2026-10-20T00:00:00Z", id: "x1" }, "created_at")).toBe(
      'created_at.lt."2026-10-20T00:00:00Z",and(created_at.eq."2026-10-20T00:00:00Z",id.lt."x1")'
    );
  });

  it("slice: limit+1 읽으면 next_cursor = 마지막 반환 행", () => {
    const rows = [
      { ts: "2026-10-03T00:00:00Z", id: "c" },
      { ts: "2026-10-02T00:00:00Z", id: "b" },
      { ts: "2026-10-01T00:00:00Z", id: "a" },
    ];
    expect(sliceMypageKeysetPage(rows, 2, (r) => r.ts, (r) => r.id)).toEqual({
      items: rows.slice(0, 2),
      next_cursor: "2026-10-02T00:00:00Z|b",
    });
    expect(sliceMypageKeysetPage(rows, 3, (r) => r.ts, (r) => r.id).next_cursor).toBeNull();
  });

  it("paginate: 병합 정렬 후 커서 다음 — 페이지 합 = 전체(중복·누락 없음)", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      ts: `2026-10-0${(i % 3) + 1}T00:00:00Z`,
      id: `id${i}`,
    }));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: { items: typeof rows; next_cursor: string | null } = paginateMypageRowsDesc(
        rows,
        (r) => r.ts,
        (r) => r.id,
        parseMypageListCursor(cursor),
        3
      );
      seen.push(...page.items.map((r) => r.id));
      cursor = page.next_cursor;
      if (!cursor) break;
    }
    const expected = [...rows].sort((a, b) => compareKeysetDesc(a.ts, a.id, b.ts, b.id)).map((r) => r.id);
    expect(seen).toEqual(expected);
  });
});
