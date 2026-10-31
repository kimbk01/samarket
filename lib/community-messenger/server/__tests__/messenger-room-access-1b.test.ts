import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 1-B — 방 확인이 community_messenger_room_access 1회로 같은 판정을 내는지.
 * 판정 기준(기존과 동일): 참가 행 left_at null · 그룹은 활성 강퇴 없음 + 숨김 아닌 참가 행 · 방은 있는데 참가 아님 → 404.
 * RPC 실패 → 기존 개별 조회 경로.
 */
const ROOM = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const db = vi.hoisted(() => ({
  rpcCalls: 0,
  tableCalls: [] as string[],
  rpc: null as null | { data: unknown; error: unknown },
  groupGateOk: true,
}));

function tableBuilder(table: string) {
  db.tableCalls.push(table);
  const b: any = {
    select: () => b,
    eq: () => b,
    is: () => b,
    maybeSingle: async () => {
      if (table === "community_messenger_participants") return { data: { room_id: ROOM }, error: null };
      if (table === "community_messenger_rooms") return { data: { id: ROOM, room_type: "direct" }, error: null };
      return { data: null, error: null };
    },
  };
  return b;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    rpc: async (name: string) => {
      expect(name).toBe("community_messenger_room_access");
      db.rpcCalls += 1;
      return db.rpc ?? { data: null, error: { message: "x" } };
    },
    from: (t: string) => tableBuilder(t),
  }),
}));
vi.mock("@/lib/trade/resolve-product-chat", () => ({ resolveProductChat: vi.fn(async () => null) }));
vi.mock("@/lib/community-messenger/service", () => ({
  ensureCommunityMessengerDirectRoomFromProductChat: vi.fn(async () => ({ ok: false })),
}));
vi.mock("@/lib/community-messenger/group/group-active-membership-gate", () => ({
  assertActiveGroupMembershipIfGroup: vi.fn(async () => (db.groupGateOk ? { ok: true } : { ok: false })),
}));

import {
  recheckActiveMessengerParticipant,
  resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown as resolve,
} from "@/lib/community-messenger/server/messenger-room-canonical-resolve-core";

function facts(over: Record<string, unknown>) {
  return {
    data: {
      room_exists: true,
      room_type: "direct",
      deleted_at: null,
      participant_active: true,
      group_participant: { id: "p1", room_id: ROOM, user_id: USER, role: "member", left_at: null },
      banned: false,
      ...over,
    },
    error: null,
  };
}

describe("1-B 방 접근 확인 1회 조회", () => {
  beforeEach(() => {
    db.rpcCalls = 0;
    db.tableCalls = [];
    db.rpc = null;
    db.groupGateOk = true;
  });

  it("1:1 참가자 → 허용, RPC 1회만 · 표 직접 조회 0 · access 전달", async () => {
    db.rpc = facts({});
    const r = await resolve(USER, ROOM);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.canonicalRoomId).toBe(ROOM);
      expect(r.access?.roomType).toBe("direct");
      expect(r.access?.deleted).toBe(false);
    }
    expect(db.rpcCalls).toBe(1);
    expect(db.tableCalls).toEqual([]);
  });

  it("방은 있는데 참가 아님(나감) → 404", async () => {
    db.rpc = facts({ participant_active: false, group_participant: null });
    const r = await resolve(USER, ROOM);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.breakdown.permission_source).toBe("room_exists_not_member");
  });

  it("그룹 + 활성 강퇴 → 404 (추가 조회 없음)", async () => {
    db.rpc = facts({ room_type: "private_group", banned: true });
    const r = await resolve(USER, ROOM);
    expect(r.ok).toBe(false);
    expect(db.tableCalls).toEqual([]);
  });

  it("그룹 + 숨김 처리된 참가 행(group_participant null) → 404", async () => {
    db.rpc = facts({ room_type: "open_group", group_participant: null });
    const r = await resolve(USER, ROOM);
    expect(r.ok).toBe(false);
  });

  it("그룹 + 활성 멤버 → 허용", async () => {
    db.rpc = facts({ room_type: "private_group" });
    const r = await resolve(USER, ROOM);
    expect(r.ok).toBe(true);
    expect(db.rpcCalls).toBe(1);
  });

  it("RPC 실패 → 기존 개별 조회(participants·rooms)로 같은 판정, access 없음", async () => {
    db.rpc = null;
    const r = await resolve(USER, ROOM);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.access).toBeUndefined();
    expect(db.tableCalls.sort()).toEqual(["community_messenger_participants", "community_messenger_rooms"]);
  });

  it("재확인: RPC 로 left_at 기준 판정 + access 반환", async () => {
    db.rpc = facts({ participant_active: false, group_participant: null });
    const r1 = await recheckActiveMessengerParticipant(USER, ROOM);
    expect(r1.stillMember).toBe(false);
    db.rpc = facts({});
    const r2 = await recheckActiveMessengerParticipant(USER, ROOM);
    expect(r2.stillMember).toBe(true);
    expect(r2.access?.banned).toBe(false);
    expect(db.tableCalls).toEqual([]);
  });

  it("재확인: RPC 실패 → 기존 participants 조회", async () => {
    db.rpc = null;
    const r = await recheckActiveMessengerParticipant(USER, ROOM);
    expect(r.stillMember).toBe(true);
    expect(r.access).toBeNull();
    expect(db.tableCalls).toEqual(["community_messenger_participants"]);
  });
});
