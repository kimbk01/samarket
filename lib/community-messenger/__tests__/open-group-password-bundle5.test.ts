import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 감사 5번 묶음 — 오픈채팅 입장 비밀번호 (docs/audit/moim-bundle5-design-2026-11-28.md)
 * P1 scrypt+salt·고정 시간 비교 · P2 4~32자 · P3 방·계정 15분 5회 잠금(429)
 * 수정 전: sha256 한 번(salt 없음 → 같은 비밀번호 = 같은 값), 1자리 저장, 잠금 없음.
 */

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let roomRow: Record<string, unknown> | null = null;
let failureRow: Record<string, unknown> | null = null;
let rpcResult: unknown = null;

function fakeSb() {
  return {
    from(table: string) {
      calls.push({ table, op: "from" });
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "not", "limit", "order"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data:
          table === "community_messenger_rooms"
            ? roomRow
            : table === "community_messenger_open_group_join_failures"
              ? failureRow
              : null,
        error: null,
      });
      chain.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
      chain.update = (patch: unknown) => {
        calls.push({ table, op: "update", payload: patch });
        const u: Record<string, unknown> = {};
        for (const m of ["eq", "not", "is"]) u[m] = () => u;
        u.then = (r: (v: unknown) => unknown) => r({ error: null });
        return u;
      };
      chain.insert = (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        const ins: Record<string, unknown> = {};
        ins.select = () => ins;
        ins.single = async () => ({ data: null, error: { message: "stop_here" } });
        ins.maybeSingle = async () => ({ data: null, error: { message: "stop_here" } });
        ins.then = (r: (v: unknown) => unknown) => r({ data: null, error: { message: "stop_here" } });
        return ins;
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: rpcResult, error: null };
    },
  };
}

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fakeSb() }));

import {
  hashOpenGroupPassword,
  openGroupPasswordLengthError,
  verifyOpenGroupPassword,
} from "@/lib/community-messenger/open-group-password";
import {
  createOpenGroupRoom,
  joinOpenGroupRoomWithPassword,
  updateOpenGroupRoomSettings,
} from "@/lib/community-messenger/service";

const ROOM = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  roomRow = null;
  failureRow = null;
  rpcResult = null;
});

describe("P1 해시", () => {
  it("scrypt 형식, salt 때문에 같은 비밀번호도 매번 다른 값, 검증은 통과", async () => {
    const a = await hashOpenGroupPassword("123456");
    const b = await hashOpenGroupPassword("123456");
    expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(a).not.toBe(b);
    expect(await verifyOpenGroupPassword("123456", a)).toBe(true);
    expect(await verifyOpenGroupPassword(" 123456 ", b)).toBe(true);
    expect(await verifyOpenGroupPassword("123457", a)).toBe(false);
  });

  it("예전 sha256 값도 읽는다", async () => {
    const legacy = createHash("sha256").update("abcd", "utf8").digest("hex");
    expect(await verifyOpenGroupPassword("abcd", legacy)).toBe(true);
    expect(await verifyOpenGroupPassword("abce", legacy)).toBe(false);
  });

  it("이상한 저장값·빈 값은 거부 (서버를 멈추게 하는 비용 값 포함)", async () => {
    expect(await verifyOpenGroupPassword("1234", "")).toBe(false);
    expect(await verifyOpenGroupPassword("1234", "scrypt$1048576$8$1$AAAA$AAAA")).toBe(false);
    expect(await verifyOpenGroupPassword("1234", "plain-text")).toBe(false);
  });

  it("메모리 상한을 넘는 비용 값은 오류로 끝나지 않고 false (재감사 L2)", async () => {
    const salt = Buffer.alloc(16, 1).toString("base64");
    const key = Buffer.alloc(32, 2).toString("base64");
    const stored = ["scrypt", "131072", "8", "1", salt, key].join("$");
    await expect(verifyOpenGroupPassword("1234", stored)).resolves.toBe(false);
  });
});

