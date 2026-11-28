/**
 * 고객센터 전체 수정 (2026-11-29) — 서버·DB 결함 동작 시험.
 * 계약 docs/audit/customer-support-full-fix-contract-2026-11-28.md · 결함 docs/audit/customer-support-full-reaudit-2026-11-28.md
 * 실제 서비스·라우트를 메모리 표 위에서 돌린다(DB 함수 = support-rpc-emulator, 20271129100000 SQL 과 같은 규칙).
 * 각 시험은 기준 트리 d2e0fc07f 에서 실패했다(보고서에 기록).
 */
import "@/lib/i18n/admin-catalog";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupportRpcEmulator } from "@/lib/support/__tests__/support-rpc-emulator";

type Row = Record<string, unknown>;

// ── 알림 파이프라인: 넘겨받은 클라이언트의 notification_events 표에 실제로 저장(같은 요청 저장·본문 맞춤을 볼 수 있게) ──
const notifyCalls: { type: string; body: string; deferPush: boolean }[] = [];
const pushCalls: { type: string; body: string }[] = [];
const notifyFail = { remaining: 0 };
vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: vi.fn(
    async (
      sb: { from: (t: string) => { insert: (r: Row) => { select: () => { single: () => Promise<{ data: Row | null }> } } } },
      input: { type: string; userId: string; dedupeKey: string; body: string; title: string; displayPayload: Row },
      opts?: { deferPush?: boolean }
    ) => {
      notifyCalls.push({ type: input.type, body: input.body, deferPush: opts?.deferPush === true });
      if (notifyFail.remaining > 0) {
        notifyFail.remaining -= 1;
        return { ok: false, error: "insert_failed" };
      }
      const { data } = await sb
        .from("notification_events")
        .insert({
          user_id: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          dedupe_key: input.dedupeKey,
          display_payload: input.displayPayload,
          unread: true,
          read_at: null,
        })
        .select()
        .single();
      if (!opts?.deferPush) pushCalls.push({ type: input.type, body: input.body });
      return { ok: true, row: data };
    }
  ),
  dispatchNotificationEvent: vi.fn(async (_sb: unknown, row: { type: string; body: string }) => {
    pushCalls.push({ type: row.type, body: row.body });
    return "sent";
  }),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

// ── 어드민 알림 서비스: 호출만 기록 + 권한 결과 조절 ──
const adminNotifyCalls: { kind: string; dedupeKey: string; recipientAdminIds?: string[]; broadcastPermission?: unknown }[] = [];
const adminReadCalls: { adminUserId: string; kinds?: readonly string[]; workRef?: { id: string } }[] = [];
const authority = { allowed: new Set<string>(), all: true };
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  createAdminNotification: vi.fn(async (_sb: unknown, input: { kind: string; dedupeKey: string; recipientAdminIds?: string[]; broadcastPermission?: unknown }) => {
    adminNotifyCalls.push({
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      recipientAdminIds: input.recipientAdminIds,
      broadcastPermission: input.broadcastPermission,
    });
    return { ok: true, created: 1, skippedRecipients: 0, pushed: 1 };
  }),
  markAdminNotificationsRead: vi.fn(async (_sb: unknown, input: { adminUserId: string; kinds?: readonly string[]; workRef?: { id: string } }) => {
    adminReadCalls.push(input);
    return { ok: true, updated: 0 };
  }),
  resolveAdminNotificationsForWork: vi.fn(async () => 0),
  settleSupportCustomerMessageNotification: vi.fn(async () => undefined),
  authorityAllows: vi.fn((a: { active: boolean; uid?: string }) => a.active),
  resolveAdminRecipientAuthority: vi.fn(async (_sb: unknown, uid: string) =>
    authority.all || authority.allowed.has(uid) ? { active: true, isSuperAdmin: false, permissions: ["support"], uid } : { active: false }
  ),
}));

const storeOwner = { owned: new Set<string>() };
vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: vi.fn(async (_sb: unknown, _uid: string, sid: string) =>
    storeOwner.owned.has(sid) ? { ok: true, store: { id: sid } } : { ok: false, status: 403, error: "forbidden" }
  ),
}));

// ── 라우트 시험용 인증·클라이언트 ──
const current: { sb: unknown; userId: string } = { sb: null, userId: "" };
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: current.userId }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => current.sb }));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: current.userId, isSuperAdmin: false } }),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: vi.fn(async () => undefined) }));

import {
  adminAssignSupportCase,
  adminDeleteSupportMessage,
  adminEditSupportMessage,
  adminReplySupportCase,
  adminSetSupportCasePriority,
  adminUpdateSupportCaseStatus,
  countSupportCasesForRequester,
  listSupportCasesForAdmin,
  listSupportCasesForRequester,
  openSupportCaseFromContext,
  postRequesterSupportMessage,
  reopenSupportCase,
  sumSupportRequesterUnread,
} from "@/lib/support/support-case-service";
import { supportErrorHttpStatus, supportErrorLabel } from "@/lib/support/support-display-labels";
import type { SupportContext } from "@/lib/support/support-context";

