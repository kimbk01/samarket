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

/** 응답 뒤 작업(Next `after`) — 모아 두었다가 flush·settle 에서 실행(요청 안 호출 수와 나눠 잰다) */
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (task: (() => unknown) | Promise<unknown>) => {
    afterQueue.push(typeof task === "function" ? task : () => task);
  },
}));
async function drainAfter() {
  for (let i = 0; i < 20 && afterQueue.length > 0; i += 1) {
    const tasks = afterQueue.splice(0);
    await Promise.all(tasks.map((t) => Promise.resolve().then(t).catch(() => undefined)));
  }
}

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
const authority = { allowed: new Set<string>(), all: true, unknown: new Set<string>() };
/** 담당자 1명에게 보낸 알림의 결과 흉내 — unknown = 프로필을 못 읽음 · revoked = 권한 잃음 확인 */
const assigneeOutcome: { uid: string; kind: "unknown" | "revoked" | null } = { uid: "", kind: null };
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  createAdminNotification: vi.fn(async (_sb: unknown, input: { kind: string; dedupeKey: string; recipientAdminIds?: string[]; broadcastPermission?: unknown }) => {
    adminNotifyCalls.push({
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      recipientAdminIds: input.recipientAdminIds,
      broadcastPermission: input.broadcastPermission,
    });
    if (assigneeOutcome.kind && input.recipientAdminIds?.includes(assigneeOutcome.uid)) {
      return { ok: true, created: 0, skippedRecipients: 1, revokedRecipients: assigneeOutcome.kind === "revoked" ? 1 : 0, pushed: 0 };
    }
    return { ok: true, created: 1, skippedRecipients: 0, revokedRecipients: 0, pushed: 1 };
  }),
  markAdminNotificationsRead: vi.fn(async (_sb: unknown, input: { adminUserId: string; kinds?: readonly string[]; workRef?: { id: string } }) => {
    adminReadCalls.push(input);
    return { ok: true, updated: 0 };
  }),
  resolveAdminNotificationsForWork: vi.fn(async () => 0),
  settleSupportCustomerMessageNotification: vi.fn(async () => undefined),
  authorityAllows: vi.fn((a: { active: boolean; uid?: string }) => a.active),
  authorityConfirmedLoss: vi.fn((a: { active: boolean; unknown?: boolean }) => !a.active && !a.unknown),
  resolveAdminRecipientAuthority: vi.fn(async (_sb: unknown, uid: string) =>
    authority.unknown.has(uid)
      ? { active: false, unknown: true }
      : authority.all || authority.allowed.has(uid)
        ? { active: true, isSuperAdmin: false, permissions: ["support"], uid }
        : { active: false }
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
  listSupportCasesForAdmin,
  listSupportCasesForRequester,
  openSupportCaseFromContext,
  postRequesterSupportMessage,
  reopenSupportCase,
  requesterCloseSupportCase,
  sumSupportRequesterUnread,
} from "@/lib/support/support-case-service";
import { supportErrorHttpStatus, supportErrorLabel } from "@/lib/support/support-display-labels";
import type { SupportContext } from "@/lib/support/support-context";

