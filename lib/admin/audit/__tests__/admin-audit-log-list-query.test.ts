import { describe, expect, it } from "vitest";
import {
  auditLogActorTypeCondition,
  parseAuditLogActorFilter,
  parseAuditLogListQuery,
} from "@/lib/admin/audit/admin-audit-log-list-query";
import { manilaDateRangeToUtc } from "@/lib/admin/metrics/manila-period";

const sp = (q: string) => new URLSearchParams(q);

describe("manilaDateRangeToUtc", () => {
  it("PHT 날짜(둘 다 포함) → UTC [from, to)", () => {
    expect(manilaDateRangeToUtc("2026-10-01", "2026-10-02")).toEqual({
      fromIso: "2026-09-30T16:00:00.000Z",
      toIso: "2026-10-02T16:00:00.000Z",
    });
  });
  it("뒤바뀐 기간은 바꾸고, 잘못된·빈 값은 경계 없음", () => {
    expect(manilaDateRangeToUtc("2026-10-02", "2026-10-01").fromIso).toBe("2026-09-30T16:00:00.000Z");
    expect(manilaDateRangeToUtc("2026-02-30", "")).toEqual({ fromIso: null, toIso: null });
    expect(manilaDateRangeToUtc(null, "2026-10-01")).toEqual({ fromIso: null, toIso: "2026-10-01T16:00:00.000Z" });
  });
});

describe("parseAuditLogListQuery", () => {
  it("기존 호출(limit 만) = legacy — 행위자 필터 없음, limit 1..300", () => {
    expect(parseAuditLogListQuery(sp("target_type=store_order&target_id=abc&limit=80"))).toEqual({
      mode: "legacy",
      limit: 80,
      targetType: "store_order",
      targetId: "abc",
    });
    expect(parseAuditLogListQuery(sp("limit=9999"))).toMatchObject({ mode: "legacy", limit: 300 });
    expect(parseAuditLogListQuery(sp(""))).toMatchObject({ mode: "legacy", limit: 150 });
  });

  it("목록 화면(offset/paged) — 기본 행위자 = human(자동 작업 제외), 20건", () => {
    const q = parseAuditLogListQuery(sp("paged=1"));
    expect(q).toMatchObject({ mode: "paged", actorFilter: "human", actor: null, actionContains: null });
    if (q.mode !== "paged") throw new Error();
    expect(q.page).toEqual({ limit: 20, offset: 0 });
  });

  it("필터 파싱 — limit 상한 100, 기간 PHT→UTC, 작업명(q), 행위자 UUID/닉네임", () => {
    const q = parseAuditLogListQuery(
      sp("limit=500&offset=40&actor_type=system&actor=홍길동&target_type=staff&q=revoke&from=2026-10-01&to=2026-10-01")
    );
    expect(q).toMatchObject({
      mode: "paged",
      page: { limit: 100, offset: 40 },
      actorFilter: "system",
      actor: { kind: "nickname", text: "홍길동" },
      targetType: "staff",
      actionContains: "revoke",
      fromIso: "2026-09-30T16:00:00.000Z",
      toIso: "2026-10-01T16:00:00.000Z",
    });
    const id = "6F1C2D3E-0000-4000-8000-000000000001";
    expect(parseAuditLogListQuery(sp(`offset=0&actor=${id}`))).toMatchObject({
      actor: { kind: "id", id: id.toLowerCase() },
    });
    // action 이 q 보다 우선, PostgREST or() 깨는 문자 제거
    expect(parseAuditLogListQuery(sp("offset=0&action=a,b(c)&q=x"))).toMatchObject({ actionContains: "a b c" });
  });

  it("행위자 구분 — 허용 밖 값은 human, 조건 변환", () => {
    expect(parseAuditLogActorFilter("bogus")).toBe("human");
    expect(auditLogActorTypeCondition("all")).toBeNull();
    expect(auditLogActorTypeCondition("human")).toEqual({ op: "not_in", values: ["system", "cron"] });
    expect(auditLogActorTypeCondition("admin")).toEqual({ op: "eq", value: "admin" });
  });
});