function makeDb(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {
    support_cases: [],
    support_messages: [],
    support_sessions: [],
    support_case_events: [],
    notification_events: [],
    admin_notifications: [],
    admin_notification_outbox: [],
    profiles: [],
    stores: [],
    ...seed,
  };
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 11, 1) + ++tick).toISOString();
  const hooks: { beforeUpdate?: (table: string, patch: Row) => void; failSessionInsert?: number; failSessionUpdate?: number } = {};
  const updates: { table: string; patch: Row }[] = [];
  function builder(table: string) {
    const st: {
      op: "select" | "insert" | "update" | "delete";
      filters: ((r: Row) => boolean)[];
      order: [string, boolean] | null;
      limit: number | null;
      range: [number, number] | null;
      count: boolean;
      head: boolean;
      patch: Row | null;
      rows: Row | Row[] | null;
    } = { op: "select", filters: [], order: null, limit: null, range: null, count: false, head: false, patch: null, rows: null };
    const apply = () => {
      let rows = db[table] ?? [];
      for (const f of st.filters) rows = rows.filter(f);
      if (st.order) {
        const [c, asc] = st.order;
        rows = [...rows].sort((a, b) => (String(a[c]) > String(b[c]) ? 1 : -1) * (asc ? 1 : -1));
      }
      if (st.limit != null) rows = rows.slice(0, st.limit);
      return rows;
    };
    const exec = (): { data: unknown; error: { message: string; code?: string } | null; count?: number | null } => {
      if (st.op === "insert") {
        if (table === "support_sessions" && (hooks.failSessionInsert ?? 0) > 0) {
          hooks.failSessionInsert! -= 1;
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
        const ins = (Array.isArray(st.rows) ? st.rows : [st.rows as Row]).map((r) => ({ id: randomUUID(), created_at: now(), ...r }));
        (db[table] ??= []).push(...ins);
        return { data: ins, error: null };
      }
      if (st.op === "update") {
        if (table === "support_sessions" && (hooks.failSessionUpdate ?? 0) > 0) {
          hooks.failSessionUpdate! -= 1;
          throw new Error("connection reset");
        }
        hooks.beforeUpdate?.(table, st.patch!);
        const rows = apply();
        for (const r of rows) Object.assign(r, st.patch);
        updates.push({ table, patch: st.patch! });
        return { data: rows, error: null };
      }
      if (st.op === "delete") {
        const rows = apply();
        db[table] = (db[table] ?? []).filter((r) => !rows.includes(r));
        return { data: rows, error: null };
      }
      const all = apply();
      const paged = st.range ? all.slice(st.range[0], st.range[1] + 1) : all;
      return { data: st.head ? null : paged, error: null, count: st.count ? all.length : null };
    };
    const b = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => {
        if (o?.count === "exact") st.count = true;
        if (o?.head) st.head = true;
        return b;
      },
      insert: (rows: Row | Row[]) => ((st.op = "insert"), (st.rows = rows), b),
      update: (patch: Row) => ((st.op = "update"), (st.patch = patch), b),
      delete: () => ((st.op = "delete"), b),
      eq: (c: string, v: unknown) => {
        const [col, path] = c.split("->>");
        st.filters.push((r) => (path ? (r[col] as Row | null)?.[path] === v : r[c] === v));
        return b;
      },
      neq: (c: string, v: unknown) => (st.filters.push((r) => r[c] !== v), b),
      like: (c: string, p: string) => {
        const prefix = p.endsWith("%") ? p.slice(0, -1) : p;
        st.filters.push((r) => (p.endsWith("%") ? String(r[c] ?? "").startsWith(prefix) : String(r[c] ?? "") === prefix));
        return b;
      },
      lt: (c: string, v: unknown) => (st.filters.push((r) => String(r[c] ?? "") < String(v)), b),
      lte: (c: string, v: unknown) => (st.filters.push((r) => String(r[c] ?? "") <= String(v)), b),
      gt: (c: string, v: unknown) => (st.filters.push((r) => String(r[c] ?? "") > String(v)), b),
      gte: (c: string, v: unknown) => (st.filters.push((r) => String(r[c] ?? "") >= String(v)), b),
      is: (c: string, v: unknown) => (st.filters.push((r) => (r[c] ?? null) === v), b),
      not: (c: string, op: string, v: unknown) => {
        if (op === "is") st.filters.push((r) => (r[c] ?? null) !== v);
        else {
          const vals = String(v).replace(/[()]/g, "").split(",");
          st.filters.push((r) => !vals.includes(String(r[c])));
        }
        return b;
      },
      in: (c: string, vs: unknown[]) => (st.filters.push((r) => vs.includes(r[c])), b),
      or: () => b,
      ilike: () => b,
      order: (c: string, o?: { ascending?: boolean }) => ((st.order ??= [c, o?.ascending !== false]), b),
      range: (f: number, t: number) => ((st.range = [f, t]), b),
      limit: (n: number) => ((st.limit = n), b),
      maybeSingle: async () => {
        const r = exec();
        if (r.error) return { data: null, error: r.error };
        return { data: (r.data as Row[])[0] ?? null, error: null };
      },
      single: async () => {
        const r = exec();
        if (r.error) return { data: null, error: r.error };
        const row = (r.data as Row[])[0];
        return row ? { data: row, error: null } : { data: null, error: { message: "no rows" } };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => new Promise((ok) => ok(exec())).then(res, rej),
    };
    return b;
  }
  const emulate = createSupportRpcEmulator(db, now);
  const rpcCalls: string[] = [];
  const sb = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push(name);
      return emulate(name, args) ?? { data: null, error: { message: `Could not find the function public.${name}` } };
    },
  };
  return { db, sb: sb as never, hooks, updates, rpcCalls };
}

