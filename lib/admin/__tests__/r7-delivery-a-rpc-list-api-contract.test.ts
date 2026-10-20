/**
 * R7 잔여 (delivery_a) — 자동 조치 · 라이더 · 실시간 상황판 큐 · 주문 채팅 목록 API 계약 (가짜 DB).
 * - limit(20/50/100, 그 외 20)·offset → RPC 인자 그대로 · 응답 total = RPC 의 정확한 count.
 * - 고정 상한 경로 없음: 테이블 직접 조회(`.from(...).limit(N)`)·메모리 자르기 없이 RPC 한 번.
 * - 다른 호출자 호환: `/api/admin/delivery-riders` 는 파라미터가 없으면 예전 스냅샷 응답 그대로.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type RpcCall = { fn: string; args: Record<string, unknown> };

const h = vi.hoisted(() => ({
  sb: null as unknown,
}));

function fakeSb(handlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>) {
  const rpcCalls: RpcCall[] = [];
  const fromCalls: string[] = [];
  const sb = {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      const hdl = handlers[fn];
      return hdl ? hdl(args) : { data: null, error: { message: `function public.${fn} does not exist` } };
    },
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error(`unexpected table read: ${table}`);
    },
  };
  return { sb, rpcCalls, fromCalls };
}

vi.mock("@/lib/admin/require-admin-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAdminApiUser: async () => ({ ok: true, userId: "11111111-1111-1111-1111-111111111111" }),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => h.sb }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => h.sb }));
vi.mock("@/lib/admin/chat-admin/chat-admin-guards", () => ({
  requireAnyAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1", isSuperAdmin: true } }),
}));

import { NextRequest } from "next/server";
import { GET as autoActionsGET } from "@/app/api/admin/delivery-auto-actions/route";
import { GET as ridersGET } from "@/app/api/admin/delivery-riders/route";
import { GET as opsQueueGET } from "@/app/api/admin/ops-console/queue/route";
import { GET as orderChatsGET } from "@/app/api/admin/order-chats/route";
import { manilaTodayRangeUtc } from "@/lib/admin/metrics/manila-period";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const RULE = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  h.sb = null;
});

describe("자동 조치 /api/admin/delivery-auto-actions", () => {
  it("limit/offset·필터 → admin_delivery_auto_actions_page 인자 · total · 오늘만 = 필리핀 오늘 경계(DB 필터)", async () => {
    const db = fakeSb({
      admin_delivery_auto_actions_page: () => ({
        data: { total: 1234, rows: [{ id: "a1", event_id: "e1", order_id: "o1", order_no: "N-1", action_status: "failed" }] },
        error: null,
      }),
      admin_delivery_auto_actions_dashboard: () => ({ data: { kpi: { pending_total: 3 }, actions: [{ id: "x" }] }, error: null }),
    });
    h.sb = db.sb;
    const res = await autoActionsGET(
      new Request(
        `https://x.test/api/admin/delivery-auto-actions?limit=50&offset=100&status=failed&rule_id=${RULE}&dangerous_only=1&retry_only=1&today_only=1`
      )
    );
    const json = (await res.json()) as Record<string, any>;
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ total: 1234, limit: 50, offset: 100 });
    expect(json.actions).toHaveLength(1);
    expect(json.actions[0]).toMatchObject({ id: "a1", admin_order_url: "/admin/stores/orders/o1" });
    // 대시보드 KPI 는 유지, 그 안의 actions 는 페이지 행으로 교체
    expect(json.dashboard).toMatchObject({ kpi: { pending_total: 3 } });
    expect(json.dashboard.actions.map((a: { id: string }) => a.id)).toEqual(["a1"]);

    const page = db.rpcCalls.find((c) => c.fn === "admin_delivery_auto_actions_page")!;
    const today = manilaTodayRangeUtc();
    expect(page.args).toEqual({
      p_status: "failed",
      p_rule_id: RULE,
      p_dangerous_only: true,
      p_retry_only: true,
      p_from: today.fromIso,
      p_to: today.toIso,
      p_limit: 50,
      p_offset: 100,
    });
    expect(db.fromCalls).toEqual([]);
  });

  it("limit 200 → 20 (페이지 크기 20/50/100) · 오늘만 아님 → 기간 null · 잘못된 rule_id 무시", async () => {
    const db = fakeSb({
      admin_delivery_auto_actions_page: () => ({ data: { total: 0, rows: [] }, error: null }),
    });
    h.sb = db.sb;
    const res = await autoActionsGET(new Request("https://x.test/api/admin/delivery-auto-actions?limit=200&rule_id=nope"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ total: 0, limit: 20, offset: 0, dashboard: null });
    const page = db.rpcCalls.find((c) => c.fn === "admin_delivery_auto_actions_page")!;
    expect(page.args).toMatchObject({ p_limit: 20, p_offset: 0, p_from: null, p_to: null, p_rule_id: null, p_status: null });
  });

  it("목록 RPC 미적용 → 503 rpc_missing (잘린 legacy 목록으로 대체하지 않음)", async () => {
    h.sb = fakeSb({}).sb;
    const res = await autoActionsGET(new Request("https://x.test/api/admin/delivery-auto-actions"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "rpc_missing" });
  });

  it("소스: 고정 상한·메모리 오늘 필터 없음", () => {
    const src = read("app/api/admin/delivery-auto-actions/route.ts");
    expect(src).not.toMatch(/\.limit\(/);
    expect(src).not.toContain("Math.min(200");
    expect(src).not.toMatch(/\.filter\(\(a\) => \{\s*if \(!p_today_only\)/);
    const page = read("components/admin/delivery-alerts/AdminDeliveryAutoActionsPage.tsx");
    expect(page).toContain("lq.apiQueryString");
    expect(page).toContain("<AdminPagination");
    expect(page).not.toContain('qs.set("limit", "100")');
  });
});

describe("라이더 /api/admin/delivery-riders", () => {
  it("파라미터 없음 → 기존 스냅샷 응답 그대로 (이전 호출자 호환)", async () => {
    const snap = { generated_at: "t", riders: [{ id: "r1" }], unassigned_deliveries: [{ order_id: "o1" }] };
    const db = fakeSb({ admin_delivery_riders_operations_snapshot: () => ({ data: snap, error: null }) });
    h.sb = db.sb;
    const res = await ridersGET(new Request("https://x.test/api/admin/delivery-riders"));
    expect(await res.json()).toEqual(snap);
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["admin_delivery_riders_operations_snapshot"]);
  });

  it("view=queue&limit=50&offset=50 → admin_delivery_riders_page 인자 · total · 전체 건수", async () => {
    const db = fakeSb({
      admin_delivery_riders_page: () => ({
        data: {
          view: "queue",
          total: 260,
          rows: [{ order_id: "o51" }],
          riders_total: 130,
          unassigned_total: 260,
          suspended_count: 4,
          flagged_count: 7,
          generated_at: "g",
        },
        error: null,
      }),
    });
    h.sb = db.sb;
    const res = await ridersGET(new Request("https://x.test/api/admin/delivery-riders?view=queue&limit=50&offset=50"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      view: "queue",
      total: 260,
      limit: 50,
      offset: 50,
      riders_total: 130,
      unassigned_total: 260,
      suspended_count: 4,
      flagged_count: 7,
    });
    expect(db.rpcCalls).toEqual([
      { fn: "admin_delivery_riders_page", args: { p_view: "queue", p_q: null, p_limit: 50, p_offset: 50 } },
    ]);
  });

  it("view=assignable&q=… → 서버 검색 · 알 수 없는 view → riders · limit 30 → 20", async () => {
    const db = fakeSb({ admin_delivery_riders_page: () => ({ data: { total: 0, rows: [] }, error: null }) });
    h.sb = db.sb;
    await ridersGET(new Request("https://x.test/api/admin/delivery-riders?view=assignable&limit=100&q=%20kim%20"));
    await ridersGET(new Request("https://x.test/api/admin/delivery-riders?view=bogus&limit=30"));
    expect(db.rpcCalls.map((c) => c.args)).toEqual([
      { p_view: "assignable", p_q: "kim", p_limit: 100, p_offset: 0 },
      { p_view: "riders", p_q: null, p_limit: 20, p_offset: 0 },
    ]);
  });

  it("화면: 탭별 서버 페이지 · 배정 후보는 assignable 서버 검색 · 정지/주의 수는 서버 count", () => {
    const src = read("components/admin/delivery-riders/AdminDeliveryRidersPage.tsx");
    expect(src).toContain('qs.set("view", tab)');
    expect(src).toContain('view: "assignable"');
    expect(src).toContain("<AdminPagination");
    expect(src).not.toContain("riders.filter((r) => r.suspended_at).length");
  });
});

describe("실시간 상황판 큐 /api/admin/ops-console/queue", () => {
  it("tab·focus·group·limit/offset·관리자 → admin_ops_console_queue_page 인자 · total · 탭/큐 건수", async () => {
    const db = fakeSb({
      admin_ops_console_queue_page: () => ({
        data: {
          total: 362,
          rows: [{ order_id: "o1", group_key: "s1", group_total: 41, group_top_score: 1600, priority_score: 1600 }],
          tab_counts: { risk: 362, sla: 144, riders: 267, settlements: 156, incidents: 118 },
          queue_counts: { long_delivering: 88 },
        },
        error: null,
      }),
    });
    h.sb = db.sb;
    const res = await opsQueueGET(
      new NextRequest(new URL("https://x.test/api/admin/ops-console/queue?tab=riders&focus=mine&group=rider&limit=100&offset=200"))
    );
    const json = (await res.json()) as Record<string, any>;
    expect(json).toMatchObject({ ok: true, total: 362, limit: 100, offset: 200 });
    expect(json.tab_counts.riders).toBe(267);
    expect(json.queue_counts.long_delivering).toBe(88);
    expect(db.rpcCalls).toEqual([
      {
        fn: "admin_ops_console_queue_page",
        args: {
          p_tab: "riders",
          p_focus: "mine",
          p_group: "rider",
          p_viewer: "11111111-1111-1111-1111-111111111111",
          p_limit: 100,
          p_offset: 200,
        },
      },
    ]);
  });

  it("알 수 없는 값 → 기본 (risk·all·store·20)", async () => {
    const db = fakeSb({ admin_ops_console_queue_page: () => ({ data: { total: 0, rows: [] }, error: null }) });
    h.sb = db.sb;
    await opsQueueGET(new NextRequest(new URL("https://x.test/api/admin/ops-console/queue?tab=x&focus=y&group=z&limit=7")));
    expect(db.rpcCalls[0]!.args).toMatchObject({ p_tab: "risk", p_focus: "all", p_group: "store", p_limit: 20, p_offset: 0 });
  });

  it("소스: 요약 API 의 600건 보강 조회 제거 · 화면의 120건 합치기·그룹 40건 자르기 제거 · 15초 자동 갱신 유지", () => {
    const summary = read("app/api/admin/ops-console/summary/route.ts");
    expect(summary).not.toContain(".limit(600)");
    expect(summary).not.toContain("augmentQueuesWithIds");
    expect(summary).toContain("manilaLastNDaysRangeUtc(days)");
    const page = read("components/admin/ops-console/AdminOpsConsolePage.tsx");
    expect(page).not.toContain(".slice(0, 40)");
    expect(page).not.toContain("out.length >= 120");
    expect(page).not.toContain(".slice(0, 80)");
    expect(page).toContain("/api/admin/ops-console/queue?");
    expect(page).toContain("<AdminPagination");
    expect(page).toContain("useAdminAutoRefresh(load, { intervalMs: 15_000");
  });
});

describe("주문 채팅 /api/admin/order-chats", () => {
  it("q·limit/offset → admin_store_order_chats_page 인자 · total · 행 모양 유지 (연결 방 + 주문 키로 찾은 방)", async () => {
    const db = fakeSb({
      admin_store_order_chats_page: () => ({
        data: {
          total: 808,
          rows: [
            {
              order_id: "o1",
              order_no: "N-1",
              room_id: "r1",
              room_source: "linked",
              store_id: "s1",
              store_name: "Store",
              buyer_user_id: "u1",
              buyer_nickname: "Kim",
              order_status: "completed",
              last_message: "hi",
              last_message_at: "2026-10-20T00:00:00Z",
            },
            {
              order_id: "o2",
              order_no: "N-2",
              room_id: "r2",
              room_source: "fallback",
              store_id: "s1",
              store_name: null,
              buyer_user_id: "u2",
              buyer_username: "lee",
              order_status: "pending",
              last_message: null,
              last_message_at: null,
              order_updated_at: "2026-10-19T00:00:00Z",
            },
          ],
        },
        error: null,
      }),
    });
    h.sb = db.sb;
    const res = await orderChatsGET(new Request("https://x.test/api/admin/order-chats?limit=50&offset=150&q=%20N-1%20"));
    const json = (await res.json()) as Record<string, any>;
    expect(json).toMatchObject({ ok: true, domain: "store_order", total: 808, limit: 50, offset: 150 });
    expect(json.rows).toEqual([
      {
        orderId: "o1",
        orderNo: "N-1",
        roomId: "r1",
        storeId: "s1",
        storeLabel: "Store",
        customerUserId: "u1",
        customerLabel: "Kim",
        orderStatus: "completed",
        domainIdentityKey: "store_order:o1",
        lastMessage: "hi",
        lastMessageAt: "2026-10-20T00:00:00Z",
        roomSource: "linked",
      },
      {
        orderId: "o2",
        orderNo: "N-2",
        roomId: "r2",
        storeId: "s1",
        storeLabel: "s1",
        customerUserId: "u2",
        customerLabel: "lee",
        orderStatus: "pending",
        domainIdentityKey: "store_order:o2",
        lastMessage: "-",
        lastMessageAt: "2026-10-19T00:00:00Z",
        roomSource: "fallback",
      },
    ]);
    expect(db.rpcCalls).toEqual([
      { fn: "admin_store_order_chats_page", args: { p_q: "N-1", p_limit: 50, p_offset: 150 } },
    ]);
    expect(db.fromCalls).toEqual([]);
  });

  it("파라미터 없음 → 첫 페이지 20건 (전체는 total 로 넘김) · 소스에 200건 이중 조회·메모리 자르기 없음", async () => {
    const db = fakeSb({ admin_store_order_chats_page: () => ({ data: { total: 0, rows: [] }, error: null }) });
    h.sb = db.sb;
    await orderChatsGET(new Request("https://x.test/api/admin/order-chats"));
    expect(db.rpcCalls[0]!.args).toEqual({ p_q: null, p_limit: 20, p_offset: 0 });
    const lister = read("lib/admin-delivery-orders/list-admin-store-order-chats.ts");
    expect(lister).not.toMatch(/\.slice\(0, capped\)/);
    expect(lister).not.toContain(".limit(capped)");
    const list = read("components/admin/delivery-orders/AdminOrderChatList.tsx");
    expect(list).toContain("/api/admin/order-chats?${apiQuery}");
    expect(list).not.toContain("ORDER_CHAT_PAGE_SIZE");
    expect(list).toContain("<AdminPagination");
  });
});

describe("마이그레이션 계약 (20270601130000~133000)", () => {
  const files = [
    ["supabase/migrations/20270601130000_r7_delivery_auto_actions_page.sql", "admin_delivery_auto_actions_page"],
    ["supabase/migrations/20270601131000_r7_delivery_riders_page.sql", "admin_delivery_riders_page"],
    ["supabase/migrations/20270601132000_r7_ops_console_queue_page.sql", "admin_ops_console_queue_page"],
    ["supabase/migrations/20270601133000_r7_store_order_chats_page.sql", "admin_store_order_chats_page"],
  ] as const;

  it.each(files)("%s — SECURITY DEFINER · search_path · service_role 만 · 롤백 주석 · total+rows", (file, fn) => {
    const sql = read(file);
    expect(sql).toContain(`create or replace function public.${fn}(`);
    expect(sql).toMatch(/security definer\s+set search_path = public/);
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon, authenticated;`));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to service_role;`));
    expect(sql).toContain(`-- 롤백:`);
    expect(sql).toContain(`drop function if exists public.${fn}(`);
    expect(sql).toContain("'total'");
    expect(sql).toContain("'rows'");
    expect(sql).toContain("least(100, greatest(1, coalesce(p_limit, 20)))");
    // 전체 결과를 자르는 고정 상한 없음 (활성 주문 미리보기 5건·방 1건 조회만 허용)
    expect(sql.match(/\blimit\s+\d+/gi)?.filter((m) => !/limit\s+[15]$/i.test(m)) ?? []).toEqual([]);
  });
});
