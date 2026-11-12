/**
 * R7 목록 표준 — 채팅방 목록·통화 기록 API 쪽 번호 계약 (가짜 DB).
 * - `offset` 이 있으면 `limit`(20/50/100, 그 외 20)·`offset` → `count: "exact"` + `.range()` · 응답 `total`.
 * - 고정 상한 제거: 쪽 번호 모드에서는 keyset `limit(n+1)`·진행 중 통화 상한(100)을 쓰지 않는다.
 * - `offset` 이 없는 기존 호출자(연결 채팅방 카드 등)는 keyset 응답 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; args: unknown[] };
type TableResult = { data: unknown[]; error: null; count?: number | null };

const calls = new Map<string, Call[][]>();
const results = new Map<string, TableResult>();

function builder(table: string) {
  const log: Call[] = [];
  const list = calls.get(table) ?? [];
  list.push(log);
  calls.set(table, list);
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === "then") {
        const r = results.get(table) ?? { data: [], error: null, count: null };
        return (resolve: (v: unknown) => void) => resolve(r);
      }
      return (...args: unknown[]) => {
        log.push({ method: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: (table: string) => builder(table) }),
}));
vi.mock("@/lib/admin/chat-admin/chat-admin-guards", () => ({
  requireChatAdmin: async () => ({ ok: true }),
  requireTradeChatAdmin: async () => ({ ok: true }),
  requireAnyAdminPermission: async () => ({ ok: true }),
}));

import {
  buildAdminChatRoomListApiSearch,
  parseAdminChatListPaging,
  parseAdminChatRoomListQuery,
  withAdminChatListPaging,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { listAdminChatRoomsPaged } from "@/lib/admin-community-messenger/list-admin-rooms-paged";
import { listAdminChatCalls } from "@/lib/admin-community-messenger/list-admin-call-sessions";
import { parseAdminChatCallsQuery } from "@/lib/admin/chat-admin/admin-chat-calls-url-state";
import { GET as roomsGET } from "@/app/api/admin/community-messenger/rooms/route";
import { GET as callsGET } from "@/app/api/admin/community-messenger/calls/route";

const methods = (log: Call[]) => log.map((c) => c.method);
const argsOf = (log: Call[], m: string) => log.filter((c) => c.method === m).map((c) => c.args);
const firstQuery = (table: string) => (calls.get(table) ?? [])[0] ?? [];

function room(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    chat_domain: "group",
    room_type: "group",
    room_status: "active",
    is_readonly: false,
    title: `room ${i}`,
    last_message_at: "2026-10-20T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
  };
}

beforeEach(() => {
  calls.clear();
  results.clear();
});

describe("채팅 목록 URL 쪽 번호", () => {
  it("page/size 파싱 — size 는 20/50/100 만, 그 외 20 · 기본값은 주소에서 생략", () => {
    expect(parseAdminChatListPaging(new URLSearchParams("page=3&size=50"))).toEqual({ page: 3, size: 50 });
    expect(parseAdminChatListPaging(new URLSearchParams("page=-1&size=30"))).toEqual({ page: 1, size: 20 });
    expect(withAdminChatListPaging("?status=active", { page: 1, size: 20 })).toBe("?status=active");
    expect(withAdminChatListPaging("?status=active&page=4", { page: 2, size: 100 })).toBe("?status=active&size=100&page=2");
  });

  it("API 쿼리 — 쪽 번호가 있으면 limit/offset (커서 무시), 없으면 기존 keyset 그대로", () => {
    const q = parseAdminChatRoomListQuery(new URLSearchParams("cursor=2026-10-01T00:00:00Z~abc"));
    expect(buildAdminChatRoomListApiSearch(q, 30, { page: 3, size: 50 })).toBe("?type=all&limit=50&offset=100");
    expect(buildAdminChatRoomListApiSearch(q, 30)).toContain("cursor=");
  });
});

describe("listAdminChatRoomsPaged — 쪽 번호 모드", () => {
  it("count exact + range(offset, offset+limit-1) · total = DB count · keyset limit(n+1) 없음", async () => {
    results.set("community_messenger_rooms", { data: [room(1), room(2)], error: null, count: 137 });
    const page = await listAdminChatRoomsPaged(parseAdminChatRoomListQuery(new URLSearchParams("type=group")), 50, {
      offset: 100,
    });
    const log = firstQuery("community_messenger_rooms");
    expect(argsOf(log, "select")[0]?.[1]).toEqual({ count: "exact" });
    expect(argsOf(log, "range")).toEqual([[100, 149]]);
    expect(methods(log)).not.toContain("limit");
    expect(page.total).toBe(137);
    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("offset 없으면 기존 keyset (limit+1, count 없음, total 없음)", async () => {
    results.set("community_messenger_rooms", { data: [room(1)], error: null });
    const page = await listAdminChatRoomsPaged(parseAdminChatRoomListQuery(new URLSearchParams("")), 30);
    const log = firstQuery("community_messenger_rooms");
    expect(argsOf(log, "limit")).toEqual([[31]]);
    expect(methods(log)).not.toContain("range");
    expect(page.total).toBeUndefined();
  });
});

describe("listAdminChatCalls — 쪽 번호 모드", () => {
  it("진행 중 탭도 상한(100) 대신 range + count · total", async () => {
    results.set("community_messenger_call_sessions", { data: [], error: null, count: 240 });
    const page = await listAdminChatCalls(parseAdminChatCallsQuery(new URLSearchParams("tab=active")), {
      limit: 100,
      offset: 200,
    });
    const log = firstQuery("community_messenger_call_sessions");
    expect(argsOf(log, "select")[0]?.[1]).toEqual({ count: "exact" });
    expect(argsOf(log, "range")).toEqual([[200, 299]]);
    expect(methods(log)).not.toContain("limit");
    expect(page.total).toBe(240);
  });

  it("강제 종료 기록 탭 — range + count", async () => {
    results.set("audit_logs", { data: [], error: null, count: 7 });
    const page = await listAdminChatCalls(parseAdminChatCallsQuery(new URLSearchParams("tab=audits")), {
      limit: 20,
      offset: 0,
    });
    expect(argsOf(firstQuery("audit_logs"), "range")).toEqual([[0, 19]]);
    expect(page.total).toBe(7);
  });

  it("paging 없으면 기존 동작 (진행 중 상한 100 → limit(101))", async () => {
    results.set("community_messenger_call_sessions", { data: [], error: null });
    const page = await listAdminChatCalls(parseAdminChatCallsQuery(new URLSearchParams("tab=active")));
    expect(argsOf(firstQuery("community_messenger_call_sessions"), "limit")).toEqual([[101]]);
    expect(page.total).toBeUndefined();
  });
});

describe("API 라우트 — limit 20/50/100 만 · offset · total", () => {
  const req = (path: string) => {
    const url = new URL(`http://localhost${path}`);
    return { nextUrl: url, url: url.toString() } as unknown as Parameters<typeof roomsGET>[0];
  };

  it("rooms: offset 이 있으면 limit=30 → 20 으로 정리하고 total 반환", async () => {
    results.set("community_messenger_rooms", { data: [], error: null, count: 55 });
    const res = await roomsGET(req("/api/admin/community-messenger/rooms?type=all&limit=30&offset=40"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, total: 55, limit: 20, offset: 40 });
    expect(argsOf(firstQuery("community_messenger_rooms"), "range")).toEqual([[40, 59]]);
  });

  it("rooms: offset 이 없으면 기존 keyset 응답 (nextCursor, total 없음)", async () => {
    results.set("community_messenger_rooms", { data: [], error: null });
    const res = await roomsGET(req("/api/admin/community-messenger/rooms?type=all&limit=30"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, nextCursor: null });
    expect(json.total).toBeUndefined();
  });

  it("calls: offset 이 있으면 limit=100 그대로 · total 반환", async () => {
    results.set("community_messenger_call_sessions", { data: [], error: null, count: 3 });
    const res = await callsGET(req("/api/admin/community-messenger/calls?tab=records&limit=100&offset=0"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, total: 3, limit: 100, offset: 0, tab: "records" });
  });
});