const U = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const ADMIN_B = "33333333-3333-4333-8333-333333333333";
const ctx = (): SupportContext => ({ enabled: true, audience: "MEMBER", category: "ORDER", sourceSurface: "mypage_customer_center" });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
/** 응답 뒤 작업 중 동적 import 가 있는 것(다시 알림)까지 끝나게 */
const settle = () => new Promise<void>((r) => setTimeout(r, 50));
const open = async (sb: never, summary: string, extra: Record<string, unknown> = {}) => {
  const r = await openSupportCaseFromContext(sb, {
    userId: U,
    context: ctx(),
    issueType: "ORDER_STATUS",
    initialSummary: summary,
    initialBody: summary,
    allowMissingIssue: false,
    ...extra,
  });
  await flush();
  if (!r.ok) throw new Error(r.error);
  return r;
};
const jsonReq = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = (caseId: string) => ({ params: Promise.resolve({ caseId }) });

beforeEach(() => {
  notifyCalls.length = 0;
  pushCalls.length = 0;
  notifyFail.remaining = 0;
  adminNotifyCalls.length = 0;
  adminReadCalls.length = 0;
  authority.all = true;
  authority.allowed.clear();
  storeOwner.owned.clear();
  current.sb = null;
  current.userId = U;
});

describe("§1 요청 id 멱등 (S-1·S-2·S-3)", () => {
  it("S-1: 같은 requestId 로 접수를 두 번 보내면 문의·글 1건, 두 번째는 replayed + 같은 created, 어드민 알림 1번", async () => {
    const { db, sb } = makeDb();
    const rid = randomUUID();
    const first = await open(sb, "배송이 안 와요", { clientRequestId: rid });
    const again = await open(sb, "배송이 안 와요", { clientRequestId: rid });
    expect(db.support_cases).toHaveLength(1);
    expect(db.support_messages).toHaveLength(1);
    expect(again.case.id).toBe(first.case.id);
    expect(again.created).toBe(true);
    expect((again as { replayed?: boolean }).replayed).toBe(true);
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied")).toHaveLength(1);
  });

  it("S-1: 접수 라우트는 멱등 확인을 속도 제한보다 먼저 한다 — 한도에 닿은 뒤 같은 requestId 재전송 = 200 replayed (429 아님)", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    const { POST } = await import("@/app/api/support/cases/open/route");
    const rid = randomUUID();
    const body = { context: ctx(), issueType: "ORDER_STATUS", initialSummary: "첫 글", initialBody: "첫 글", requireIssueType: true, requestId: rid };
    const r1 = await POST(jsonReq("http://x/api/support/cases/open", "POST", body));
    expect(r1.status).toBe(200);
    // 그 뒤 고객 글이 한도(1분 5건)만큼 쌓였다
    const caseId = String(db.support_cases[0].id);
    for (let i = 0; i < 5; i += 1) {
      // 시험 시계(2026-12-01) 기준 첫 글 뒤 · 실제 시계 기준 「지난 1분」 안(미래 시각)
      db.support_messages.push({ id: randomUUID(), case_id: caseId, sender_type: "MEMBER", sender_user_id: U, message_type: "PUBLIC", body: `x${i}`, created_at: `2026-12-01T01:00:0${i}.000Z` });
    }
    const r2 = await POST(jsonReq("http://x/api/support/cases/open", "POST", body));
    const j2 = await r2.json();
    expect(r2.status).toBe(200);
    expect(j2).toMatchObject({ ok: true, replayed: true, created: true });
    expect(j2.case.id).toBe(caseId);
  });

  it("S-2: 추가 문의를 같은 requestId 로 다시 보내면 글 1건·어드민 알림 1건, 두 번째는 replayed (라우트 · 속도 제한보다 먼저)", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    adminNotifyCalls.length = 0;
    const { POST } = await import("@/app/api/support/cases/[caseId]/route");
    const rid = randomUUID();
    const r1 = await POST(jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", { body: "추가", requestId: rid }), params(a.case.id));
    expect(r1.status).toBe(200);
    await flush();
    const r2 = await POST(jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", { body: "추가", requestId: rid }), params(a.case.id));
    await flush();
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ ok: true, replayed: true });
    expect(db.support_messages.filter((m) => m.body === "추가")).toHaveLength(1);
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied")).toHaveLength(1);
    expect(db.support_cases[0].admin_unread_count).toBe(2);
  });

  it("S-3: 어드민 답변을 같은 requestId 로 다시 보내면 답변 1건·고객 미읽음 +1·고객 알림 1건", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const rid = randomUUID();
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", clientRequestId: rid });
    await flush();
    const r2 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", clientRequestId: rid });
    await flush();
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect(r2.replayed).toBe(true);
    expect(db.support_messages.filter((m) => m.sender_type === "ADMIN")).toHaveLength(1);
    expect(db.support_cases[0].requester_unread_count).toBe(1);
    expect(notifyCalls.filter((n) => n.type === "support_admin_replied")).toHaveLength(1);
  });

  it("§1: 다른 문의·다른 사람의 글에 쓰인 requestId 는 409 request_id_conflict (남의 글을 돌려주지 않음)", async () => {
    const { sb } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    const rid = randomUUID();
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", clientRequestId: rid });
    const { POST } = await import("@/app/api/support/cases/[caseId]/route");
    const r = await POST(jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", { body: "x", requestId: rid }), params(a.case.id));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("request_id_conflict");
  });
});

