import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 3번 묶음 — 호출 수 (2026-11-28 · 설계 docs/audit/moim-bundle3-design-2026-11-28.md)
 * E1 언어 일괄 · E2 상세 공유 · E3 상세 조회 · E4 초대 목록 · E8 모임 방 조회
 */

import { loadNotificationUserLanguages, loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { invalidateMoimDetailCache, readMoimDetailCached, MOIM_DETAIL_CACHE_TTL_MS } from "@/lib/moim/moim-detail-cache";
import { getMoimDetail, listReceivedMoimInvites } from "@/lib/moim/server/moim-queries.server";

/** from(표) 호출을 세고, 표마다 정해 둔 행을 돌려주는 가짜 Supabase */
function countingSb(tables: Record<string, unknown[]>) {
  const calls: string[] = [];
  const sb = {
    calls,
    from(table: string) {
      calls.push(table);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "not", "order", "limit", "lt", "gt", "gte", "neq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
  };
  return sb;
}

describe("E1 알림 언어 일괄 조회", () => {
  it("N명 = 조회 2회 · 판정은 단건과 같다(계정 값 → 최근 기기 → en)", async () => {
    const tables = {
      user_settings: [{ user_id: "a", preferred_language: "ko" }],
      user_devices: [
        { user_id: "b", app_language: "ko", last_seen_at: "2026-11-28" },
        { user_id: "b", app_language: "en", last_seen_at: "2026-11-01" },
      ],
    };
    const sb = countingSb(tables);
    const m = await loadNotificationUserLanguages(sb as never, ["a", "b", "c"]);
    expect(sb.calls).toEqual(["user_settings", "user_devices"]);
    expect(Object.fromEntries(m)).toEqual({ a: "ko", b: "ko", c: "en" });
    // 단건 함수와 같은 결과 (그 사람 행만 담은 가짜 DB 로 단건 실행)
    for (const id of ["a", "b", "c"]) {
      const own = {
        user_settings: tables.user_settings.filter((r) => r.user_id === id),
        user_devices: tables.user_devices.filter((r) => r.user_id === id),
      };
      const one = await loadNotificationUserLanguage(countingSb(own) as never, id);
      expect(m.get(id), id).toBe(one);
    }
  });
});

describe("E2 모임 상세 화면 간 공유", () => {
  beforeEach(() => invalidateMoimDetailCache());

  it("동시에 두 화면이 부르면 요청 1회, 60초 안 다시 열어도 1회", async () => {
    const load = vi.fn(async () => ({ ok: true as const, moim: { id: "m1" } }));
    const [a, b] = await Promise.all([readMoimDetailCached("u1", "m1", load), readMoimDetailCached("u1", "m1", load)]);
    expect(a).toBe(b);
    await readMoimDetailCached("u1", "m1", load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("60초가 지나거나 force·쓰기 성공(비움)이면 다시 부른다", async () => {
    const load = vi.fn(async () => ({ ok: true as const }));
    const t0 = Date.now();
    await readMoimDetailCached("u1", "m1", load, { now: t0 });
    await readMoimDetailCached("u1", "m1", load, { now: t0 + MOIM_DETAIL_CACHE_TTL_MS + 1 });
    await readMoimDetailCached("u1", "m1", load, { force: true });
    invalidateMoimDetailCache();
    await readMoimDetailCached("u1", "m1", load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("실패 응답은 저장하지 않고, 다른 계정은 섞이지 않는다", async () => {
    const fail = vi.fn(async () => ({ ok: false as const }));
    await readMoimDetailCached("u1", "m1", fail);
    await readMoimDetailCached("u1", "m1", fail);
    expect(fail).toHaveBeenCalledTimes(2);
    const ok = vi.fn(async () => ({ ok: true as const }));
    await readMoimDetailCached("u1", "m2", ok);
    await readMoimDetailCached("u2", "m2", ok);
    expect(ok).toHaveBeenCalledTimes(2);
  });
});

describe("E3 상세 API 조회 수 (멤버 · 글 있음 · 활성 모임)", () => {
  it("게시판은 1번만 읽고, 글 작성자는 한 번에 읽는다", async () => {
    const post = (id: string, pinned: boolean) => ({
      id, moim_id: "m1", board_id: "b1", author_id: "u2", title: "", body: "x", images: [], visibility: "members", is_pinned: pinned, status: "active", comment_count: 0, created_at: "2026-11-28", updated_at: "2026-11-28",
    });
    const sb = countingSb({
      moims: [{ id: "m1", name: "M", intro: "", category_id: "c1", lgu_id: "1381300000", join_mode: "instant", capacity: null, host_user_id: "u9", status: "active", platform_state: "normal", member_count: 2, last_activity_at: "", main_room_id: "r1", created_at: "", updated_at: "", retention_ended_at: null }],
      moim_members: [{ moim_id: "m1", user_id: "u1", role: "member", status: "active", nickname: "me", avatar_url: null, bio: "", joined_at: "", rejoin_count: 0 }],
      moim_permissions: [],
      moim_categories: [{ id: "c1", slug: "s", label_ko: "운동", label_en: "Sports", allow_custom_topic: false }],
      moim_join_questions: [],
      moim_boards: [{ id: "b1", kind: "free", name: null, write_min_role: "member", sort_order: 1, is_active: true }],
      moim_join_requests: [],
      moim_bans: [],
      moim_host_transfers: [],
      moim_posts: [post("p1", true), post("p2", false)],
      moim_schedules: [],
    });
    const d = await getMoimDetail(sb as never, "m1", "u1");
    expect(d?.recentPosts).toHaveLength(2);
    expect(d?.recentPosts[0]?.boardKind).toBe("free");
    expect(sb.calls.filter((t) => t === "moim_boards")).toHaveLength(1);
    // 접근 3 + 병렬 9 + 작성자·일정 2 = 14 (이전: 게시판 3번·작성자 2번 = 16)
    expect(sb.calls).toHaveLength(14);
  });
});

describe("E4 받은 초대 목록", () => {
  it("초대 3건이어도 초대한 사람 닉네임 조회는 1회", async () => {
    const sb = countingSb({
      moim_invite_targets: [
        { id: "i1", moim_id: "m1", inviter_id: "a", created_at: "3" },
        { id: "i2", moim_id: "m2", inviter_id: "b", created_at: "2" },
        { id: "i3", moim_id: "m3", inviter_id: "c", created_at: "1" },
      ],
      moims: ["m1", "m2", "m3"].map((id) => ({ id, name: id, intro: "", category_id: "c1", lgu_id: "1381300000", join_mode: "instant", capacity: null, host_user_id: "h", status: "active", platform_state: "normal", member_count: 1, last_activity_at: "", main_room_id: null, created_at: "", updated_at: "", retention_ended_at: null })),
      moim_members: [{ moim_id: "m1", user_id: "a", nickname: "A" }],
    });
    const out = await listReceivedMoimInvites(sb as never, "me");
    expect(out).toHaveLength(3);
    expect(out[0]?.inviterNickname).toBe("A");
    // 카드용 내 멤버십 1회 + 초대한 사람 닉네임 1회 = 2 (이전: 1 + 초대마다 1회 = 4)
    expect(sb.calls.filter((t) => t === "moim_members")).toHaveLength(2);
  });
});

describe("E8 메신저 목록 모임 방 조회", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("응답을 기다리는 동안 같은 방을 다시 요청하지 않는다", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { requestMoimRoomOwners } = await import("@/lib/moim/use-moim-room-owner");
    requestMoimRoomOwners(["room-x"]);
    await vi.advanceTimersByTimeAsync(130);
    requestMoimRoomOwners(["room-x"]);
    await vi.advanceTimersByTimeAsync(130);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({ ok: true, owners: {} }) });
    await vi.advanceTimersByTimeAsync(1);
  });
});