/** 요청 예산 측정 — DB 호출(from·rpc) 기록. 흉내 낸 모듈의 실제 호출 수는 아래 `measure` 가 더한다. */
const callLog: string[] = [];
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
  const hooks: {
    beforeUpdate?: (table: string, patch: Row) => void;
    failSessionInsert?: number;
    failSessionUpdate?: number;
    /** 다음 N번의 그 표 읽기(select)를 실패시킨다 */
    failSelect?: { table: string; n: number };
  } = {};
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
      if (hooks.failSelect && hooks.failSelect.table === table && hooks.failSelect.n > 0) {
        hooks.failSelect.n -= 1;
        return { data: null, error: { message: "temporary read failure" } };
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
    from: (t: string) => {
      callLog.push(`from:${t}`);
      return builder(t);
    },
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      callLog.push(`rpc:${name}`);
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
const flush = async () => {
  await new Promise<void>((r) => setTimeout(r, 0));
  await drainAfter();
  await new Promise<void>((r) => setTimeout(r, 0));
};
// 응답 뒤 다시 알림이 쓰는 동적 import 를 미리 불러 둔다 — 시험 안에서는 이미 불러온 모듈이라 바로 풀린다(시간 대기에 기대지 않음)
await import("@/lib/support/support-released-case-renotify");
/**
 * 응답 뒤 작업 중 동적 import 가 있는 것(다시 알림)까지 끝나게 — 고정 대기(50ms)는 부하가 크면 모자라 시험이 흔들렸다.
 * 응답 뒤 작업이 더 생기지 않을 때까지(조용한 차례 5번 연속) 최대 3초 기다린다.
 */
const settle = async () => {
  let quiet = 0;
  let last = -1;
  for (let i = 0; i < 300 && quiet < 5; i += 1) {
    await new Promise<void>((r) => setTimeout(r, 10));
    await drainAfter();
    const n = adminNotifyCalls.length + adminReadCalls.length + notifyCalls.length;
    quiet = n === last ? quiet + 1 : 0;
    last = n;
  }
};
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
  authority.unknown.clear();
  assigneeOutcome.uid = "";
  assigneeOutcome.kind = null;
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

describe("재감사 3차 — 종료·재오픈을 다시 눌러도(변화 없음) 고객 알림을 다시 만들지 않는다", () => {
  it("보관 해제 뒤 오래된 탭의 「상담 종료」 = 고객에게 처음 보는 종료 알림 없음", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    const closed = await requesterCloseSupportCase(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: null });
    expect(closed.ok).toBe(true);
    // 보관 → 보관 해제(사건 모양이 어드민 종료와 같다) → 오래된 탭의 「상담 종료」(변화 없음)
    expect((await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "ARCHIVED" })).ok).toBe(true);
    expect((await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" })).ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED", mode: "close" });
    await flush();
    expect(db.notification_events.filter((n) => n.type === "support_case_resolved")).toHaveLength(0);
  });

  it("재오픈 뒤 글이 오고 오래된 탭에서 「재오픈」 = 재오픈 알림 1건 그대로", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또" });
    await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    await flush();
    expect(db.notification_events.filter((n) => n.type === "support_case_reopened")).toHaveLength(1);
  });
});

describe("재감사 4차 — 종료·재오픈 고객 알림 안전망(같은 트랜잭션의 대기열 행)", () => {
  it("종료: DB 함수만 커밋되고 앱이 알림 전에 끊겨도 → 대기열 행(앱과 같은 키) → 작업자가 1건 만든다 · 다시 꺼내도 1건", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await flush();
    // 앱 쪽(알림 저장) 없이 DB 함수만 = 끊김 흉내
    const r = (await (sb as { rpc: (n: string, x: Record<string, unknown>) => Promise<{ data: { case: Row } }> }).rpc("support_transition_case", {
      p_case_id: a.case.id,
      p_action: "admin_resolve",
      p_actor_user_id: ADMIN,
    })).data;
    const ob = db.admin_notification_outbox.filter((o) => o.kind === "support_requester_notification");
    expect(ob).toHaveLength(1);
    const { resolvedDedupeKey } = await import("@/lib/support/support-requester-notification-copy");
    expect((ob[0].payload as { dedupeKey: string }).dedupeKey).toBe(resolvedDedupeKey(r.case as never));
    const { replaySupportRequesterNotification } = await import("@/lib/support/support-requester-outbox");
    expect(await replaySupportRequesterNotification(sb, ob[0].payload as never)).toEqual({ ok: true });
    expect(await replaySupportRequesterNotification(sb, ob[0].payload as never)).toEqual({ ok: true });
    expect(db.notification_events.filter((n) => n.type === "support_case_resolved")).toHaveLength(1);
  });

  it("종료: 앱이 정상으로 알림을 만들었으면 작업자는 「이미 있음」으로 닫는다(중복 없음)", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await flush();
    expect(db.notification_events.filter((n) => n.type === "support_case_resolved")).toHaveLength(1);
    const ob = db.admin_notification_outbox.find((o) => o.kind === "support_requester_notification")!;
    const { replaySupportRequesterNotification } = await import("@/lib/support/support-requester-outbox");
    expect(await replaySupportRequesterNotification(sb, ob.payload as never)).toEqual({ ok: true });
    expect(db.notification_events.filter((n) => n.type === "support_case_resolved")).toHaveLength(1);
  });

  it("재오픈: 끊김 → 대기열 행 → 작업자 1건 · 그사이 다시 종료됐으면 만들지 않음 · 고객 「확인했어요」는 안전망 행 없음", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await flush();
    await (sb as { rpc: (n: string, x: Record<string, unknown>) => Promise<unknown> }).rpc("support_transition_case", {
      p_case_id: a.case.id,
      p_action: "reopen",
      p_actor_user_id: ADMIN,
    });
    const ob = db.admin_notification_outbox.find((o) => (o.payload as { type?: string }).type === "support_case_reopened")!;
    expect(ob).toBeTruthy();
    const { replaySupportRequesterNotification } = await import("@/lib/support/support-requester-outbox");
    expect(await replaySupportRequesterNotification(sb, ob.payload as never)).toEqual({ ok: true });
    expect(db.notification_events.filter((n) => n.type === "support_case_reopened")).toHaveLength(1);

    // 그사이 다시 종료된 문의의 재오픈 안전망은 만들지 않는다
    const b = await open(sb, "y", { context: { ...ctx(), category: "ACCOUNT" }, issueType: null, allowMissingIssue: true });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: b.case.id, status: "RESOLVED" });
    await (sb as { rpc: (n: string, x: Record<string, unknown>) => Promise<unknown> }).rpc("support_transition_case", {
      p_case_id: b.case.id,
      p_action: "reopen",
      p_actor_user_id: ADMIN,
    });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: b.case.id, status: "RESOLVED" });
    await flush();
    const obB = db.admin_notification_outbox.find(
      (o) => (o.payload as { type?: string; caseId?: string }).type === "support_case_reopened" && (o.payload as { caseId?: string }).caseId === b.case.id
    )!;
    expect(await replaySupportRequesterNotification(sb, obB.payload as never)).toEqual({ ok: true });
    expect(db.notification_events.filter((n) => n.type === "support_case_reopened" && String(n.dedupe_key).includes(b.case.id))).toHaveLength(0);

    // 고객 「확인했어요」 = 알림 대상 아님 → 안전망 행 없음
    const before = db.admin_notification_outbox.length;
    const c = await open(sb, "z", { context: { ...ctx(), category: "DELIVERY" }, issueType: null, allowMissingIssue: true });
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: c.case.id, body: "답" });
    await flush();
    await requesterCloseSupportCase(sb, { userId: U, caseId: c.case.id, seenLastMessageAt: null });
    expect(
      db.admin_notification_outbox.slice(before).filter((o) => o.kind === "support_requester_notification" && (o.payload as { deferred?: boolean }).deferred)
    ).toHaveLength(0);
  });
});