describe("§2 접수 한 트랜잭션 (S-4·S-5)", () => {
  it("S-4: 세션 쓰기 경합(23505)이 나도 문의·첫 글이 지워지지 않는다(빈 문의 지우기 경로 없음)", async () => {
    const { db, sb, hooks } = makeDb();
    hooks.failSessionInsert = 1;
    const r = await openSupportCaseFromContext(sb, {
      userId: U, context: ctx(), issueType: "ORDER_STATUS", initialSummary: "첫 글", initialBody: "첫 글", allowMissingIssue: false,
    });
    await flush();
    expect(r.ok).toBe(true);
    expect(db.support_cases).toHaveLength(1);
    expect(db.support_messages).toHaveLength(1);
    if (r.ok) expect(db.support_cases[0].id).toBe(r.case.id);
  });

  it("S-5: 진행 중 문의에 붙는 접수 글도 8000자까지(2000자에서 자르지 않음)", async () => {
    const { db, sb } = makeDb();
    await open(sb, "첫 글");
    const long = "가".repeat(5000);
    const merged = await open(sb, long);
    expect(merged.created).toBe(false);
    const appended = db.support_messages[db.support_messages.length - 1];
    expect(String(appended.body)).toHaveLength(5000);
  });
});

describe("§2 상태 전이 표 (S-15·S-16·S-17)", () => {
  it("S-15: 종료 문의의 우선순위는 바꾸지 않고(case_closed), 같은 값은 쓰기·사건 없음", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    const same = await adminSetSupportCasePriority(sb, { adminUserId: ADMIN, caseId: a.case.id, priority: "NORMAL" });
    expect(same.ok).toBe(true);
    expect(db.support_case_events.filter((e) => e.event_type === "priority_changed")).toHaveLength(0);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const closed = await adminSetSupportCasePriority(sb, { adminUserId: ADMIN, caseId: a.case.id, priority: "URGENT" });
    expect(closed).toEqual({ ok: false, error: "case_closed" });
    expect(db.support_cases[0].priority).toBe("NORMAL");
  });

  it("S-16: 종료 처리 중 세션 정리가 끊겨도(1회 실패) 다시 누르면 세션까지 닫힌다 — 상태·세션·사건이 한 번에", async () => {
    const { db, sb, hooks } = makeDb();
    const a = await open(sb, "x");
    hooks.failSessionUpdate = 1;
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" }).catch(() => null);
    const retry = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(retry.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
    expect(db.support_sessions.every((s) => s.closed_at)).toBe(true);
    expect(db.support_case_events.filter((e) => e.event_type === "status_changed")).toHaveLength(1);
  });

  it("S-17: 재오픈을 두 번 눌러도 두 번째는 성공(이미 진행 중 = 변화 없음) · 사건·고객 알림 1번", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const r1 = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    const r2 = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    await flush();
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(db.support_case_events.filter((e) => e.event_type === "reopened")).toHaveLength(1);
    expect(notifyCalls.filter((n) => n.type === "support_case_reopened")).toHaveLength(1);
  });
});

