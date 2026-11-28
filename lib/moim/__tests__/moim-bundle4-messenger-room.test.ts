import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 모임 4번 묶음 — 메신저 모임 방 (2026-11-28 · 설계 docs/audit/moim-bundle4-design-2026-11-28.md)
 * D1 메신저 방 공지 막기·모임 공지 줄 · D2 일정 방 · D6 방 정보 · D7 나가기 409
 * DB 트리거(D1)는 로컬 Postgres 에서 수정 전 통과 → 수정 후 moim_room_settings_managed_by_moim 확인 (PR 본문).
 */

const leaveGroupRoom = vi.fn();
vi.mock("@/lib/community-messenger/group/group-room-service", async () => {
  const actual = await vi.importActual<object>("@/lib/community-messenger/group/group-room-service");
  return { ...actual, leaveGroupRoom: (...a: unknown[]) => leaveGroupRoom(...(a as [])) };
});

import { moimRoomOwnerHref } from "@/lib/moim/use-moim-room-owner";
import { messengerHomeActionErrorMessage } from "@/lib/community-messenger/home/messenger-home-action-error-message";
import { listMoimPosts } from "@/lib/moim/server/moim-queries.server";

function countingSb(tables: Record<string, unknown[]>) {
  const calls: Array<{ table: string; filters: string[] }> = [];
  const sb = {
    calls,
    from(table: string) {
      const entry = { table, filters: [] as string[] };
      calls.push(entry);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "is", "or", "not", "order", "limit", "lt"]) chain[m] = () => chain;
      chain.eq = (col: string, v: unknown) => {
        entry.filters.push(`${col}=${String(v)}`);
        return chain;
      };
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
  };
  return sb;
}

beforeEach(() => vi.clearAllMocks());

describe("D2 일정 방 → 일정 상세, 모임 방 → 모임 홈", () => {
  it("일정 방은 일정 보기 주소, 모임 방은 모임 홈 주소", () => {
    expect(moimRoomOwnerHref({ moimId: "m1", kind: "schedule", moimName: "M", scheduleId: "s1" })).toBe("/moim/m1/schedules/s1");
    expect(moimRoomOwnerHref({ moimId: "m1", kind: "moim", moimName: "M" })).toBe("/moim/m1");
  });

  it("목록 배지·머리글 버튼이 일정 방을 구분한다 (구조 확인)", () => {
    const list = readFileSync("components/community-messenger/MessengerChatListItem.tsx", "utf8");
    const header = readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx", "utf8");
    expect(list).toContain('moimRoomOwner.kind === "schedule" ? "moim_chat_list_badge_schedule" : "moim_chat_list_badge"');
    expect(header).toContain('vm.moimRoomOwner.kind === "schedule" ? "moim_room_schedule_btn" : "moim_room_home_btn"');
    expect(header).toContain("moimRoomOwnerHref(vm.moimRoomOwner!)");
  });

  it("/api/moim/rooms 가 일정 방에 scheduleId 를 준다", async () => {
    vi.resetModules();
    vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
      const actual = await vi.importActual<object>("@/lib/moim/server/moim-route-guard.server");
      return {
        ...actual,
        guardMoimRead: async () => ({
          ok: true,
          userId: "u1",
          sb: countingSb({
            community_messenger_participants: [{ room_id: "aaaaaaaa-1111-4111-8111-111111111111" }, { room_id: "bbbbbbbb-2222-4222-8222-222222222222" }],
            community_messenger_rooms: [
              { id: "aaaaaaaa-1111-4111-8111-111111111111", owner_ref_id: "m1" },
              { id: "bbbbbbbb-2222-4222-8222-222222222222", owner_ref_id: "s1" },
            ],
            moims: [{ id: "m1", name: "Moim", status: "active", platform_state: "normal", moim_members: [], moim_permissions: [] }],
            moim_schedules: [{ id: "s1", moim_id: "m1" }],
          }),
        }),
      };
    });
    const { GET } = await import("@/app/api/moim/rooms/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("https://x.test/api/moim/rooms?ids=aaaaaaaa-1111-4111-8111-111111111111,bbbbbbbb-2222-4222-8222-222222222222"));
    const body = (await res.json()) as { owners: Record<string, unknown> };
    /** 모임 R4: moimStatus(D-3)·memberRoles(#18)·canStartDm(D-45) 이 같은 응답에 붙는다 — 보는 사람이 활성 멤버가 아니면 [1:1] 없음 */
    const r4 = { moimStatus: "active", memberRoles: {}, canStartDm: false };
    expect(body.owners["bbbbbbbb-2222-4222-8222-222222222222"]).toEqual({ moimId: "m1", kind: "schedule", moimName: "Moim", scheduleId: "s1", ...r4 });
    expect(body.owners["aaaaaaaa-1111-4111-8111-111111111111"]).toEqual({ moimId: "m1", kind: "moim", moimName: "Moim", ...r4 });
    vi.doUnmock("@/lib/moim/server/moim-route-guard.server");
  });
});