describe("5차 재감사 — 안전망 지난 회차 · 접수 재전송 처음 결과 · 되살림 경합", () => {
  it("안전망: 그사이 재오픈·다시 종료돼 회차가 바뀌었으면 지난 회차 「종료」 알림은 만들지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await flush();
    // 1회차 종료 — DB 함수만(앱 알림 전에 끊김)
    await (sb as { rpc: (n: string, x: Record<string, unknown>) => Promise<unknown> }).rpc("support_transition_case", {
      p_case_id: a.case.id,
      p_action: "admin_resolve",
      p_actor_user_id: ADMIN,
    });
    const first = db.admin_notification_outbox.find((o) => (o.payload as { type?: string }).type === "support_case_resolved")!;
    // 재오픈 → 2회차 종료(앱 정상)
    await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await flush();
    const { replaySupportRequesterNotification } = await import("@/lib/support/support-requester-outbox");
    expect(await replaySupportRequesterNotification(sb, first.payload as never)).toEqual({ ok: true });
    const firstKey = (first.payload as { dedupeKey: string }).dedupeKey;
    expect(db.notification_events.filter((n) => n.dedupe_key === firstKey)).toHaveLength(0);
    expect(db.notification_events.filter((n) => n.type === "support_case_resolved")).toHaveLength(1);
  });

  it("접수 재전송: 그사이 어드민이 안내문을 꺼서 검증에 걸려도 같은 요청 id 면 처음 결과(이미 접수된 문의) · 다른 id 는 그대로 오류", async () => {
    const { db, sb } = makeDb({
      support_guidance_entries: [
        { id: "g1", audience: "MEMBER", category: "ORDER", issue_type: "ORDER_STATUS", enabled: true, revision: 1 },
      ],
    });
    current.sb = sb;
    current.userId = U;
    const { POST } = await import("@/app/api/support/cases/open/route");
    const rid = randomUUID();
    const body = {
      context: ctx(),
      issueType: "ORDER_STATUS",
      requireIssueType: true,
      initialSummary: "안내문 보고 접수",
      initialBody: "안내문 보고 접수",
      guidanceKey: "g1",
      guidanceRevision: 1,
      requestId: rid,
    };
    const r1 = await (await POST(jsonReq("http://x/o", "POST", body))).json();
    expect(r1.ok).toBe(true);
    db.support_guidance_entries[0].enabled = false;
    const r2res = await POST(jsonReq("http://x/o", "POST", body));
    const r2 = await r2res.json();
    expect(r2res.status).toBe(200);
    expect(r2).toMatchObject({ ok: true, replayed: true, created: true });
    expect(r2.case.id).toBe(r1.case.id);
    expect(db.support_cases).toHaveLength(1);
    const r3 = await POST(jsonReq("http://x/o", "POST", { ...body, requestId: randomUUID() }));
    expect(r3.status).not.toBe(200);
  });

  it("접수 재전송: 매장 소유를 잃었으면 처음 결과도 보이지 않는다(목록·상세와 같은 소유 규칙 A-6)", async () => {
    const STORE = randomUUID();
    storeOwner.owned.add(STORE);
    const { sb } = makeDb();
    current.sb = sb;
    current.userId = U;
    const { POST } = await import("@/app/api/support/cases/open/route");
    const body = {
      context: { enabled: true, audience: "OWNER", storeId: STORE, category: "STORE", sourceSurface: "owner_customer_center" },
      issueType: null,
      initialSummary: "사장님 문의",
      initialBody: "사장님 문의",
      requestId: randomUUID(),
    };
    expect((await POST(jsonReq("http://x/o", "POST", body))).status).toBe(200);
    storeOwner.owned.delete(STORE);
    expect((await POST(jsonReq("http://x/o", "POST", body))).status).toBe(403);
  });

  it("되살림 경합: 답변 삭제 뒤 응답 뒤 작업 전에 새 답변이 그 글을 봤으면 어드민 알림을 되살리지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const customerMsg = db.support_messages.find((m) => m.sender_type === "MEMBER")!;
    db.admin_notifications.push({
      id: "an-1", recipient_admin_id: ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases",
      work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${customerMsg.id}`, read_at: "2026-12-01T00:00:00.000Z",
    });
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답1" });
    await flush();
    if (!r1.ok) throw new Error(r1.error);
    // 답변 삭제(되살림은 응답 뒤로 예약) → 예약이 돌기 전에 새 답변이 같은 글을 봤다
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r1.message.id });
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답2" });
    await flush();
    expect(db.admin_notifications.find((n) => n.id === "an-1")!.read_at).not.toBeNull();
  });
});

describe("6차 재감사 — 재오픈 안전망 키 · 되살림 읽기 실패 · 읽음 순서", () => {
  it("재오픈 안전망: 앱이 알림 전에 끊긴 뒤 작업자 전에 답변이 와도(마지막 글 시각이 바뀌어도) 재오픈 알림을 만든다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await flush();
    // 재오픈 — DB 함수만(앱 알림 전에 끊김)
    await (sb as { rpc: (n: string, x: Record<string, unknown>) => Promise<unknown> }).rpc("support_transition_case", {
      p_case_id: a.case.id,
      p_action: "reopen",
      p_actor_user_id: ADMIN,
    });
    // 작업자 전에 어드민 답변(마지막 글 시각이 바뀜)
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "재오픈 뒤 답" });
    await flush();
    const ob = db.admin_notification_outbox.find((o) => (o.payload as { type?: string }).type === "support_case_reopened")!;
    const { replaySupportRequesterNotification } = await import("@/lib/support/support-requester-outbox");
    expect(await replaySupportRequesterNotification(sb, ob.payload as never)).toEqual({ ok: true });
    expect(db.notification_events.filter((n) => n.type === "support_case_reopened")).toHaveLength(1);
  });

  it("재오픈: 앱 즉시 발송 키 = 안전망 키(재오픈 사건 id) — 작업자는 「이미 있음」으로 닫는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    await flush();
    const ev = db.support_case_events.filter((e) => e.event_type === "reopened").at(-1)!;
    const sent = db.notification_events.filter((n) => n.type === "support_case_reopened");
    expect(sent.map((n) => n.dedupe_key)).toEqual([`support_case_reopened:${a.case.id}:${ev.id}`]);
    const ob = db.admin_notification_outbox.find((o) => (o.payload as { type?: string }).type === "support_case_reopened")!;
    expect((ob.payload as { dedupeKey: string }).dedupeKey).toBe(`support_case_reopened:${a.case.id}:${ev.id}`);
  });

  it("되살림: 응답 뒤 문의 상태 읽기가 한 번 실패해도 되살림을 버리지 않는다(놓치지 않는 쪽)", async () => {
    const { db, sb, hooks } = makeDb();
    const a = await open(sb, "첫 글");
    const customerMsg = db.support_messages.find((m) => m.sender_type === "MEMBER")!;
    db.admin_notifications.push({
      id: "an-r", recipient_admin_id: ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases",
      work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${customerMsg.id}`, read_at: "2026-12-01T00:00:00.000Z",
    });
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답1" });
    await flush();
    if (!r1.ok) throw new Error(r1.error);
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r1.message.id });
    // 응답 뒤 되살림의 문의 상태 읽기만 실패
    hooks.failSelect = { table: "support_cases", n: 1 };
    await flush();
    expect(db.admin_notifications.find((n) => n.id === "an-r")!.read_at).toBeNull();
  });

  it("읽음 순서: 답변 뒤 응답 뒤 읽음 처리 전에 그 답변이 지워졌으면 그 글 알림을 읽음으로 만들지 않는다", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    await flush();
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답1" });
    if (!r1.ok) throw new Error(r1.error);
    // 응답 뒤 읽음 처리가 돌기 전에 그 답변 삭제
    db.support_messages.find((m) => m.id === r1.message.id)!.deleted_at = "2026-12-01T00:00:09.000Z";
    const { resolveAdminNotificationsForWork } = await import("@/lib/admin/notifications/admin-notification-service");
    vi.mocked(resolveAdminNotificationsForWork).mockClear();
    await flush();
    const calls = vi.mocked(resolveAdminNotificationsForWork).mock.calls.map((c) => c[1] as unknown as { kinds?: string[]; dedupeKeys?: string[] });
    expect(calls.some((c) => c.kinds?.includes("support_customer_replied"))).toBe(false);
  });
});

