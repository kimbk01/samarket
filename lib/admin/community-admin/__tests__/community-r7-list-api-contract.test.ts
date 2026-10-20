/**
 * R7 목록 표준 — 커뮤니티 목록 API 계약 (가짜 DB).
 * `limit`(20/50/100 만) · `offset` → `.range(offset, offset+limit-1)` · `total` = DB count(exact) · 고정 상한 제거.
 * 파라미터가 없을 때의 기존 응답(다른 호출자 호환)도 함께 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeCommunitySupabase, type FakeCall, type FakeResult } from "./fake-community-supabase";

let handler: (call: FakeCall) => FakeResult = () => ({ data: [], error: null });
const fake = createFakeCommunitySupabase((c) => handler(c));

vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({ ok: true, userId: "admin-1", actor: { userId: "admin-1" }, sb: fake.sb }),
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => ({ ok: true, userId: "admin-1" }),
}));
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => fake.sb,
}));
vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: async () => new Map<string, string>(),
}));
vi.mock("@/lib/admin-community/member-identity", () => ({
  loadAdminMemberIdentityMap: async () => new Map(),
  formatAdminMemberLabel: () => "회원",
}));

import { GET as promotionOrdersGET } from "@/app/api/admin/community-promotion-orders/route";
import { GET as noticesGET } from "@/app/api/admin/community/notices/route";
import { GET as meetingEventsGET } from "@/app/api/admin/meeting-events/route";
import { GET as sectionsGET } from "@/app/api/admin/community/sections/route";
import { loadAdminMeetingReports } from "@/lib/admin/community-admin/load-admin-meeting-reports";

const req = (path: string, params: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}?${new URLSearchParams(params).toString()}`);

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function listCall(table: string): FakeCall {
  const c = fake.calls.find((x) => x.table === table && x.op === "select" && x.range);
  if (!c) throw new Error(`no paged select on ${table}`);
  return c;
}

beforeEach(() => {
  fake.calls.length = 0;
  handler = () => ({ data: [], error: null });
});

describe("GET /api/admin/community-promotion-orders — limit/offset/total", () => {
  it("limit=50&offset=100 → range(100, 149) · total = DB count", async () => {
    handler = (c) =>
      c.table === "point_promotion_orders" ? { data: [{ id: "o1", user_id: "u1", target_id: "" }], error: null, count: 321 } : { data: [], error: null };
    const res = await promotionOrdersGET(req("/api/admin/community-promotion-orders", { status: "active", limit: "50", offset: "100" }));
    const j = await json(res);
    expect(listCall("point_promotion_orders").range).toEqual([100, 149]);
    expect(j.total).toBe(321);
    expect(j.limit).toBe(50);
    expect(j.offset).toBe(100);
  });

  it("limit 은 20/50/100 만 — 그 외는 기본 20", async () => {
    await promotionOrdersGET(req("/api/admin/community-promotion-orders", { limit: "500", offset: "0" }));
    expect(listCall("point_promotion_orders").range).toEqual([0, 19]);
  });

  it("limit 이 없으면 기존 page/pageSize 계약 그대로", async () => {
    await promotionOrdersGET(req("/api/admin/community-promotion-orders", { page: "3", pageSize: "30" }));
    expect(listCall("point_promotion_orders").range).toEqual([60, 89]);
  });
});

describe("GET /api/admin/community/notices — 고정 100건 상한 제거", () => {
  it("limit=20&offset=40 → range(40, 59) · total = DB count · 메모리 필터 없음", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`,
      user_id: "u",
      // 종료 시각이 지난 행도 DB 가 돌려주면 그대로 (행 수 = 페이지, total = count) — 걸러내기는 DB 조건
      notice_ends_at: i === 0 ? "2000-01-01T00:00:00Z" : null,
    }));
    handler = (c) =>
      c.table === "community_posts" && c.filters.some(([k, col]) => k === "eq" && col === "is_notice")
        ? { data: rows, error: null, count: 87 }
        : { data: [], error: null };
    const res = await noticesGET(req("/api/admin/community/notices", { tab: "live", limit: "20", offset: "40" }));
    const j = await json(res);
    const call = fake.calls.find((c) => c.table === "community_posts" && c.filters.some(([, col]) => col === "is_notice"))!;
    expect(call.range).toEqual([40, 59]);
    expect(call.limit).toBeUndefined();
    expect(j.total).toBe(87);
    expect((j.notices as unknown[]).length).toBe(20);
    // 게시 중 = 시작·종료 조건 모두 DB (or 안의 and(or, or))
    const or = call.filters.find(([k]) => k === "or")?.[2];
    expect(String(or)).toContain("notice_ends_at.is.null");
    expect(String(or)).toContain("notice_starts_at.is.null");
  });

  it("limit 이 없으면 기존처럼 최근 100건 (다른 호출자 호환)", async () => {
    await noticesGET(req("/api/admin/community/notices", { tab: "ended" }));
    const call = fake.calls.find((c) => c.table === "community_posts" && c.filters.some(([, col]) => col === "is_notice"))!;
    expect(call.limit).toBe(100);
    expect(call.range).toBeUndefined();
  });
});

describe("GET /api/admin/meeting-events — total · 실패를 빈 목록으로 숨기지 않음", () => {
  it("limit=100&offset=200 → range(200, 300)(다음 쪽 확인 1행 포함) · total = count", async () => {
    handler = (c) => (c.table === "meeting_events" ? { data: [], error: null, count: 412 } : { data: [], error: null });
    const res = await meetingEventsGET(req("/api/admin/meeting-events", { limit: "100", offset: "200" }));
    const j = await json(res);
    expect(listCall("meeting_events").range).toEqual([200, 300]);
    expect(j.total).toBe(412);
    expect(j.limit).toBe(100);
  });

  it("JSON limit 은 20/50/100 만 (그 외 50)", async () => {
    await meetingEventsGET(req("/api/admin/meeting-events", { limit: "7", offset: "0" }));
    expect(listCall("meeting_events").range).toEqual([0, 50]);
  });

  it("DB 오류 → 500 (예전: ok + 빈 목록)", async () => {
    handler = (c) => (c.table === "meeting_events" ? { data: null, error: { message: "boom" } } : { data: [], error: null });
    const res = await meetingEventsGET(req("/api/admin/meeting-events", { limit: "20" }));
    expect(res.status).toBe(500);
    expect((await json(res)).ok).toBe(false);
  });
});

describe("GET /api/admin/community/sections — 조회 실패는 오류", () => {
  it("DB 오류 → 500 (「섹션 없음」과 구분)", async () => {
    handler = () => ({ data: null, error: { message: "boom" } });
    const res = await sectionsGET();
    expect(res.status).toBe(500);
  });
});

describe("loadAdminMeetingReports — 페이지 크기 (URL size)", () => {
  it("pageSize 100, 3쪽 → range(200, 299) · total = count", async () => {
    handler = (c) => (c.table === "meeting_reports" ? { data: [], error: null, count: 250 } : { data: [], error: null });
    const r = await loadAdminMeetingReports(
      "pending",
      { type: "", fromIso: null, toIso: null, meetingIds: null, reporterIds: null },
      3,
      fake.sb as never,
      { pageSize: 100 }
    );
    expect(listCall("meeting_reports").range).toEqual([200, 299]);
    expect(r.total).toBe(250);
  });

  it("pageSize 생략 → 기존 50", async () => {
    await loadAdminMeetingReports("all", { type: "", fromIso: null, toIso: null, meetingIds: null, reporterIds: null }, 2, fake.sb as never);
    expect(listCall("meeting_reports").range).toEqual([50, 99]);
  });
});