describe("D1 모임 방 공지 = 모임 게시판 공지", () => {
  it("글 목록 pinned=1 → 공지 게시판의 고정 글만 + 공지 게시판 id", async () => {
    const sb = countingSb({ moim_boards: [{ id: "nb1", kind: "notice" }], moim_posts: [] });
    const access = { moim: { id: "m1" }, me: null, role: "member", overrides: {} } as never;
    const out = await listMoimPosts(sb as never, access, "u1", { pinnedNotice: true, limit: 1 });
    expect(out.noticeBoardId).toBe("nb1");
    const posts = sb.calls.find((c) => c.table === "moim_posts");
    expect(posts?.filters).toEqual(expect.arrayContaining(["board_id=nb1", "is_pinned=true"]));
  });

  it("공지 게시판이 없으면 글 조회 없이 빈 목록", async () => {
    const sb = countingSb({ moim_boards: [] });
    const out = await listMoimPosts(sb as never, { moim: { id: "m1" }, role: "member", overrides: {} } as never, "u1", { pinnedNotice: true });
    expect(out).toEqual({ items: [], nextBefore: null, noticeBoardId: null });
    expect(sb.calls.some((c) => c.table === "moim_posts")).toBe(false);
  });

  it("메신저 방 공지 편집은 모임 방에서 꺼지고, 방 정보의 운영·공지 칸은 모임 방에서 숨는다 (구조 확인)", () => {
    const pres = readFileSync("lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts", "utf8");
    const sheets = readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx", "utf8");
    const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
    expect(pres).toMatch(/canEditGroupNotice = Boolean\(\s*\(isPrivateGroupRoom \|\| isOpenGroupRoom\) && !isMoimRoom && groupCaps\?\.canEditNotice/);
    expect(sheets).toContain("{vm.isPrivateGroupRoom && !vm.isMoimRoom ? (");
    expect(sheets).toContain("{(vm.isPrivateGroupRoom && !vm.isMoimRoom) || vm.isOpenGroupRoom ? (");
    expect(sheets).toContain("<MoimRoomNoticeMenuItem");
    expect(svc).toContain('return { ok: false, error: "moim_room_settings_managed_by_moim" };');
  });
});

describe("D7 목록 길게 누르기 나가기 — 모임 방은 정확한 안내", () => {
  it("트리거 거부 → 409 moim_room_membership_managed_by_moim (이전: 500 leave_failed)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/api-session", async () => {
      const actual = await vi.importActual<object>("@/lib/auth/api-session");
      return { ...actual, requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }) };
    });
    vi.doMock("@/lib/community-messenger/server/messenger-room-canonical-resolve-api", () => ({
      messengerRoomCanonicalOrJsonError: async (_u: string, id: string) => ({ ok: true, canonicalRoomId: id }),
    }));
    vi.doMock("@/lib/http/api-route", async () => {
      const actual = await vi.importActual<object>("@/lib/http/api-route");
      return { ...actual, enforceRateLimit: async () => ({ ok: true }) };
    });
    vi.doMock("@/lib/supabase/try-supabase-server", () => ({
      tryCreateSupabaseServiceClient: () => countingSb({ community_messenger_rooms: [{ room_type: "private_group" }] }),
    }));
    leaveGroupRoom.mockResolvedValueOnce({ ok: false, error: "P0001: moim_room_membership_managed_by_moim" });
    const mod = await import("@/app/api/community-messenger/rooms/[roomId]/leave/route");
    const res = await mod.POST(
      new Request("https://x.test/api/community-messenger/rooms/r1/leave", { method: "POST", body: "{}" }) as never,
      { params: Promise.resolve({ roomId: "11111111-1111-4111-8111-111111111111" }) } as never
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "moim_room_membership_managed_by_moim" });
  });

  it("화면 문구: 일반 오류가 아니라 모임 안내", () => {
    const t = (k: string) => k;
    expect(messengerHomeActionErrorMessage(t, "moim_room_membership_managed_by_moim")).toBe("moim_err_moim_room_membership_managed_by_moim");
  });
});