describe("§3 읽음 = 화면에 보인 것 (A-1)", () => {
  it("A-1 고객: 상세 GET 은 읽기만 — 미읽음·알림 그대로, seen 을 보내야 보여 준 답변까지 읽음", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    if (!reply.ok) throw new Error(reply.error);
    const route = await import("@/app/api/support/cases/[caseId]/route");
    const got = await route.GET(jsonReq(`http://x/api/support/cases/${a.case.id}`, "GET"), params(a.case.id));
    const json = await got.json();
    expect(got.status).toBe(200);
    expect(json.messages.length).toBeGreaterThan(0);
    expect(db.support_cases[0].requester_unread_count).toBe(1);
    expect(db.notification_events.filter((n) => n.unread === true)).toHaveLength(1);
    const seen = await route.POST(
      jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", {
        action: "seen",
        shownMessageIds: json.messages.map((m: { id: string }) => m.id),
        seenLastMessageAt: json.messages[json.messages.length - 1].created_at,
      }),
      params(a.case.id)
    );
    expect(seen.status).toBe(200);
    expect(db.support_cases[0].requester_unread_count).toBe(0);
    expect(db.notification_events.filter((n) => n.unread === true)).toHaveLength(0);
  });

  it("요청 예산: GET 이 needsSeen 을 알려 준다 — 안 읽은 답변·알림이 있으면 true, 다 읽었으면 false(화면은 seen 을 안 보냄)", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    if (!reply.ok) throw new Error(reply.error);
    const route = await import("@/app/api/support/cases/[caseId]/route");
    const get = async () => (await route.GET(jsonReq(`http://x/api/support/cases/${a.case.id}`, "GET"), params(a.case.id))).json();
    expect((await get()).needsSeen).toBe(true);
    // 숫자는 0 인데 그 문의 알림이 안 읽힘(예: 종료·재오픈 안내) → 여전히 true
    db.support_cases[0].requester_unread_count = 0;
    expect((await get()).needsSeen).toBe(true);
    for (const n of db.notification_events) Object.assign(n, { unread: false, read_at: "2026-12-01T00:00:00.000Z" });
    expect((await get()).needsSeen).toBe(false);
  });

  it("A-1 어드민: 상세 GET 은 읽기만(어드민 미읽음 그대로) — seen 이 보여 준 고객 글까지만 읽음", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    current.userId = ADMIN;
    const a = await open(sb, "첫 글");
    const route = await import("@/app/api/admin/support/cases/[caseId]/route");
    const got = await route.GET(jsonReq(`http://x/api/admin/support/cases/${a.case.id}`, "GET"), params(a.case.id));
    const json = await got.json();
    expect(got.status).toBe(200);
    expect(db.support_cases[0].admin_unread_count).toBe(1);
    expect(adminReadCalls).toHaveLength(0);
    // 보여 준 뒤 새 고객 글이 왔다 — seen 은 보여 준 글까지만
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또" });
    await flush();
    const seen = await route.PATCH(
      jsonReq(`http://x/api/admin/support/cases/${a.case.id}`, "PATCH", {
        action: "seen",
        shownMessageIds: json.messages.map((m: { id: string }) => m.id),
        seenLastMessageAt: json.case.last_message_at,
      }),
      params(a.case.id)
    );
    expect(seen.status).toBe(200);
    expect(db.support_cases[0].admin_unread_count).toBe(1);
    expect(adminReadCalls.some((c) => c.adminUserId === ADMIN)).toBe(true);
  });
});

