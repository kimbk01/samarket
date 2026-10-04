/**
 * Support audit Phase 1 — behavioural regression lock (DEF-01/02/03/04/09/10/15/19 + label SSOT).
 * Runs the real support services against an in-memory Supabase double; no network, no DB.
 * Each case failed on main@70cc8918a (see audit design doc §1) and must keep passing.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyCalls: { type: string; userId: string; dedupeKey: string; body?: string }[] = [];

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: vi.fn(
    async (
      _sb: unknown,
      input: { type: string; userId: string; dedupeKey: string; body?: string }
    ) => {
      notifyCalls.push({
        type: input.type,
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        body: input.body,
      });
      return { ok: true, row: { id: "n" } };
    }
  ),
}));

vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: vi.fn(async () => ({ ok: false })),
}));

import {
  adminAssignSupportCase,
  adminDeleteSupportMessage,
  adminEditSupportMessage,
  adminReplySupportCase,
  adminUpdateSupportCaseStatus,
  enrichSupportCasesForAdminDisplay,
  listSupportCasesForAdmin,
  listSupportMessages,
  markSupportCaseNotificationsRead,
  openSupportCaseFromContext,
  reopenSupportCase,
} from "@/lib/support/support-case-service";
import {
  ADMIN_SUPPORT_LIST_FILTERS,
  isAdminSupportListFilter,
} from "@/lib/support/support-case-types";
import { loadSupportControlPlane } from "@/lib/admin/support-control-plane/load-support-control-plane";
import { supportCaseStatusLabelMeta } from "@/lib/support/support-status-label";
import type { SupportContext } from "@/lib/support/support-context";

type Row = Record<string, unknown>;

function makeDb(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {
    support_cases: [],
    support_messages: [],
    support_sessions: [],
    support_case_events: [],
    support_guidance_entries: [],
    notification_events: [],
    profiles: [],
    stores: [],
    ...seed,
  };
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 1) + ++tick).toISOString();
  function builder(table: string) {
    const st: {
      op: "select" | "insert" | "update";
      filters: ((r: Row) => boolean)[];
      order: [string, boolean] | null;
      limit: number | null;
      patch: Row | null;
      rows: Row | Row[] | null;
    } = { op: "select", filters: [], order: null, limit: null, patch: null, rows: null };
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
    const exec = () => {
      if (st.op === "insert" && table === "support_cases") {
        // Emulates uq_support_cases_one_active_per_key (Phase 2, DEF-14).
        const rows = Array.isArray(st.rows) ? st.rows : [st.rows as Row];
        for (const r of rows) {
          if (activeKeyTaken(r)) {
            return { data: [] as Row[], error: { message: "duplicate key", code: "23505" } };
          }
        }
      }
      if (st.op === "insert") {
        const ins = (Array.isArray(st.rows) ? st.rows : [st.rows as Row]).map((r) => {
          const base: Row = { id: randomUUID(), created_at: now() };
          if (table === "support_cases") {
            Object.assign(base, {
              previous_case_id: null,
              assigned_admin_id: null,
              first_admin_response_at: null,
              resolved_at: null,
              archived_at: null,
            });
          }
          if (table === "support_sessions") base.closed_at = null;
          return { ...base, ...r };
        });
        (db[table] ??= []).push(...ins);
        return { data: ins, error: null };
      }
      if (st.op === "update") {
        const rows = apply();
        for (const r of rows) Object.assign(r, st.patch);
        return { data: rows, error: null };
      }
      return { data: apply(), error: null };
    };
    const b = {
      select: () => b,
      insert: (rows: Row | Row[]) => {
        st.op = "insert";
        st.rows = rows;
        return b;
      },
      update: (patch: Row) => {
        st.op = "update";
        st.patch = patch;
        return b;
      },
      eq: (c: string, v: unknown) => {
        const [col, path] = c.split("->>");
        st.filters.push((r) =>
          path ? (r[col] as Record<string, unknown> | null)?.[path] === v : r[c] === v
        );
        return b;
      },
      like: (c: string, pattern: string) => {
        // Only trailing-% prefix patterns are used by the services under test.
        const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
        st.filters.push((r) =>
          pattern.endsWith("%") ? String(r[c] ?? "").startsWith(prefix) : String(r[c] ?? "") === prefix
        );
        return b;
      },
      lt: (c: string, v: unknown) => {
        st.filters.push((r) => String(r[c] ?? "") < String(v));
        return b;
      },
      is: (c: string, v: unknown) => {
        st.filters.push((r) => (r[c] ?? null) === v);
        return b;
      },
      in: (c: string, vs: unknown[]) => {
        st.filters.push((r) => vs.includes(r[c]));
        return b;
      },
      ilike: () => b,
      or: () => b,
      order: (c: string, o?: { ascending?: boolean }) => {
        st.order = [c, o?.ascending !== false];
        return b;
      },
      limit: (n: number) => {
        st.limit = n;
        return b;
      },
      maybeSingle: async () => {
        const r = exec();
        if (r.error) return { data: null, error: r.error };
        return { data: r.data[0] ?? null, error: null };
      },
      single: async () => {
        const r = exec();
        // PostgREST surfaces the insert error (e.g. 23505) unchanged through .single().
        if (r.error) return { data: null, error: r.error };
        return r.data[0]
          ? { data: r.data[0], error: null }
          : { data: null, error: { message: "no rows" } };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    };
    return b;
  }
  const ACTIVE = ["OPEN", "WAITING_ADMIN", "WAITING_USER"];
  const keyOf = (r: Row) =>
    [r.requester_user_id, r.audience, r.category, r.owner_store_id ?? "", r.reference_type ?? "", r.reference_id ?? ""].join("|");
  function activeKeyTaken(r: Row) {
    const status = (r.status as string) ?? "OPEN";
    if (!ACTIVE.includes(status)) return false;
    return db.support_cases.some((c) => ACTIVE.includes(c.status as string) && keyOf(c) === keyOf(r));
  }
  // Emulates support_append_message (Phase 2, DEF-05) — same SQL branch rules.
  function appendRpc(a: Record<string, unknown>) {
    const c = db.support_cases.find((x) => x.id === a.p_case_id);
    if (!c) return { data: null, error: { message: "support_case_not_found" } };
    const msg: Row = {
      id: randomUUID(),
      created_at: now(),
      case_id: a.p_case_id,
      sender_type: a.p_sender_type,
      sender_user_id: a.p_sender_user_id,
      sender_admin_id: a.p_sender_admin_id,
      message_type: a.p_message_type,
      body: a.p_body,
    };
    db.support_messages.push(msg);
    const t = now();
    if (a.p_sender_type === "ADMIN" && a.p_message_type === "PUBLIC") {
      Object.assign(c, {
        status: "WAITING_USER",
        requester_unread_count: Number(c.requester_unread_count ?? 0) + 1,
        first_admin_response_at: c.first_admin_response_at ?? t,
        last_message_at: t,
        updated_at: t,
      });
    } else if ((a.p_sender_type === "MEMBER" || a.p_sender_type === "OWNER") && !a.p_system_seed) {
      Object.assign(c, {
        status: "WAITING_ADMIN",
        admin_unread_count: Number(c.admin_unread_count ?? 0) + 1,
        last_message_at: t,
        updated_at: t,
      });
    } else {
      Object.assign(c, { last_message_at: t, updated_at: t });
    }
    return { data: msg, error: null };
  }
  let seq = 100000;
  const rpcCalls: string[] = [];
  const sb = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push(name);
      if (name === "allocate_support_public_case_no") return { data: `SC-${++seq}`, error: null };
      if (name === "support_append_message") return appendRpc(args);
      return { data: null, error: { message: `no rpc ${name}` } };
    },
  };
  return { db, sb: sb as never, rpcCalls };
}

const U = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const ctx = (): SupportContext => ({
  enabled: true,
  audience: "MEMBER",
  category: "ORDER",
  sourceSurface: "mypage_customer_center",
});
const openStructured = (sb: never, issueType: string, summary: string) =>
  openSupportCaseFromContext(sb, {
    userId: U,
    context: ctx(),
    issueType,
    initialSummary: summary,
    initialBody: summary,
    allowMissingIssue: false,
  });

beforeEach(() => {
  notifyCalls.length = 0;
});

describe("support audit phase 1 — regression lock", () => {
  it("DEF-01: dedupe reuse keeps the customer's new text (WAITING_ADMIN, admin unread +1)", async () => {
    const { db, sb } = makeDb();
    const first = await openStructured(sb, "ORDER_STATUS", "첫번째 문의 내용");
    const second = await openStructured(sb, "DELIVERY_STATUS", "두번째 새 문의");
    expect(first.ok && first.created).toBe(true);
    expect(second.ok && !second.created).toBe(true);
    expect(db.support_cases).toHaveLength(1);
    expect(db.support_messages.map((m) => m.body)).toContain("두번째 새 문의");
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
    expect(db.support_cases[0].admin_unread_count).toBe(1);
  });

  it("DEF-19: structured open seeds with the customer's own words and stays OPEN (actionable)", async () => {
    const { db, sb } = makeDb();
    await openStructured(sb, "ORDER_STATUS", "주문이 안 와요");
    expect(db.support_messages[0].body).toBe("주문이 안 와요");
    expect(db.support_cases[0].status).toBe("OPEN");
    expect(db.support_cases[0].admin_unread_count).toBe(0);
    const actionable = await listSupportCasesForAdmin(sb, { filter: "ACTIONABLE" });
    expect(actionable.ok && actionable.cases).toHaveLength(1);
  });

  it("DEF-02: public reply on a closed case is rejected; reopen then reply works", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const rejected = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "late" });
    expect(rejected).toEqual({ ok: false, error: "case_closed" });
    const note = await adminReplySupportCase(sb, {
      adminUserId: ADMIN,
      caseId: a.case.id,
      body: "memo",
      internalNote: true,
    });
    expect(note.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
    const reopened = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    expect(reopened.ok).toBe(true);
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "ok" });
    expect(reply.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    expect(db.support_cases[0].resolved_at).toBeNull();
  });

  it("DEF-15: same-status transition is idempotent (one event, one notification)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    notifyCalls.length = 0;
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(notifyCalls.filter((n) => n.type === "support_case_resolved")).toHaveLength(1);
    expect(db.support_case_events.filter((e) => e.event_type === "status_changed")).toHaveLength(1);
  });

  it("DEF-03: one filter SSOT — UI chips, API whitelist, ACTIONABLE = OPEN|WAITING_ADMIN", async () => {
    expect(ADMIN_SUPPORT_LIST_FILTERS).toContain("ACTIONABLE");
    expect(isAdminSupportListFilter("ACTIONABLE")).toBe(true);
    const route = readFileSync(join(process.cwd(), "app/api/admin/support/cases/route.ts"), "utf8");
    const ui = readFileSync(join(process.cwd(), "components/admin/support/AdminSupportPage.tsx"), "utf8");
    expect(route).toContain("isAdminSupportListFilter(filterRaw)");
    expect(route).not.toMatch(/new Set<AdminSupportListFilter>/);
    // Console redesign: tabs render from ADMIN_SUPPORT_TABS; the API whitelists the same list.
    expect(ui).toContain("ADMIN_SUPPORT_TABS.map");
    expect(route).toContain("isAdminSupportTab(tabRaw)");
    const { db, sb } = makeDb();
    for (const status of ["OPEN", "WAITING_ADMIN", "WAITING_USER", "RESOLVED", "ARCHIVED"]) {
      db.support_cases.push({ id: randomUUID(), status, audience: "MEMBER", last_message_at: "2026-10-01" });
    }
    const res = await listSupportCasesForAdmin(sb, { filter: "ACTIONABLE" });
    expect(res.ok && res.cases.map((c) => c.status).sort()).toEqual(["OPEN", "WAITING_ADMIN"]);
  });

  it("DEF-04: control plane never drops active cases behind old closed rows", async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 130; i++) {
      rows.push({
        id: `r${i}`,
        public_case_no: `SC-${i}`,
        audience: "MEMBER",
        requester_user_id: U,
        owner_store_id: null,
        category: "ORDER",
        status: "RESOLVED",
        priority: "NORMAL",
        admin_unread_count: 0,
        last_message_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
        created_at: "2026-09-01T00:00:00Z",
      });
    }
    rows.push({ ...rows[0], id: "active", public_case_no: "SC-NEW", status: "WAITING_ADMIN", last_message_at: "2026-10-04T00:00:00Z" });
    const { sb } = makeDb({ support_cases: rows });
    const model = await loadSupportControlPlane(sb);
    expect(model.queues.actionable.count).toBe(1);
    expect(model.actionRequired.map((r) => r.publicCaseNo)).toContain("SC-NEW");
  });

  it("DEF-09: Admin queue shows member display name / email / store name", async () => {
    const STORE = "44444444-4444-4444-8444-444444444444";
    const { sb } = makeDb({
      profiles: [{ id: U, display_name: null, nickname: "닉네임A", email: "a@example.com" }],
      stores: [{ id: STORE, store_name: "테스트매장" }],
    });
    const rows = await enrichSupportCasesForAdminDisplay(sb, [
      { id: "c1", requester_user_id: U, owner_store_id: STORE, audience: "OWNER" } as never,
    ]);
    expect(rows[0].requester_display_name).toBe("닉네임A");
    expect(rows[0].requester_email).toBe("a@example.com");
    expect(rows[0].owner_store_name).toBe("테스트매장");
  });

  it("DEF-08: customer status label SSOT (no raw enum on customer surfaces)", () => {
    expect(supportCaseStatusLabelMeta("OPEN").fallbackKo).toBe("답변 대기");
    expect(supportCaseStatusLabelMeta("WAITING_ADMIN").fallbackKo).toBe("답변 대기");
    expect(supportCaseStatusLabelMeta("WAITING_USER").fallbackKo).toBe("상담 중");
    expect(supportCaseStatusLabelMeta("RESOLVED").fallbackKo).toBe("상담 종료");
    expect(supportCaseStatusLabelMeta("ARCHIVED").fallbackKo).toBe("상담 종료");
    const hist = readFileSync(join(process.cwd(), "components/support/SupportCasesHistoryList.tsx"), "utf8");
    expect(hist).not.toMatch(/\{c\.status\}/);
    expect(hist).not.toMatch(/\{c\.category\}/);
    expect(hist).toContain("supportCaseStatusLabelMeta");
    expect(hist).toContain("requester_unread_count");
  });

  it("DEF-07/10/11/12: customer modal failure, restore and audience contracts", () => {
    const host = readFileSync(join(process.cwd(), "components/support/SupportModalHost.tsx"), "utf8");
    const load = host.slice(host.indexOf("const load = useCallback"), host.indexOf("const send = async"));
    expect(load).toMatch(/catch \{[\s\S]*setError\("network_error"\)/);
    expect(host).toContain('json.error === "case_closed"');
    expect(host).toContain("(prev?.audience ?? fromCase?.audience)");
    const ctrl = readFileSync(join(process.cwd(), "lib/support/support-modal-controller.ts"), "utf8");
    expect(ctrl).toMatch(/closeSupportModal\(\): void \{[\s\S]*clearSupportModalRestoreCaseId\(\)/);
    const detail = readFileSync(
      join(process.cwd(), "app/api/admin/support/cases/[caseId]/route.ts"),
      "utf8"
    );
    expect(detail).toContain("enrichSupportCasesForAdminDisplay(sb, [gate.case])");
    const flow = readFileSync(join(process.cwd(), "components/support/SupportTriageFlow.tsx"), "utf8");
    expect(flow).toContain("initialBody: summary,");
  });

  it("Phase 2 DEF-05: messages and case state are written through one atomic RPC", async () => {
    const { db, sb, rpcCalls } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "r1" });
    expect(reply.ok).toBe(true);
    expect(rpcCalls.filter((n) => n === "support_append_message")).toHaveLength(2);
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    expect(db.support_cases[0].requester_unread_count).toBe(1);
    expect(db.support_cases[0].first_admin_response_at).toBeTruthy();
    const svc = readFileSync(join(process.cwd(), "lib/support/support-case-service.ts"), "utf8");
    const append = svc.slice(svc.indexOf("export async function appendSupportMessage"), svc.indexOf("export async function postRequesterSupportMessage"));
    expect(append).not.toContain('.from("support_messages")');
    expect(append).not.toContain('.from("support_cases")');
  });

  it("Phase 2 DEF-14: concurrent opens with the same key end in one active case", async () => {
    const { db, sb } = makeDb();
    const [x, y] = await Promise.all([
      openStructured(sb, "ORDER_STATUS", "same-1"),
      openStructured(sb, "ORDER_STATUS", "same-2"),
    ]);
    expect(x.ok && y.ok).toBe(true);
    const active = db.support_cases.filter((c) => ["OPEN", "WAITING_ADMIN", "WAITING_USER"].includes(c.status as string));
    expect(active).toHaveLength(1);
    const bodies = db.support_messages.map((m) => m.body);
    expect(bodies).toContain("same-1");
    expect(bodies).toContain("same-2");
  });

  it("Phase 3 A5: recipients — no self/assign notifications, fixed bodies, admin-only reopen notice", async () => {
    const { sb } = makeDb();
    notifyCalls.length = 0;
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    expect(notifyCalls.map((n) => n.type)).not.toContain("support_case_created");

    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN });
    expect(notifyCalls.map((n) => n.type)).not.toContain("support_case_assigned");

    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const resolved = notifyCalls.find((n) => n.type === "support_case_resolved");
    expect(resolved?.userId).toBe(U);
    expect(resolved?.body).toBe("상담이 종료되었습니다.");

    notifyCalls.length = 0;
    const byAdmin = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    expect(byAdmin.ok).toBe(true);
    const reopened = notifyCalls.filter((n) => n.type === "support_case_reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0].userId).toBe(U);
    expect(reopened[0].body).toBe("상담이 다시 열렸습니다.");

    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    notifyCalls.length = 0;
    const bySelf = await reopenSupportCase(sb, { userId: U, caseId: a.case.id });
    expect(bySelf.ok).toBe(true);
    expect(notifyCalls.filter((n) => n.type === "support_case_reopened")).toHaveLength(0);
    // No notification body may carry the internal "CATEGORY · surface" subject token.
    for (const n of notifyCalls) expect(n.body ?? "").not.toMatch(/ · mypage_/);
  });

  it("Phase 3 A3: opening a case clears only that viewer's unread support rows for that case", async () => {
    const OTHER_CASE = "33333333-3333-4333-8333-333333333333";
    const { db, sb } = makeDb({
      notification_events: [
        { id: "n1", user_id: U, type: "support_admin_replied", unread: true, read_at: null, display_payload: { supportCaseId: "C1" } },
        { id: "n2", user_id: U, type: "support_case_resolved", unread: true, read_at: null, display_payload: { supportCaseId: "C1" } },
        { id: "n3", user_id: U, type: "support_admin_replied", unread: true, read_at: null, display_payload: { supportCaseId: OTHER_CASE } },
        { id: "n4", user_id: ADMIN, type: "support_customer_replied", unread: true, read_at: null, display_payload: { supportCaseId: "C1" } },
        { id: "n5", user_id: U, type: "order_status", unread: true, read_at: null, display_payload: { supportCaseId: "C1" } },
      ],
    });
    const n = await markSupportCaseNotificationsRead(sb, { userId: U, caseId: "C1" });
    expect(n).toBe(2);
    const unreadIds = db.notification_events.filter((r) => r.unread === true).map((r) => r.id);
    expect(unreadIds.sort()).toEqual(["n3", "n4", "n5"]);
    expect(await markSupportCaseNotificationsRead(sb, { userId: U, caseId: "C1" })).toBe(0);
  });

  it("Console: status tabs + category group + assignee + 24h filters", async () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const now = new Date().toISOString();
    const row = (id: string, status: string, category: string, extra: Record<string, unknown> = {}) => ({
      id,
      public_case_no: id,
      audience: "MEMBER",
      requester_user_id: U,
      owner_store_id: null,
      category,
      status,
      priority: "NORMAL",
      assigned_admin_id: null,
      last_message_at: now,
      ...extra,
    });
    const { sb } = makeDb({
      support_cases: [
        row("A1", "OPEN", "CASH_COIN", { last_message_at: old }),
        row("A2", "WAITING_ADMIN", "ORDER", { assigned_admin_id: ADMIN }),
        row("W1", "WAITING_USER", "SETTLEMENT"),
        row("R1", "RESOLVED", "CASH_COIN"),
        row("X1", "ARCHIVED", "OTHER"),
      ],
    });
    const ids = async (q: Parameters<typeof listSupportCasesForAdmin>[1]) => {
      const r = await listSupportCasesForAdmin(sb, q);
      if (!r.ok) throw new Error(r.error);
      return r.cases.map((c) => c.id).sort();
    };
    expect(await ids({ tab: "ACTIONABLE" })).toEqual(["A1", "A2"]);
    expect(await ids({ tab: "WAITING_USER" })).toEqual(["W1"]);
    expect(await ids({ tab: "RESOLVED" })).toEqual(["R1"]);
    expect(await ids({ tab: "ARCHIVED" })).toEqual(["X1"]);
    expect(await ids({ tab: "ALL" })).toHaveLength(5);
    expect(await ids({ tab: "ALL", group: "FINANCE" })).toEqual(["A1", "R1", "W1"]);
    expect(await ids({ tab: "ACTIONABLE", assignee: "ME", adminUserId: ADMIN })).toEqual(["A2"]);
    expect(await ids({ tab: "ACTIONABLE", assignee: "UNASSIGNED" })).toEqual(["A1"]);
    expect(await ids({ tab: "ACTIONABLE", stale: true })).toEqual(["A1"]);
    // Legacy ?filter= links keep their old meaning when no tab is sent.
    expect(await ids({ filter: "ACTIONABLE" })).toEqual(["A1", "A2"]);
  });

  it("Console: 보관 only from 종료; 보관 해제 is silent and keeps resolved_at", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const early = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "ARCHIVED" });
    expect(early).toEqual({ ok: false, error: "not_closed" });
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const resolvedAt = db.support_cases[0].resolved_at;
    expect(resolvedAt).toBeTruthy();
    const arch = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "ARCHIVED" });
    expect(arch.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("ARCHIVED");
    notifyCalls.length = 0;
    const un = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(un.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
    expect(db.support_cases[0].resolved_at).toBe(resolvedAt);
    expect(db.support_cases[0].archived_at).toBeNull();
    expect(notifyCalls).toHaveLength(0);
  });

  it("Console: admin edits/deletes only own message; customer sees it masked; audited", async () => {
    const OTHER_ADMIN = "44444444-4444-4444-8444-444444444444";
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "첫 답변" });
    if (!r.ok) throw new Error(r.error);
    const msgId = r.message.id;

    expect(
      await adminEditSupportMessage(sb, { adminUserId: OTHER_ADMIN, caseId: a.case.id, messageId: msgId, body: "x" })
    ).toEqual({ ok: false, error: "not_own_message" });

    const ed = await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: msgId, body: "고친 답변" });
    expect(ed.ok).toBe(true);
    const m = db.support_messages.find((x) => x.id === msgId)!;
    expect(m.body).toBe("고친 답변");
    expect(m.edited_at).toBeTruthy();
    const editEvent = db.support_case_events.find((e) => e.event_type === "message_edited");
    expect((editEvent?.payload as { previous_body?: string })?.previous_body).toBe("첫 답변");

    // Customer message can never be edited by an admin.
    const customerMsg = db.support_messages.find((x) => x.sender_type === "MEMBER")!;
    expect(
      (await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: String(customerMsg.id), body: "x" })).ok
    ).toBe(false);

    const del = await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: msgId });
    expect(del.ok).toBe(true);
    expect(m.deleted_at).toBeTruthy();
    expect(m.body).toBe("고친 답변"); // kept for audit
    const customerView = await listSupportMessages(sb, { caseId: a.case.id });
    if (!customerView.ok) throw new Error(customerView.error);
    const masked = customerView.messages.find((x) => x.id === msgId)!;
    expect(masked.body).toBe("");
    expect(masked.deleted_at).toBeTruthy();
    const adminView = await listSupportMessages(sb, { caseId: a.case.id, includeInternal: true });
    if (!adminView.ok) throw new Error(adminView.error);
    expect(adminView.messages.find((x) => x.id === msgId)!.body).toBe("고친 답변");
    expect(
      (await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: msgId })).ok
    ).toBe(false);
  });
});
