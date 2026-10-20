/**
 * R7 — 채팅 신고 처리함 서버 페이지 계약.
 * 3원천 병합·정렬·페이지·total 은 RPC 한 번 (`admin_chat_report_queue_page`), 닉네임 후보 상한 없음.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
let rpcPayload: unknown = { total: 0, rows: [] };

function fromChain(name: string) {
  const call: Call = { kind: "from", name, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "in", "eq", "or", "order", "limit", "range"]) {
    chain[op] = (...a: unknown[]) => {
      call.ops.push(`${op}:${JSON.stringify(a)}`);
      return chain;
    };
  }
  chain.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({
      data: name === "profiles" ? [{ id: "u-reporter", nickname: "신고자", username: null }] : [],
      error: null,
    }).then(res);
  return chain;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args, ops: [] });
      return Promise.resolve({ data: rpcPayload, error: null });
    },
    from: (name: string) => fromChain(name),
  }),
}));

import {
  CHAT_REPORT_QUEUE_RPC,
  listChatReportQueue,
} from "@/lib/admin-chat-reports/list-chat-report-queue";
import { parseChatReportQueueQuery } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

beforeEach(() => {
  calls.length = 0;
  rpcPayload = { total: 0, rows: [] };
});

describe("채팅 신고 큐 — R7 서버 페이지", () => {
  it("passes limit/offset + status groups to one RPC and returns the DB total", async () => {
    rpcPayload = {
      total: 437,
      rows: [
        {
          source: "messenger",
          id: "m1",
          created_at: "2026-10-19T10:00:00Z",
          raw_status: "received",
          target_type: "room",
          reason_code: "spam",
          reason_detail: "x",
          room_id: "r1",
          reporter_id: "u-reporter",
          reported_user_id: null,
          admin_note: "",
        },
        {
          source: "trade_report",
          id: "t1",
          created_at: "2026-10-19T09:00:00Z",
          raw_status: "resolved",
          target_type: "chat_room",
          target_id: "room-x",
          reason_code: "abuse",
          reporter_id: "u-reporter",
          handled_at: "2026-10-19T11:00:00Z",
        },
      ],
    };
    const q = parseChatReportQueueQuery(new URLSearchParams("status=open"));
    const page = await listChatReportQueue(q, { limit: 50, offset: 100 });
    const rpc = calls.find((c) => c.kind === "rpc");
    expect(rpc?.name).toBe(CHAT_REPORT_QUEUE_RPC);
    expect(rpc?.args).toMatchObject({
      p_sources: ["messenger", "trade_chat", "trade_report"],
      p_statuses: {
        messenger: ["received", "reviewing"],
        trade_chat: ["received", "triaging", "escalated"],
        trade_report: ["pending", "reviewing"],
      },
      p_asc: true,
      p_limit: 50,
      p_offset: 100,
      p_q: null,
      p_target: null,
    });
    expect(page.total).toBe(437);
    expect(page.limit).toBe(50);
    expect(page.offset).toBe(100);
    expect(page.nextCursor).toBeNull();
    expect(page.failedSources).toEqual([]);
    expect(page.rows.map((r) => r.key)).toEqual(["messenger:m1", "trade_report:t1"]);
    expect(page.rows[0]).toMatchObject({ roomKind: "cm", bucket: "received", reporterLabel: "신고자" });
    expect(page.rows[1]).toMatchObject({
      roomId: "room-x",
      roomKind: "legacy_trade",
      bucket: "resolved",
      handledAt: "2026-10-19T11:00:00Z",
    });
  });

  it("nickname search goes into the RPC — no profiles candidate pre-query with a cap", async () => {
    const q = parseChatReportQueueQuery(new URLSearchParams("q=nick&status=all"));
    await listChatReportQueue(q, { limit: 20, offset: 0 });
    const rpc = calls.find((c) => c.kind === "rpc");
    expect(rpc?.args).toMatchObject({ p_q: "nick", p_statuses: null });
    // 목록 원천 테이블을 직접 읽지 않고, 프로필 후보 조회(limit)도 하지 않는다.
    expect(calls.filter((c) => c.kind === "from")).toEqual([]);
  });

  it("uuid search becomes the target filter; non-trade domain keeps messenger only", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const q = parseChatReportQueueQuery(new URLSearchParams(`q=${id}&domain=group`));
    await listChatReportQueue(q, { limit: 20, offset: 0 });
    expect(calls.find((c) => c.kind === "rpc")?.args).toMatchObject({
      p_target: id,
      p_q: null,
      p_domain: "group",
      p_sources: ["messenger"],
    });
  });

  it("loader has no fixed fetch cap / candidate limit", () => {
    const src = read("lib/admin-chat-reports/list-chat-report-queue.ts");
    expect(src).not.toMatch(/\.limit\(\s*\d+\s*\)/);
    expect(src).not.toMatch(/FETCH_EXTRA/);
  });

  it("migration: service_role only, deterministic order, exact count", () => {
    const sql = read("supabase/migrations/20270601100000_r7_admin_chat_report_queue_page.sql");
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_chat_report_queue_page[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_chat_report_queue_page[\s\S]*TO service_role/);
    expect(sql).toMatch(/'total', \(SELECT count\(\*\) FROM unioned\)/);
    expect(sql).toMatch(/COLLATE "C"/);
  });

  it("API parses limit/offset (max 100) and keeps the response shape", () => {
    const route = read("app/api/admin/chat/report-queue/route.ts");
    expect(route).toMatch(/parseAdminListPage\(sp, \{ defaultLimit: 20, maxLimit: CHAT_REPORT_QUEUE_MAX_LIMIT \}\)/);
    expect(route).toMatch(/CHAT_REPORT_QUEUE_MAX_LIMIT = 100/);
  });

  it("URL model: page/size round-trip, defaults omitted", async () => {
    const { buildChatReportQueueSearch } = await import("@/lib/admin/chat-admin/admin-chat-report-queue-model");
    const parsed = parseChatReportQueueQuery(new URLSearchParams("page=3&size=50"));
    expect(parsed).toMatchObject({ page: 3, size: 50 });
    expect(parseChatReportQueueQuery(new URLSearchParams("page=-1&size=7"))).toMatchObject({ page: 1, size: 20 });
    expect(buildChatReportQueueSearch({ source: "all", status: "open", page: 1, size: 20 })).toBe("");
    expect(buildChatReportQueueSearch({ source: "all", status: "open", page: 2, size: 100 })).toBe("?size=100&page=2");
  });
});