describe("P2 길이 4~32자", () => {
  it("판정", () => {
    expect(openGroupPasswordLengthError("123")).toBe("password_too_short");
    expect(openGroupPasswordLengthError("  12  ")).toBe("password_too_short");
    expect(openGroupPasswordLengthError("1234")).toBeNull();
    expect(openGroupPasswordLengthError("a".repeat(32))).toBeNull();
    expect(openGroupPasswordLengthError("a".repeat(33))).toBe("password_too_long");
  });

  it("만들기: 1자리 비밀번호 거부, 방 만들지 않음 (이전: 저장됨)", async () => {
    const r = await createOpenGroupRoom({ userId: USER, title: "t", joinPolicy: "password", password: "1" });
    expect(r).toEqual({ ok: false, error: "password_too_short" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("설정 수정: 33자 거부, 방 갱신 없음", async () => {
    roomRow = { id: ROOM, room_type: "open_group", owner_user_id: USER };
    const r = await updateOpenGroupRoomSettings({ userId: USER, roomId: ROOM, joinPolicy: "password", password: "a".repeat(33) });
    expect(r).toEqual({ ok: false, error: "password_too_long" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("설정 수정: 자유 입장으로 바꾸면 남은 비밀번호 길이는 보지 않고 해시를 지운다 (재감사 L1)", async () => {
    roomRow = { id: ROOM, room_type: "open_group", owner_user_id: USER };
    const r = await updateOpenGroupRoomSettings({ userId: USER, roomId: ROOM, joinPolicy: "free", password: "12" });
    expect(r).toEqual({ ok: true });
    expect((calls.find((c) => c.op === "update")?.payload as { password_hash?: unknown }).password_hash).toBeNull();
  });

  it("설정 수정: 방장이면 scrypt 로 저장, 방장이 아니면 해시 없이 거부", async () => {
    roomRow = { id: ROOM, room_type: "open_group", owner_user_id: USER };
    expect(await updateOpenGroupRoomSettings({ userId: USER, roomId: ROOM, joinPolicy: "password", password: "654321" })).toEqual({ ok: true });
    const patch = calls.find((c) => c.op === "update")?.payload as { password_hash?: string };
    expect(patch.password_hash?.startsWith("scrypt$")).toBe(true);
    calls.length = 0;
    const r = await updateOpenGroupRoomSettings({ userId: "33333333-3333-4333-8333-333333333333", roomId: ROOM, joinPolicy: "password", password: "654321" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });
});

describe("P3 잠금 (방·계정 15분 5번까지만 검사)", () => {
  async function pwRoom(pw = "246810") {
    roomRow = {
      id: ROOM,
      room_type: "open_group",
      room_status: "active",
      join_policy: "password",
      identity_policy: "alias_allowed",
      is_readonly: false,
      owner_user_id: "44444444-4444-4444-8444-444444444444",
      member_limit: 100,
      password_hash: await hashOpenGroupPassword(pw),
    };
  }

  it("검사 전에 시도를 센다 → 틀리면 invalid_password (기록 삭제 없음)", async () => {
    await pwRoom();
    rpcResult = { allowed: true, locked_until: null };
    const r = await joinOpenGroupRoomWithPassword({ userId: USER, roomId: ROOM, password: "000000" });
    expect(r).toEqual({ ok: false, error: "invalid_password" });
    expect(rpcCalls).toEqual([{ fn: "cm_open_group_join_begin", args: { p_room: ROOM, p_user: USER } }]);
  });

  it("5번째 시도가 틀리면 password_locked + 잠금 끝 시각", async () => {
    await pwRoom();
    rpcResult = { allowed: true, locked_until: new Date(Date.now() + 15 * 60_000).toISOString() };
    const r = await joinOpenGroupRoomWithPassword({ userId: USER, roomId: ROOM, password: "000000" });
    expect(r.error).toBe("password_locked");
    expect(typeof r.lockedUntil).toBe("string");
  });

  it("DB 가 거부하면(잠금 중·동시 요청 6번째부터) 맞는 비밀번호도 검사·삭제 없이 password_locked", async () => {
    await pwRoom();
    rpcResult = { allowed: false, locked_until: new Date(Date.now() + 5 * 60_000).toISOString() };
    const r = await joinOpenGroupRoomWithPassword({ userId: USER, roomId: ROOM, password: "246810" });
    expect(r.error).toBe("password_locked");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["cm_open_group_join_begin"]);
  });

  it("맞으면 기록을 지운다 (5번째 시도가 맞아도 잠기지 않음)", async () => {
    await pwRoom();
    rpcResult = { allowed: true, locked_until: new Date(Date.now() + 15 * 60_000).toISOString() };
    await joinOpenGroupRoomWithPassword({ userId: USER, roomId: ROOM, password: "246810" });
    expect(rpcCalls.map((c) => c.fn)).toEqual(["cm_open_group_join_begin", "cm_open_group_join_clear"]);
  });

  it("시도 기록 함수가 오류·이상한 값이면 막는다 (fail-closed)", async () => {
    await pwRoom();
    rpcResult = null;
    const r = await joinOpenGroupRoomWithPassword({ userId: USER, roomId: ROOM, password: "246810" });
    expect(r).toEqual({ ok: false, error: "join_lock_check_failed" });
  });

  it("자유 입장 방은 시도 기록 함수 호출이 없다 (요청 수 그대로)", async () => {
    roomRow = { id: ROOM, room_type: "open_group", room_status: "active", join_policy: "free", identity_policy: "alias_allowed", member_limit: 100 };
    await joinOpenGroupRoomWithPassword({ userId: USER, roomId: ROOM });
    expect(calls.some((c) => c.table === "community_messenger_open_group_join_failures")).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("입장 라우트", () => {
  it("password_locked → 429 + Retry-After (이전: 400 만)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/api-session", async () => {
      const actual = await vi.importActual<object>("@/lib/auth/api-session");
      return { ...actual, requireAuthenticatedUserId: async () => ({ ok: true, userId: USER }) };
    });
    vi.doMock("@/lib/http/api-route", async () => {
      const actual = await vi.importActual<object>("@/lib/http/api-route");
      return { ...actual, enforceRateLimit: async () => ({ ok: true }) };
    });
    vi.doMock("@/lib/community-messenger/service", () => ({
      joinOpenGroupRoomWithPassword: async () => ({
        ok: false,
        error: "password_locked",
        lockedUntil: new Date(Date.now() + 600_000).toISOString(),
      }),
    }));
    const { POST } = await import("@/app/api/community-messenger/open-groups/[roomId]/join/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest(`https://x.test/api/community-messenger/open-groups/${ROOM}/join`, { method: "POST", body: JSON.stringify({ password: "x" }) }), {
      params: Promise.resolve({ roomId: ROOM }),
    });
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get("Retry-After"));
    expect(retry).toBeGreaterThan(500);
    expect(retry).toBeLessThanOrEqual(600);
    expect(await res.json()).toMatchObject({ ok: false, error: "password_locked" });
  });
});

describe("잠금 안내 남은 시간 (재감사 L3)", () => {
  it("입장 실패가 password_locked 이면 서버가 준 남은 시간(분)으로 안내 (구조 확인)", async () => {
    const { readFileSync } = await import("node:fs");
    const home = readFileSync("components/community-messenger/CommunityMessengerHome.tsx", "utf8");
    expect(home).toContain('t("nav_messenger_password_locked_minutes", { minutes: Math.max(1, Math.ceil(retryAfterSec / 60)) })');
  });
});

describe("문구 연결", () => {
  it("홈·방 오류 문구가 새 코드 3개를 키로 바꾼다", async () => {
    const { messengerHomeActionErrorMessage } = await import("@/lib/community-messenger/home/messenger-home-action-error-message");
    const t = (k: string) => k;
    expect(messengerHomeActionErrorMessage(t, "password_locked")).toBe("nav_messenger_password_locked");
    expect(messengerHomeActionErrorMessage(t, "password_too_short")).toBe("nav_messenger_password_too_short");
    expect(messengerHomeActionErrorMessage(t, "password_too_long")).toBe("nav_messenger_password_too_long");
  });
});