describe("7차 재감사 — 어드민 seen 알림 읽음 상한 없음", () => {
  it("이 어드민의 그 문의 안 읽은 알림이 250건이어도 보여 준 글 것은 전부 읽음(100개씩)", async () => {
    const { db, sb } = makeDb();
    current.sb = sb;
    current.userId = ADMIN;
    const a = await open(sb, "첫 글");
    await flush();
    const shown: string[] = [];
    for (let i = 0; i < 250; i += 1) {
      const id = randomUUID();
      shown.push(id);
      db.support_messages.push({ id, case_id: a.case.id, sender_type: "MEMBER", sender_user_id: U, message_type: "PUBLIC", body: `m${i}`, created_at: `2026-12-01T00:00:00.${String(100 + i).padStart(3, "0")}Z` });
      db.admin_notifications.push({ id: `an-${i}`, recipient_admin_id: ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${id}`, read_at: null });
    }
    adminReadCalls.length = 0;
    const route = await import("@/app/api/admin/support/cases/[caseId]/route");
    const res = await route.PATCH(
      jsonReq(`http://x/api/admin/support/cases/${a.case.id}`, "PATCH", { action: "seen", shownMessageIds: shown, seenLastMessageAt: null }),
      params(a.case.id)
    );
    expect(res.status).toBe(200);
    const ids = adminReadCalls.flatMap((c) => ((c as { ids?: string[] }).ids ?? []));
    expect(new Set(ids).size).toBe(250);
    expect(adminReadCalls.every((c) => ((c as { ids?: string[] }).ids ?? []).length <= 100)).toBe(true);
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
    // 이 어드민이 받은 알림: 보여 준 첫 글(읽음 대상) · 보여 준 뒤 온 글(남아야 함) · 담당 지정(읽음 대상)
    const shownMsg = db.support_messages.find((m) => m.sender_type === "MEMBER" && json.messages.some((x: { id: string }) => x.id === m.id))!;
    const laterMsg = db.support_messages.find((m) => m.sender_type === "MEMBER" && m.id !== shownMsg.id)!;
    db.admin_notifications.push(
      { id: "an-shown", recipient_admin_id: ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${shownMsg.id}`, read_at: null },
      { id: "an-later", recipient_admin_id: ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${laterMsg.id}`, read_at: null },
      { id: "an-assigned", recipient_admin_id: ADMIN, kind: "support_case_assigned", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: "support_case_assigned:x", read_at: null }
    );
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
    // 6차 재감사: 한 번 읽고 id 로 한 번에 — 보여 준 글 알림·담당 지정만, 뒤에 온 글 알림은 남는다
    const call = adminReadCalls.find((c) => c.adminUserId === ADMIN) as { ids?: string[] } | undefined;
    expect([...(call?.ids ?? [])].sort()).toEqual(["an-assigned", "an-shown"]);
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
    await flush(); // 숫자 신호 = 응답 뒤
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
    // 「내 문의」 첫 페이지 개수(라우트 — 한 번 읽어 개수·첫 페이지를 같이 만든다)
    current.sb = sb;
    current.userId = U;
    const { GET: listGet } = await import("@/app/api/support/cases/route");
    const first = await (await listGet(jsonReq("http://x/api/support/cases?status=active&limit=20", "GET"))).json();
    expect(first.counts).toEqual({ active: 1 });
    expect(first.cases.map((c: { id: string }) => c.id)).toEqual(["m1"]);
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
    await flush(); // 요청 예산: 숫자 신호는 응답 뒤
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

describe("재감사 2차 1 — 판정 못 함(프로필 읽기 실패)으로는 담당을 풀지 않는다", () => {
  it("고객 글: 담당자 판정 못 함 → 담당 그대로 + 이 글은 전원 대체 · 권한 잃음 확인 → 담당 해제", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN_B });
    await settle();
    adminNotifyCalls.length = 0;
    assigneeOutcome.uid = ADMIN_B;
    assigneeOutcome.kind = "unknown";
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또" });
    await settle();
    expect(db.support_cases[0].assigned_admin_id).toBe(ADMIN_B);
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied").map((c) => c.broadcastPermission ?? "assignee")).toEqual([
      "assignee",
      "support",
    ]);
    // 대조: 확인된 권한 잃음이면 푼다
    assigneeOutcome.kind = "revoked";
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또또" });
    await settle();
    expect(db.support_cases[0].assigned_admin_id).toBeNull();
  });

  it("재오픈: 담당자 판정 못 함 → 담당 그대로 (A-7 확인된 잃음 해제는 위 시험)", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "x");
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN_B });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    authority.unknown.add(ADMIN_B);
    const r = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    expect(r.ok).toBe(true);
    expect(db.support_cases[0].assigned_admin_id).toBe(ADMIN_B);
  });
});