describe("§4 숫자 신호·원장 (A-3·A-4/S-13·S-6·B-3·B-4)", () => {
  it("A-3: 숫자를 바꾸는 seen 은 바뀐 알림 행이 없어도 그 고객의 support_* 알림 행을 UPDATE 한다(FAB 다시 읽기 신호)", async () => {
    const { db, sb, updates } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    // 알림은 다른 곳(알림함)에서 이미 읽었다 — 숫자만 남음
    for (const n of db.notification_events) Object.assign(n, { unread: false, read_at: "2026-12-01T00:00:00.000Z" });
    updates.length = 0;
    const route = await import("@/app/api/support/cases/[caseId]/route");
    const res = await route.POST(
      jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", {
        action: "seen",
        shownMessageIds: db.support_messages.map((m) => m.id),
        seenLastMessageAt: db.support_cases[0].last_message_at,
      }),
      params(a.case.id)
    );
    expect(res.status).toBe(200);
    expect(db.support_cases[0].requester_unread_count).toBe(0);
    expect(updates.filter((u) => u.table === "notification_events").length).toBeGreaterThan(0);
  });

  it("A-4/S-13: 답변 직후(푸시 전) 수정·삭제 — 알림함 행은 응답 전에 이미 있어 수정본·삭제 문구로 맞춰지고, 지운 답변은 푸시하지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "옛 답" });
    if (!r1.ok) throw new Error(r1.error);
    await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r1.message.id, body: "고친 답" });
    await flush();
    const row1 = db.notification_events.find((n) => n.dedupe_key === `support_admin_replied:${r1.message.id}`);
    expect(row1?.body).toBe("고친 답");
    expect(pushCalls.map((p) => p.body)).toEqual(["고친 답"]);

    pushCalls.length = 0;
    const r2 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "지울 답" });
    if (!r2.ok) throw new Error(r2.error);
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r2.message.id });
    await flush();
    const row2 = db.notification_events.find((n) => n.dedupe_key === `support_admin_replied:${r2.message.id}`);
    expect(row2?.body).toBe("support_message_deleted");
    expect(row2?.unread).toBe(false);
    expect(pushCalls).toHaveLength(0);
  });

  it("S-6: 고객 알림 저장이 한 번 실패해도 같은 요청에서 다시 저장한다(응답 전 · 영구 누락 없음)", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    notifyFail.remaining = 1;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    expect(r.ok).toBe(true);
    // 응답 전(아래 flush 전)에 행이 있다
    expect(db.notification_events.filter((n) => n.type === "support_admin_replied")).toHaveLength(1);
    expect(notifyCalls.filter((n) => n.type === "support_admin_replied")).toHaveLength(2);
  });

  it("B-3: 답변 정리 때 이미 어드민 알림 행이 있는 남은 고객 글은 다시 퍼뜨리지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const seenBefore = String(db.support_cases[0].last_message_at);
    const later = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또" });
    await flush();
    if (!later.ok) throw new Error(later.error);
    db.admin_notifications.push({
      id: "an-later", recipient_admin_id: ADMIN_B, kind: "support_customer_replied", work_ref_table: "support_cases",
      work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${later.message.id}`, read_at: null,
    });
    adminNotifyCalls.length = 0;
    // 화면은 첫 글까지만 봤다 → 「또」는 답 못 받은 글로 남는다(알림은 이미 있음)
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", seenLastMessageAt: seenBefore });
    await flush();
    expect(r.ok && r.unseenCustomerMessages).toBe(1);
    expect(adminNotifyCalls.filter((c) => c.dedupeKey === `support_customer_replied:${later.message.id}`)).toHaveLength(0);
  });

  it("B-4: 답변 수정은 그 고객의 알림 행만 고친다(받는 사람 + 키)", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    if (!r.ok) throw new Error(r.error);
    db.notification_events.push({ id: "other", user_id: ADMIN_B, type: "support_admin_replied", dedupe_key: `support_admin_replied:${r.message.id}`, body: "남의 행" });
    await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id, body: "고친 답" });
    expect(db.notification_events.find((n) => n.id === "other")?.body).toBe("남의 행");
    expect(db.notification_events.find((n) => n.user_id === U)?.body).toBe("고친 답");
    const mig = readFileSync(join(process.cwd(), "supabase/migrations/20271129100000_support_full_fix.sql"), "utf8");
    expect(mig).toContain("ON public.admin_notifications (dedupe_key)");
  });
});

describe("수정·삭제 경합 (S-12·S-14)", () => {
  it("S-12: 수정을 읽은 뒤 삭제가 먼저 끝나면 수정은 쓰지 않는다(message_deleted · 지운 답변 본문 그대로)", async () => {
    const { db, sb, hooks } = makeDb();
    const a = await open(sb, "첫 글");
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    if (!r.ok) throw new Error(r.error);
    hooks.beforeUpdate = (table, patch) => {
      if (table === "support_messages" && "edited_at" in patch) {
        hooks.beforeUpdate = undefined;
        db.support_messages.find((m) => m.id === r.message.id)!.deleted_at = "2026-12-01T00:00:00.000Z";
      }
    };
    const edit = await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id, body: "새 문장" });
    expect(edit).toEqual({ ok: false, error: "message_deleted" });
    expect(db.support_messages.find((m) => m.id === r.message.id)?.body).toBe("답");
  });

  it("S-14: 삭제를 동시에 두 번 보내면 한 번만 지운다(사건 1건 · 두 번째 message_deleted)", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    if (!r.ok) throw new Error(r.error);
    const [d1, d2] = await Promise.all([
      adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id }),
      adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id }),
    ]);
    await flush();
    expect([d1.ok, d2.ok].filter(Boolean)).toHaveLength(1);
    expect(db.support_case_events.filter((e) => e.event_type === "message_deleted")).toHaveLength(1);
  });
});

describe("권한·소유 (A-6·A-7·결정 2)", () => {
  it("A-6: 소유를 잃은 매장 문의는 FAB 숫자·목록·개수에서 빠진다(상세와 같은 확인)", async () => {
    const STORE = randomUUID();
    const { sb } = makeDb({
      support_cases: [
        { id: "m1", requester_user_id: U, audience: "MEMBER", owner_store_id: null, status: "WAITING_USER", requester_unread_count: 1, last_message_at: "2026-12-01T00:00:01.000Z" },
        { id: "o1", requester_user_id: U, audience: "OWNER", owner_store_id: STORE, status: "WAITING_USER", requester_unread_count: 4, last_message_at: "2026-12-01T00:00:02.000Z" },
      ],
    });
    expect(await sumSupportRequesterUnread(sb, { userId: U })).toEqual({ ok: true, unread: 1 });
    expect(await sumSupportRequesterUnread(sb, { userId: U, audience: "OWNER", storeId: STORE })).toEqual({ ok: true, unread: 0 });
    const list = await listSupportCasesForRequester(sb, { userId: U, status: "active", paged: true });
    expect(list.ok && list.cases.map((c) => c.id)).toEqual(["m1"]);
    expect(await countSupportCasesForRequester(sb, { userId: U, status: "active" })).toEqual({ ok: true, count: 1 });
    storeOwner.owned.add(STORE);
    expect(await sumSupportRequesterUnread(sb, { userId: U })).toEqual({ ok: true, unread: 5 });
  });

  it("A-7: 재오픈한 문의의 담당자가 지금 support 권한이 없으면 담당을 푼다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN_B });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    authority.all = false;
    authority.allowed.add(ADMIN); // ADMIN_B 는 그사이 권한을 잃었다
    const r = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    expect(r.ok).toBe(true);
    expect(db.support_cases[0].assigned_admin_id).toBeNull();
    if (r.ok) expect(r.case.assigned_admin_id).toBeNull();
  });

  it("결정 2 (A-8·S-11): 재배정 A→B — A 의 그 문의 알림 읽음 + 답 못 받은 고객 글을 B 에게 다시 알림", async () => {
    const { sb } = makeDb();
    const a = await open(sb, "x");
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN });
    await flush();
    adminNotifyCalls.length = 0;
    adminReadCalls.length = 0;
    const r = await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN_B });
    await settle();
    expect(r.ok).toBe(true);
    expect(adminReadCalls).toEqual([
      expect.objectContaining({ adminUserId: ADMIN, kinds: ["support_customer_replied", "support_case_assigned"] }),
    ]);
    const renotified = adminNotifyCalls.filter((c) => c.kind === "support_customer_replied");
    expect(renotified).toHaveLength(1);
    expect(renotified[0].recipientAdminIds).toEqual([ADMIN_B]);
  });

  it("결정 2: 담당 해제 A→없음 — A 의 알림 읽음 + support 어드민 전원에게 다시 알림", async () => {
    const { sb } = makeDb();
    const a = await open(sb, "x");
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN_B });
    await flush();
    adminNotifyCalls.length = 0;
    adminReadCalls.length = 0;
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: null });
    await settle();
    expect(adminReadCalls.map((c) => c.adminUserId)).toEqual([ADMIN_B]);
    const renotified = adminNotifyCalls.filter((c) => c.kind === "support_customer_replied");
    expect(renotified).toHaveLength(1);
    expect(renotified[0].broadcastPermission).toBe("support");
  });
});

describe("정리·오류 코드 (D-1·D-2·E-1·S-8)", () => {
  it("D-1: 죽은 코드 삭제 — 옛 큐 판정·첫 응답 판정 모듈이 없고 죽은 한국어 시드 함수가 없다", () => {
    expect(existsSync(join(process.cwd(), "lib/support/admin-support-queue-policy.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "lib/support/support-first-admin-response.ts"))).toBe(false);
    expect(readFileSync(join(process.cwd(), "lib/support/support-triage-model.ts"), "utf8")).not.toContain("buildShortTriageSeed");
  });

  it("D-2: PATCH status 는 종료(RESOLVED)만 — status ARCHIVED 는 거부(보관은 archive 동작 하나)", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    current.userId = ADMIN;
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const route = await import("@/app/api/admin/support/cases/[caseId]/route");
    const res = await route.PATCH(jsonReq(`http://x/api/admin/support/cases/${a.case.id}`, "PATCH", { action: "status", status: "ARCHIVED" }), params(a.case.id));
    expect(res.status).toBe(409);
    expect(db.support_cases[0].status).toBe("RESOLVED");
    const ok = await route.PATCH(jsonReq(`http://x/api/admin/support/cases/${a.case.id}`, "PATCH", { action: "archive" }), params(a.case.id));
    expect(ok.status).toBe(200);
    expect(db.support_cases[0].status).toBe("ARCHIVED");
  });

  it("D-2: 옛 filter 깊은 링크는 화면 탭과 같은 기준(MEMBER = 답변 필요 탭 + 회원)", async () => {
    const { sb } = makeDb({
      support_cases: [
        { id: "a", audience: "MEMBER", status: "OPEN", last_message_at: "1" },
        { id: "b", audience: "MEMBER", status: "RESOLVED", last_message_at: "2" },
        { id: "c", audience: "OWNER", status: "OPEN", last_message_at: "3" },
      ],
    });
    const r = await listSupportCasesForAdmin(sb, { filter: "MEMBER" });
    expect(r.ok && r.cases.map((c) => c.id)).toEqual(["a"]);
  });

  it("E-1: 서버 저장 실패는 5xx(400 아님) · 고객 API 코드는 모두 전용 문구(일반 오류 아님)", async () => {
    const { sb } = makeDb();
    const a = await open(sb, "x");
    const base = sb as unknown as { from: unknown; rpc: (n: string, x?: Record<string, unknown>) => Promise<unknown> };
    current.sb = { ...base, rpc: async (n: string, x?: Record<string, unknown>) => (n === "support_append_message" ? { data: null, error: { message: "timeout" } } : base.rpc(n, x)) };
    const route = await import("@/app/api/support/cases/[caseId]/route");
    const res = await route.POST(jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", { body: "추가" }), params(a.case.id));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("message_save_failed");
    expect(supportErrorHttpStatus("case_updated")).toBe(409);
    const t = (k: string) => k;
    for (const code of ["invalid_seen_last_message_at", "store_forbidden", "session_failed", "first_message_failed", "message_save_failed", "request_id_conflict"]) {
      expect(supportErrorLabel(t as never, code)).not.toBe("common_error");
    }
  });

  it("S-8 (구조 확인 · DB 함수는 운영 적용 뒤 확인): 재생 SQL 의 담당자 판정 = support 권한 함수(RLS 와 같음), 권한 없는 담당자 문의는 전원으로", () => {
    const mig = readFileSync(join(process.cwd(), "supabase/migrations/20271129100000_support_full_fix.sql"), "utf8");
    const replay = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public.admin_notification_replay_support_replies"));
    expect(replay).toContain("internal.support_admin_has_support_permission(c.assigned_admin_id)");
    expect(replay).not.toContain("internal.is_platform_admin");
    expect(replay).toMatch(/if r\.assignee_ok then[\s\S]*else\s*v_payload := v_payload \|\| jsonb_build_object\('broadcastPermission', 'support'\)/);
  });
});

