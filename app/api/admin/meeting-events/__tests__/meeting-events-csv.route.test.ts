/**
 * 모임 이벤트 CSV — 화면의 500건 요청이 100건으로 잘리던 결함.
 * 조회 함수는 한 번에 100건까지라 라우트가 100건씩 이어 읽어 요청 건수(최대 5000)만큼 내보낸다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const list = vi.fn();
vi.mock("@/lib/admin/require-admin-api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireAdminApiUser: async () => ({ ok: true, userId: "admin-1" }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({ ok: true, userId: "admin-1" }),
}));
vi.mock("@/lib/neighborhood/meeting-events-admin-query", () => ({
  listMeetingEventsAdminPage: (o: unknown) => list(o),
}));

const TOTAL = 730;
function page({ limit, offset }: { limit: number; offset: number }) {
  const size = Math.min(Math.min(limit, 100), Math.max(0, TOTAL - offset));
  const events = Array.from({ length: size }, (_, i) => ({
    id: `e${offset + i}`,
    meeting_id: "m",
    meeting_title: "t",
    event_type: "joined",
    actor_user_id: null,
    actor_name: "a",
    target_user_id: null,
    target_name: null,
    created_at: "2026-10-20T00:00:00Z",
    payload: {},
  }));
  return { events, hasMore: offset + size < TOTAL, total: TOTAL };
}

const csvRows = async (res: Response) => (await res.text()).replace(/^﻿/, "").split("\r\n").length - 1;

describe("GET /api/admin/meeting-events?format=csv", () => {
  beforeEach(() => {
    list.mockReset();
    list.mockImplementation(async (o: { limit: number; offset: number }) => page(o));
  });

  it("limit=500 → 500행 (100건씩 5번 읽음)", async () => {
    const { GET } = await import("@/app/api/admin/meeting-events/route");
    const res = await GET(new NextRequest("https://x.test/api/admin/meeting-events?format=csv&limit=500&offset=0"));
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(await csvRows(res)).toBe(500);
    expect(list).toHaveBeenCalledTimes(5);
    expect(list.mock.calls.map((c) => (c[0] as { offset: number }).offset)).toEqual([0, 100, 200, 300, 400]);
  });

  it("전체가 요청보다 적으면 있는 만큼 (730건 중 limit=5000 → 730행) · 조회 실패는 500", async () => {
    const { GET } = await import("@/app/api/admin/meeting-events/route");
    const res = await GET(new NextRequest("https://x.test/api/admin/meeting-events?format=csv&limit=5000"));
    expect(await csvRows(res)).toBe(730);
    list.mockResolvedValueOnce({ events: [], hasMore: false, total: null, error: "load_failed" });
    const bad = await GET(new NextRequest("https://x.test/api/admin/meeting-events?format=csv&limit=500"));
    expect(bad.status).toBe(500);
  });
});