describe("재감사 2차 2 — 어드민 답변 replay 는 고객 알림을 보장한다", () => {
  it("첫 요청이 저장 뒤 알림 전에 끊겼다(알림 행 없음) → 같은 requestId 재전송이 알림을 한 번 만든다 · 또 보내도 1건", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const rid = randomUUID();
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", clientRequestId: rid });
    if (!r1.ok) throw new Error(r1.error);
    await flush();
    const key = `support_admin_replied:${r1.message.id}`;
    // 끊김 흉내: 알림 행이 저장되지 않았다
    db.notification_events = db.notification_events.filter((n) => n.dedupe_key !== key);
    const r2 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", clientRequestId: rid });
    await flush();
    expect(r2.ok && r2.replayed).toBe(true);
    expect(db.notification_events.filter((n) => n.dedupe_key === key)).toHaveLength(1);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", clientRequestId: rid });
    await flush();
    expect(db.notification_events.filter((n) => n.dedupe_key === key)).toHaveLength(1);
    expect(db.support_messages.filter((m) => m.sender_type === "ADMIN")).toHaveLength(1);
  });

  it("3차 재감사 D4: 첫 요청이 저장 뒤 「답변 정리」 전에 끊겼다(본 시각 기록 없음 · 상태 WAITING_USER) → 재전송이 응답 뒤에 정리를 다시 해 답 못 받은 고객 글이 「답변 필요」로", async () => {
    const { db, sb } = makeDb();
    const a = await open(sb, "첫 글");
    const seenFirst = String(db.support_cases[0].last_message_at);
    const later = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "답 쓰는 사이 온 글" });
    if (!later.ok) throw new Error(later.error);
    await flush();
    const rid = randomUUID();
    const r1 = await adminReplySupportCase(sb, {
      adminUserId: ADMIN,
      caseId: a.case.id,
      body: "답",
      clientRequestId: rid,
      seenLastMessageAt: seenFirst,
    });
    if (!r1.ok) throw new Error(r1.error);
    await flush();
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
    // 끊김 흉내: DB 함수만 커밋(WAITING_USER) · 정리(본 시각 기록·상태 맞춤) 없음
    db.support_case_events = db.support_case_events.filter((e) => e.event_type !== "admin_reply_seen");
    db.support_cases[0].status = "WAITING_USER";
    const r2 = await adminReplySupportCase(sb, {
      adminUserId: ADMIN,
      caseId: a.case.id,
      body: "답",
      clientRequestId: rid,
      seenLastMessageAt: seenFirst,
    });
    expect(r2.ok && r2.replayed).toBe(true);
    await settle();
    expect(db.support_case_events.filter((e) => e.event_type === "admin_reply_seen")).toHaveLength(1);
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
  });
});