describe("재감사 2026-11-29 (신호·다시 만들기)", () => {
  it("재감사 1: 숫자 신호는 그 문의의 **읽은** 최근 알림 행을 건드린다(안 읽은 행 UPDATE 는 다른 기기 실시간 필터가 버린다)", async () => {
    const { db, sb, updates } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답1" });
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답2" });
    await flush();
    const rows = db.notification_events.filter((n) => n.type === "support_admin_replied");
    expect(rows).toHaveLength(2);
    const [older, newer] = rows;
    Object.assign(older, { unread: false, read_at: "2026-12-01T00:00:00.000Z", opened_at: null });
    updates.length = 0;
    const route = await import("@/app/api/support/cases/[caseId]/route");
    const res = await route.POST(
      jsonReq(`http://x/api/support/cases/${a.case.id}`, "POST", {
        action: "seen",
        shownMessageIds: [],
        seenLastMessageAt: db.support_cases[0].last_message_at,
      }),
      params(a.case.id)
    );
    expect(res.status).toBe(200);
    expect(db.support_cases[0].requester_unread_count).toBe(0);
    // 읽음 처리 UPDATE(보여 준 답변 없음 = 0행)와 구분: 신호는 unread 를 바꾸지 않는 UPDATE
    const signal = updates.filter((u) => u.table === "notification_events" && !("unread" in u.patch));
    expect(signal).toHaveLength(1);
    // 읽은 행을 같은 read_at 으로 · opened_at 채움 → 클라이언트 필터(read_at 있음) 통과
    expect(signal[0].patch.read_at).toBe("2026-12-01T00:00:00.000Z");
    expect(older.opened_at).toBeTruthy();
    expect(newer.unread).toBe(true);
    expect(newer.read_at ?? null).toBeNull();
  });

  it("재감사 2: 응답 전 저장이 두 번 실패한 뒤 응답 뒤 다시 만들 때 — 그사이 고친 답변이면 지금 본문으로", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    notifyFail.remaining = 2;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "옛 답" });
    if (!r.ok) throw new Error(r.error);
    await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id, body: "고친 답" });
    await settle();
    const rows = db.notification_events.filter((n) => n.dedupe_key === `support_admin_replied:${r.message.id}`);
    expect(rows.map((n) => n.body)).toEqual(["고친 답"]);
  });

  it("재감사 2: 다시 만들기 전에 답변이 지워졌으면 만들지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    notifyFail.remaining = 2;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "지울 답" });
    if (!r.ok) throw new Error(r.error);
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id });
    // 대조: 지우지 않은 다른 답변은 같은 길(저장 2회 실패 → 응답 뒤 다시 만들기)로 만들어진다
    notifyFail.remaining = 2;
    const keep = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "남길 답" });
    if (!keep.ok) throw new Error(keep.error);
    await settle();
    expect(db.notification_events.filter((n) => n.dedupe_key === `support_admin_replied:${r.message.id}`)).toHaveLength(0);
    expect(db.notification_events.filter((n) => n.dedupe_key === `support_admin_replied:${keep.message.id}`)).toHaveLength(1);
  });

  it("재감사 2: 다시 만들기 전에 고객이 이미 봤으면(미읽음 0) 안 읽은 알림 행을 만들지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    notifyFail.remaining = 2;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    if (!r.ok) throw new Error(r.error);
    db.support_cases[0].requester_unread_count = 0; // 고객이 상세를 보고 seen 을 보냈다
    await settle();
    expect(db.notification_events.filter((n) => n.dedupe_key === `support_admin_replied:${r.message.id}` && n.unread === true)).toHaveLength(0);
    // 대조: 아직 안 본 다음 답변은 같은 길로 만들어진다
    notifyFail.remaining = 2;
    const next = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "다음 답" });
    if (!next.ok) throw new Error(next.error);
    await settle();
    expect(db.notification_events.filter((n) => n.dedupe_key === `support_admin_replied:${next.message.id}` && n.unread === true)).toHaveLength(1);
  });
});

