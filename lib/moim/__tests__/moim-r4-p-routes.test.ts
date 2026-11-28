import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 모임 R4 — 라우트·알림 (설계 docs/audit/moim-r4-decisions-design-2026-11-28.md §4)
 * #4·5 지난 일정·댓글 쪽 넘김 인자 · #6 `capped` 응답 · #7·8 새 멤버 알림의 모임 1회 조회.
 */

const { g, q, sq, appendUserNotification } = vi.hoisted(() => {
  const g = { ok: true as const, userId: "u-me" as string | null, sb: {} as unknown };
  const q = {
    loadMoimAccess: vi.fn(async () => ({ moim: { id: "m1" }, role: "member" })),
    listMoimJoinRequests: vi.fn(async () => [] as unknown[]),
    getMoimPost: vi.fn(),
    listMoimComments: vi.fn(async () => ({ items: [], nextBefore: null })),
  };
  const sq = { listMoimSchedules: vi.fn(async () => ({ items: [], nextBefore: "2026-11-01T00:00:00Z|x" })) };
  const appendUserNotification = vi.fn(async () => true);
  return { g, q, sq, appendUserNotification };
});

vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return { ...actual, guardMoimRead: async () => g };
});
vi.mock("@/lib/moim/server/moim-queries.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-queries.server")>("@/lib/moim/server/moim-queries.server");
  return {
    ...actual,
    loadMoimAccess: (...a: unknown[]) => q.loadMoimAccess(...(a as [])),
    listMoimJoinRequests: (...a: unknown[]) => q.listMoimJoinRequests(...(a as [])),
    getMoimPost: (...a: unknown[]) => q.getMoimPost(...(a as [])),
    listMoimComments: (...a: unknown[]) => q.listMoimComments(...(a as [])),
    loadMoimName: vi.fn(async () => "SHOULD-NOT-BE-USED"),
  };
});
vi.mock("@/lib/moim/server/moim-schedule-queries.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-schedule-queries.server")>("@/lib/moim/server/moim-schedule-queries.server");
  return { ...actual, listMoimSchedules: (...a: unknown[]) => sq.listMoimSchedules(...(a as [])) };
});
vi.mock("@/lib/notifications/append-user-notification", () => ({ appendUserNotification: (...a: unknown[]) => appendUserNotification(...(a as [])) }));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: async () => "ko",
  loadNotificationUserLanguages: async (_sb: unknown, ids: string[]) => new Map(ids.map((id) => [id, "ko"])),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({ listBlockedEitherWayAmong: async () => new Set<string>() }));

import { GET as schedulesGet } from "@/app/api/moim/[moimId]/schedules/route";
import { GET as joinRequestsGet } from "@/app/api/moim/[moimId]/join-requests/route";
import { GET as commentsGet } from "@/app/api/moim/posts/[postId]/comments/route";
import { notifyMoimMemberJoined } from "@/lib/moim/server/moim-notify.server";
import { MOIM_LIST_CAP } from "@/lib/moim/moim-api-types";

const MOIM = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  g.userId = "u-me";
});

describe("#4·5 쪽 넘김 인자", () => {
  it("일정 목록 GET 은 limit·before 를 그대로 넘기고 nextBefore 를 돌려준다", async () => {
    const res = await schedulesGet(new NextRequest(`https://x.test/api/moim/${MOIM}/schedules?scope=past&limit=3&before=abc`), {
      params: Promise.resolve({ moimId: MOIM }),
    });
    expect(sq.listMoimSchedules).toHaveBeenCalledWith(g.sb, expect.anything(), "u-me", { scope: "past", limit: 3, before: "abc" });
    expect(await res.json()).toEqual({ ok: true, items: [], nextBefore: "2026-11-01T00:00:00Z|x" });
  });

  it("limit 이 숫자가 아니면 기본값(넘기지 않음)", async () => {
    await schedulesGet(new NextRequest(`https://x.test/api/moim/${MOIM}/schedules?limit=x`), { params: Promise.resolve({ moimId: MOIM }) });
    expect(sq.listMoimSchedules).toHaveBeenCalledWith(g.sb, expect.anything(), "u-me", { scope: "upcoming", limit: undefined, before: null });
  });

  it("이전 댓글 GET: 멤버만 · before 를 넘긴다 · 비멤버는 403 이고 댓글을 읽지 않는다", async () => {
    q.getMoimPost.mockResolvedValueOnce({ post: { id: POST }, access: { role: "member" } });
    const ok = await commentsGet(new NextRequest(`https://x.test/api/moim/posts/${POST}/comments?before=cur`), { params: Promise.resolve({ postId: POST }) });
    expect(q.listMoimComments).toHaveBeenCalledWith(g.sb, { id: POST }, "u-me", { before: "cur" });
    expect(await ok.json()).toEqual({ ok: true, items: [], nextBefore: null });

    q.getMoimPost.mockResolvedValueOnce({ post: { id: POST }, access: { role: null } });
    const no = await commentsGet(new NextRequest(`https://x.test/api/moim/posts/${POST}/comments?before=cur`), { params: Promise.resolve({ postId: POST }) });
    expect(no.status).toBe(403);
    expect(q.listMoimComments).toHaveBeenCalledTimes(1);
  });
});

describe("#6 capped 응답", () => {
  it("가입 신청이 상한에 닿으면 capped = true", async () => {
    q.listMoimJoinRequests.mockResolvedValueOnce(Array.from({ length: MOIM_LIST_CAP }, (_, i) => ({ id: `r${i}` })));
    const full = await joinRequestsGet(new NextRequest(`https://x.test/api/moim/${MOIM}/join-requests`), { params: Promise.resolve({ moimId: MOIM }) });
    expect(((await full.json()) as { capped: boolean }).capped).toBe(true);
    q.listMoimJoinRequests.mockResolvedValueOnce([{ id: "r1" }]);
    const few = await joinRequestsGet(new NextRequest(`https://x.test/api/moim/${MOIM}/join-requests`), { params: Promise.resolve({ moimId: MOIM }) });
    expect(((await few.json()) as { capped: boolean }).capped).toBe(false);
  });
});

describe("#7·8 새 멤버 알림 — 모임장·이름을 한 번에", () => {
  it("moims 를 1번만 읽고(host_user_id, name) 그 이름으로 보낸다", async () => {
    const tables: string[] = [];
    const selects: string[] = [];
    const sb = {
      from(table: string) {
        tables.push(table);
        const chain: Record<string, unknown> = {};
        chain.select = (cols: string) => {
          selects.push(`${table}:${cols}`);
          return chain;
        };
        for (const m of ["eq", "in", "is", "order", "limit"]) chain[m] = () => chain;
        chain.maybeSingle = async () =>
          table === "moims"
            ? { data: { host_user_id: "u-host", name: " Hiking " }, error: null }
            : { data: { nickname: "Kim", joined_at: "2026-11-28" }, error: null };
        return chain;
      },
    };
    await notifyMoimMemberJoined(sb as never, "m1", "u-new", "");
    expect(tables.filter((t) => t === "moims")).toHaveLength(1);
    expect(selects).toContain("moims:host_user_id, name");
    const row = (appendUserNotification.mock.calls[0] as unknown[] | undefined)?.[1] as Record<string, unknown> | undefined;
    expect(row?.user_id ?? row?.userId).toBe("u-host");
    expect(JSON.stringify(row)).toContain("Hiking");
    expect(JSON.stringify(row)).not.toContain("SHOULD-NOT-BE-USED");
  });
});