/* ───────────── 요청 예산 — 요청 1회 실제 DB 호출 수 (실측 · 응답 뒤 작업 제외) ───────────── */
describe("요청 예산 — 고객센터 라우트 요청 1회의 DB 호출 수 ≤ ROUTE_SUPABASE_CALL_BUDGET (2026-11-29 실측)", () => {
  /**
   * 센 것: 이 가짜 DB 의 from()·rpc() + 흉내 낸 모듈의 실제 호출 수(언어 읽기 2 · 매장 소유 1 · 어드민 알림 읽음 1)
   *   + 인증(고객 로그인 1 · 어드민 권한 2) + 어드민 변경의 감사 기록 1. 응답 뒤(`after`) 작업은 따로 모았다가 뒤에 돈다(세지 않음).
   */
  async function calls(fn: () => Promise<unknown>, extra: { auth: number; audit?: number }) {
    const { loadNotificationUserLanguage } = await import("@/lib/notifications/notification-user-language");
    const { getCachedStoreIfOwner } = await import("@/lib/stores/owner-store-ownership-cache");
    const lang0 = vi.mocked(loadNotificationUserLanguage).mock.calls.length;
    const own0 = vi.mocked(getCachedStoreIfOwner).mock.calls.length;
    const read0 = adminReadCalls.length;
    // 5차 재감사: 흉내 낸 어드민 알림 함수도 실제로는 DB 호출 — 응답 전에 불렸으면 모두 센다(UPDATE 1건씩)
    const svc = await import("@/lib/admin/notifications/admin-notification-service");
    const mockedCount = () =>
      vi.mocked(svc.resolveAdminNotificationsForWork).mock.calls.length +
      vi.mocked(svc.settleSupportCustomerMessageNotification).mock.calls.length +
      // 6차 재감사: 푸시까지 켠 알림 1건의 실제 비용(권한 3 + 저장 1 + 발송 기록 1 + 보내기 직전 권한 3 + 기기·배지 3 + 끝 1) ≈ 12 — 응답 전이면 크게 센다
      vi.mocked(svc.createAdminNotification).mock.calls.length * 12 +
      vi.mocked(svc.resolveAdminRecipientAuthority).mock.calls.length * 3;
    const mocked0 = mockedCount();
    callLog.length = 0;
    await fn();
    const n =
      callLog.length +
      (mockedCount() - mocked0) +
      (vi.mocked(loadNotificationUserLanguage).mock.calls.length - lang0) * 2 +
      (vi.mocked(getCachedStoreIfOwner).mock.calls.length - own0) +
      (adminReadCalls.length - read0) +
      extra.auth +
      (extra.audit ?? 0);
    await settle();
    return n;
  }

  it("어드민 상세 라우트(13): 답변(보통·답 쓰는 사이 고객 글)·삭제·GET·seen·종료 모두 예산 안", async () => {
    const { ROUTE_SUPABASE_CALL_BUDGET } = await import("@/lib/perf/request-budget");
    const budget = ROUTE_SUPABASE_CALL_BUDGET["/api/admin/support/cases/[caseId]"]!;
    const { db, sb } = makeDb();
    current.sb = sb;
    const a = await open(sb, "첫 글");
    await flush();
    current.userId = ADMIN;
    const route = await import("@/app/api/admin/support/cases/[caseId]/route");
    const seen0 = String(db.support_cases[0].last_message_at);
    const patch = (body: Record<string, unknown>) => route.PATCH(jsonReq("http://x/a", "PATCH", body), params(a.case.id));
    const got: Record<string, number> = {};
    got.reply = await calls(() => patch({ action: "reply", body: "답1", requestId: randomUUID(), seenLastMessageAt: seen0 }), { auth: 2, audit: 1 });
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "고객 또" });
    await flush();
    got.replyWhileCustomerWrote = await calls(
      () => patch({ action: "reply", body: "답2", requestId: randomUUID(), seenLastMessageAt: seen0 }),
      { auth: 2, audit: 1 }
    );
    const lastReply = [...db.support_messages].reverse().find((m) => m.sender_type === "ADMIN")!;
    got.deleteReply = await calls(() => patch({ action: "delete_message", messageId: lastReply.id, reason: "잘못 보낸 답변입니다" }), {
      auth: 2,
      audit: 1,
    });
    const detail = await route.GET(jsonReq("http://x/a", "GET"), params(a.case.id));
    const dj = await detail.json();
    got.get = await calls(() => route.GET(jsonReq("http://x/a", "GET"), params(a.case.id)), { auth: 2 });
    got.seen = await calls(
      () => patch({ action: "seen", shownMessageIds: dj.messages.map((m: { id: string }) => m.id), seenLastMessageAt: dj.case.last_message_at }),
      { auth: 2 }
    );
    got.assignOther = await calls(() => patch({ action: "assign", assigneeAdminId: ADMIN_B }), { auth: 2, audit: 1 });
    got.reassignBack = await calls(() => patch({ action: "assign", assigneeAdminId: ADMIN }), { auth: 2, audit: 1 });
    got.unassign = await calls(() => patch({ action: "assign", assigneeAdminId: null }), { auth: 2, audit: 1 });
    got.priority = await calls(() => patch({ action: "priority", priority: "HIGH" }), { auth: 2, audit: 1 });
    const editable = [...db.support_messages].reverse().find((m) => m.sender_type === "ADMIN" && !m.deleted_at);
    if (editable) {
      got.editReply = await calls(() => patch({ action: "edit_message", messageId: editable.id, body: "고친 답" }), { auth: 2, audit: 1 });
    }
    got.close = await calls(() => patch({ action: "status", status: "RESOLVED" }), { auth: 2, audit: 1 });
    got.archive = await calls(() => patch({ action: "archive" }), { auth: 2, audit: 1 });
    got.unarchive = await calls(() => patch({ action: "unarchive" }), { auth: 2, audit: 1 });
    got.reopen = await calls(() => patch({ action: "reopen" }), { auth: 2, audit: 1 });
    for (const [k, v] of Object.entries(got)) expect({ path: k, calls: v <= budget ? "ok" : v }).toEqual({ path: k, calls: "ok" });
  });

  it("고객 상세 라우트(7)·접수(7)·목록(3): 회원·사장님 모두 예산 안", async () => {
    const { ROUTE_SUPABASE_CALL_BUDGET } = await import("@/lib/perf/request-budget");
    const STORE = randomUUID();
    storeOwner.owned.add(STORE);
    const { db, sb } = makeDb();
    current.sb = sb;
    current.userId = U;
    const ownerCtx = (): SupportContext => ({ enabled: true, audience: "OWNER", storeId: STORE, category: "STORE", sourceSurface: "owner_customer_center" } as SupportContext);
    const { POST: openPost } = await import("@/app/api/support/cases/open/route");
    const openBody = (c: SupportContext, text: string) => ({ context: c, issueType: null, initialSummary: text, initialBody: text, requestId: randomUUID() });
    const got: Record<string, [number, number]> = {};
    const openBudget = ROUTE_SUPABASE_CALL_BUDGET["/api/support/cases/open"]!;
    got.openMember = [await calls(() => openPost(jsonReq("http://x/o", "POST", openBody(ctx(), "회원 문의"))), { auth: 1 }), openBudget];
    let ownerOpen: unknown = null;
    got.openOwner = [
      await calls(async () => {
        ownerOpen = await (await openPost(jsonReq("http://x/o", "POST", openBody(ownerCtx(), "사장님 문의")))).json();
      }, { auth: 1 }),
      openBudget,
    ];
    expect(ownerOpen).toMatchObject({ ok: true });
    const ownerCase = db.support_cases.find((c) => c.audience === "OWNER")!;
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: String(ownerCase.id), body: "답" });
    await flush();
    const detailRoute = await import("@/app/api/support/cases/[caseId]/route");
    const detailBudget = ROUTE_SUPABASE_CALL_BUDGET["/api/support/cases/[caseId]"]!;
    const p = params(String(ownerCase.id));
    got.getOwner = [await calls(() => detailRoute.GET(jsonReq("http://x/c", "GET"), p), { auth: 1 }), detailBudget];
    const dj = await (await detailRoute.GET(jsonReq("http://x/c", "GET"), p)).json();
    got.seenOwner = [
      await calls(
        () =>
          detailRoute.POST(
            jsonReq("http://x/c", "POST", { action: "seen", shownMessageIds: dj.messages.map((m: { id: string }) => m.id), seenLastMessageAt: dj.case.last_message_at }),
            p
          ),
        { auth: 1 }
      ),
      detailBudget,
    ];
    got.followUpOwner = [await calls(() => detailRoute.POST(jsonReq("http://x/c", "POST", { body: "추가 문의", requestId: randomUUID() }), p), { auth: 1 }), detailBudget];
    const { GET: listGet } = await import("@/app/api/support/cases/route");
    const listBudget = ROUTE_SUPABASE_CALL_BUDGET["/api/support/cases"]!;
    const q = `audience=OWNER&storeId=${STORE}`;
    got.fabOwner = [await calls(() => listGet(jsonReq(`http://x/api/support/cases?summary=unread&${q}`, "GET")), { auth: 1 }), listBudget];
    got.composeListOwner = [await calls(() => listGet(jsonReq(`http://x/api/support/cases?limit=5&${q}`, "GET")), { auth: 1 }), listBudget];
    got.historyFirstOwner = [await calls(() => listGet(jsonReq(`http://x/api/support/cases?status=active&limit=20&${q}`, "GET")), { auth: 1 }), listBudget];
    for (const [k, [v, b]] of Object.entries(got)) expect({ path: k, calls: v <= b ? "ok" : `${v} > ${b}` }).toEqual({ path: k, calls: "ok" });
  });
});