describe("재감사 4 — 쓰기 창 진행 중 목록 (GET /api/support/cases?limit=5)", () => {
  it("개수를 세지 않고, 화면 정렬(답변 완료 먼저 → 최근)로 앞 5개 — 6번째 이후의 답변 완료 문의도 들어온다", async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 6; i += 1) {
      rows.push({ id: `open${i}`, requester_user_id: U, audience: "MEMBER", owner_store_id: null, status: "OPEN", requester_unread_count: 0, last_message_at: `2026-12-01T00:00:1${i}.000Z` });
    }
    rows.push({ id: "answered", requester_user_id: U, audience: "MEMBER", owner_store_id: null, status: "WAITING_USER", requester_unread_count: 1, last_message_at: "2026-12-01T00:00:00.000Z" });
    const { sb } = makeDb({ support_cases: rows });
    const base = sb as unknown as { from: (t: string) => unknown; rpc: unknown };
    let caseQueries = 0;
    current.sb = { ...base, from: (t: string) => ((t === "support_cases" ? (caseQueries += 1) : 0), base.from(t)) };
    const { GET } = await import("@/app/api/support/cases/route");
    const res = await GET(jsonReq("http://x/api/support/cases?audience=MEMBER&limit=5", "GET"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.cases.map((c: { id: string }) => c.id)).toEqual(["answered", "open5", "open4", "open3", "open2"]);
    expect(json.counts).toBeUndefined();
    expect(caseQueries).toBe(1);
  });
});
