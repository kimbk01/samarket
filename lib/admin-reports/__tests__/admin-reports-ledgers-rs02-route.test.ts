/**
 * RS-02 · RS-01 (감사 2026-10-30) — 라우트 계약 (가짜 DB).
 * - 전체 신고 현황 커서 모드: 원장 6종 · 권한 없는 원장 제외 + partial · 원장별 page+1 · 건수 합.
 * - 제재 기록 커서 모드: report_actions + sanctions(scope 권한) + user_moderation_events.
 * - 채팅 신고 처리(거래 신고 기각)는 공식 처리 함수 admin_decide_trade_report 로 (정적 계약).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = { table: string; ops: string[]; head: boolean };
const calls: Call[] = [];
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let tables: Record<string, Record<string, unknown>[]> = {};
let actor: Record<string, unknown> = { userId: "admin-1", isSuperAdmin: true, role: "super_admin", permissions: [] };

function fromChain(table: string) {
  const call: Call = { table, ops: [], head: false };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  for (const op of ["in", "not", "eq", "or", "order", "limit", "range", "gte", "lt", "ilike", "maybeSingle"]) {
    chain[op] = (...a: unknown[]) => {
      call.ops.push(`${op}:${JSON.stringify(a)}`);
      return chain;
    };
  }
  chain.select = (_cols: string, opts?: { head?: boolean }) => {
    call.head = opts?.head === true;
    return chain;
  };
  chain.then = (res: (v: unknown) => unknown) => {
    const rows = tables[table] ?? [];
    const limitOp = call.ops.find((o) => o.startsWith("limit:"));
    const n = limitOp ? Number(JSON.parse(limitOp.slice(6))[0]) : rows.length;
    const out = call.head
      ? { data: null, error: null, count: rows.length }
      : { data: rows.slice(0, n), error: null, count: null };
    return Promise.resolve(out).then(res);
  };
  return chain;
}

const fakeSb = {
  rpc: (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve({ data: { total: 0, rows: [] }, error: null });
  },
  from: (name: string) => fromChain(name),
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb: fakeSb, actor }),
}));
vi.mock("@/lib/community-feed/admin-community-reports", () => ({
  enrichCommunityReportRowsForAdmin: async () => [],
}));

import { GET as reportsGET } from "@/app/api/admin/reports/route";
import { GET as ledgerGET } from "@/app/api/admin/reports/sanction-ledger/route";
import { resolveAdminReportLedgers } from "@/lib/admin-reports/admin-reports-unified-page.server";
import { resolveSanctionLedgerSources } from "@/lib/admin-reports/admin-sanction-ledger-query";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const at = (m: number) => `2026-10-30T02:${String(m).padStart(2, "0")}:00.000000+00:00`;

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  tables = {};
  actor = { userId: "admin-1", isSuperAdmin: true, role: "super_admin", permissions: [] };
});

describe("전체 신고 현황 — 원장 6종 커서 모드", () => {
  it("포함 원장 결정: 도메인 필터 · 권한 · 적용 불가 조건 · 대상 유형", () => {
    const all = () => true;
    expect(resolveAdminReportLedgers({ domain: "", targetType: "", reason: "", target: "" }, all).included).toEqual([
      "reports",
      "community_feed",
      "store_reports",
      "meeting_reports",
      "community_messenger_reports",
      "chat_reports",
    ]);
    expect(resolveAdminReportLedgers({ domain: "reports", targetType: "", reason: "", target: "" }, all).included).toEqual([
      "reports",
    ]);
    const noChats = resolveAdminReportLedgers(
      { domain: "", targetType: "", reason: "", target: "" },
      (s) => s !== "community_messenger_reports"
    );
    expect(noChats.included).not.toContain("community_messenger_reports");
    expect(noChats.excluded).toEqual([{ source: "community_messenger_reports", reason: "permission" }]);
    const chatOnly = resolveAdminReportLedgers({ domain: "", targetType: "chat", reason: "", target: "" }, all);
    expect(chatOnly.included).toEqual(["reports", "community_feed", "community_messenger_reports", "chat_reports"]);
    const reason = resolveAdminReportLedgers({ domain: "", targetType: "", reason: "spam", target: "" }, all);
    expect(reason.included).toEqual(["reports", "community_feed"]);
    expect(reason.excluded.every((e) => e.reason === "filter")).toBe(true);
  });

  it("권한 없는 원장(메신저: chats 키 없음)은 조회조차 하지 않고 partial · 건수 = 포함 원장 합 · 원장별 page+1", async () => {
    actor = { userId: "admin-2", isSuperAdmin: false, role: "admin", permissions: ["reports"] };
    tables = {
      store_reports: [
        { id: "s2", status: "open", reporter_user_id: "u1", target_type: "store", target_id: "st1", reason_type: "fraud", created_at: at(5) },
        { id: "s1", status: "actioned", reporter_user_id: "u1", target_type: "product", target_id: "p1", reason_type: "spam", created_at: at(1) },
      ],
      meeting_reports: [{ id: "m1", status: "pending", reporter_user_id: "u2", target_type: "meeting", target_id: "mt", reason_type: "x", created_at: at(3) }],
      chat_reports: [{ id: "c1", status: "triaging", reporter_user_id: "u3", room_id: "r1", reason_type: "abuse", created_at: at(4) }],
      community_messenger_reports: [{ id: "cm1", status: "received", created_at: at(9) }],
      profiles: [],
    };
    const res = await reportsGET(new NextRequest("https://x.test/api/admin/reports?limit=20&cursor="));
    const json = (await res.json()) as {
      ok: boolean;
      total: number;
      partial: boolean;
      nextCursor: string | null;
      sourceCounts: Record<string, number>;
      excludedSources: { source: string; reason: string }[];
      reports: { id: string; ledgerSource: string; ledgerReadOnly?: boolean; status: string; adminDetailHref?: string }[];
    };
    expect(json.ok).toBe(true);
    expect(json.partial).toBe(true);
    expect(json.excludedSources).toEqual([{ source: "community_messenger_reports", reason: "permission" }]);
    expect(calls.some((c) => c.table === "community_messenger_reports")).toBe(false);
    expect(json.reports.map((r) => `${r.ledgerSource}:${r.id}`)).toEqual([
      "store_reports:s2",
      "chat_reports:c1",
      "meeting_reports:m1",
      "store_reports:s1",
    ]);
    expect(json.total).toBe(Object.values(json.sourceCounts).reduce((a, n) => a + n, 0));
    expect(json.total).toBe(4);
    expect(json.nextCursor).toBeNull();
    expect(json.reports.find((r) => r.id === "c1")).toMatchObject({ status: "reviewing", ledgerReadOnly: true });
    expect(json.reports.find((r) => r.id === "s2")?.adminDetailHref).toBe("/admin/store-reports?request=s2");
    // 원장별 page+1 · (created_at DESC, id DESC)
    for (const c of calls.filter((c) => !c.head && c.table !== "profiles")) {
      expect(c.ops).toContain('limit:[21]');
      expect(c.ops).toContain('order:["created_at",{"ascending":false}]');
      expect(c.ops).toContain('order:["id",{"ascending":false}]');
    }
    // 기존 2원장은 원장별 RPC (offset 커서) — 건수 분리
    expect(rpcCalls.map((c) => c.args.p_sources)).toEqual([["reports"], ["community_feed"]]);
    expect(rpcCalls.every((c) => c.args.p_limit === 21 && c.args.p_offset === 0)).toBe(true);
  });

  it("offset 모드(예전 화면 호출)는 그대로 RPC 한 번", async () => {
    await reportsGET(new NextRequest("https://x.test/api/admin/reports?limit=20&offset=0"));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_sources).toEqual(["reports", "community_feed"]);
  });
});

describe("제재 기록 — 원장 3종 커서 모드", () => {
  it("처리 유형 조건이면 report_actions 만 · sanctions 는 scope 권한별", () => {
    expect(resolveSanctionLedgerSources({ actionType: "reject" }, () => true)).toMatchObject({
      included: ["report_actions"],
      excluded: [
        { source: "sanctions", reason: "filter" },
        { source: "user_moderation_events", reason: "filter" },
      ],
    });
    const noCommunity = resolveSanctionLedgerSources({ actionType: null }, (s) => s !== "community");
    expect(noCommunity.included).toEqual(["report_actions", "sanctions", "user_moderation_events"]);
    expect(noCommunity.sanctionScopes).toEqual(["platform", "trade"]);
    expect(noCommunity.excluded).toEqual([{ source: "sanctions", scope: "community", reason: "permission" }]);
  });

  it("병합 · 키 유일 · 건수 합 · 커뮤니티 scope 권한 없음 → partial + scope 조건", async () => {
    actor = { userId: "admin-3", isSuperAdmin: false, role: "admin", permissions: ["users"] };
    tables = {
      report_actions: [{ id: "a1", report_id: "r1", action_type: "reject", action_note: "x", created_by: "admin-9", created_at: at(2) }],
      sanctions: [
        { id: "x1", user_id: "u1", sanction_type: "trade_restriction", restriction: "chat", scope: "trade", reason: "r", created_by: "admin-9", created_at: at(7) },
      ],
      user_moderation_events: [
        { id: "e1", user_id: "u1", actor_id: "admin-9", action: "suspend", from_status: "active", to_status: "suspended", reason: "z", created_at: at(5) },
      ],
      reports: [],
      profiles: [],
    };
    const res = await ledgerGET(new NextRequest("https://x.test/api/admin/reports/sanction-ledger?limit=20&cursor="));
    const json = (await res.json()) as {
      ok: boolean;
      rows: { source: string; action_id: string; action_type: string; source_href: string }[];
      total: number;
      partial: boolean;
      sourceCounts: Record<string, number>;
    };
    expect(json.ok).toBe(true);
    expect(json.rows.map((r) => `${r.source}:${r.action_id}`)).toEqual([
      "sanctions:x1",
      "user_moderation_events:e1",
      "report_actions:a1",
    ]);
    expect(json.rows[0].action_type).toBe("trade_restriction:chat");
    expect(json.rows[0].source_href).toBe("/admin/trade/restrictions?tab=all&userId=u1");
    expect(json.rows[1].source_href).toBe("/admin/users/u1");
    expect(json.total).toBe(3);
    expect(json.sourceCounts).toEqual({ report_actions: 1, sanctions: 1, user_moderation_events: 1 });
    expect(json.partial).toBe(true);
    const sanctionsRead = calls.find((c) => c.table === "sanctions" && !c.head);
    expect(sanctionsRead?.ops).toContain('in:["scope",["platform","trade"]]');
  });
});

describe("RS-01 — 채팅 신고 화면의 거래 신고 처리 = 공식 처리 함수", () => {
  it("기각은 decideTradeReport(admin_decide_trade_report) · 가드 requireTradeAdmin · reports 직접 기각 UPDATE 없음", () => {
    const route = read("app/api/admin/chat/report-queue/action/route.ts");
    expect(route).toContain('rejected: "reject"');
    expect(route).toContain("decideTradeReport(admin.sb");
    expect(route).toContain("notifyAfterTradeReportDecision");
    expect(route).toMatch(/source === "trade_report" \? await requireTradeAdmin\(\)/);
    // 직접 UPDATE 는 함수에 같은 뜻이 없는 검토 시작·처리 완료만 — 처리자 기록 포함
    expect(route).toContain("resolved_by: admin.actor.userId");
    const writer = read("lib/admin/trade-admin/trade-report-decision.ts");
    expect(writer).toContain('"admin_decide_trade_report"');
  });
});
