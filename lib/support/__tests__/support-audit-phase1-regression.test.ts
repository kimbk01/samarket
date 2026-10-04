/**
 * Support audit Phase 1 — behavioural regression lock (DEF-01/02/03/04/09/10/15/19 + label SSOT).
 * Runs the real support services against an in-memory Supabase double; no network, no DB.
 * Each case failed on main@70cc8918a (see audit design doc §1) and must keep passing.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyCalls: { type: string; userId: string; dedupeKey: string }[] = [];

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: vi.fn(
    async (_sb: unknown, input: { type: string; userId: string; dedupeKey: string }) => {
      notifyCalls.push({ type: input.type, userId: input.userId, dedupeKey: input.dedupeKey });
      return { ok: true, row: { id: "n" } };
    }
  ),
}));

vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: vi.fn(async () => ({ ok: false })),
}));

import {
  adminReplySupportCase,
  adminUpdateSupportCaseStatus,
  enrichSupportCasesForAdminDisplay,
  listSupportCasesForAdmin,
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
        st.filters.push((r) => r[c] === v);
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
        return { data: r.data[0] ?? null, error: null };
      },
      single: async () => {
        const r = exec();
        return r.data[0]
          ? { data: r.data[0], error: null }
          : { data: null, error: { message: "no rows" } };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    };
    return b;
  }
  let seq = 100000;
  const sb = {
    from: (t: string) => builder(t),
    rpc: async (name: string) =>
      name === "allocate_support_public_case_no"
        ? { data: `SC-${++seq}`, error: null }
        : { data: null, error: { message: `no rpc ${name}` } },
  };
  return { db, sb: sb as never };
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
    expect(ui).toContain("ADMIN_SUPPORT_LIST_FILTERS.map");
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
    const flow = readFileSync(join(process.cwd(), "components/support/SupportTriageFlow.tsx"), "utf8");
    expect(flow).toContain("initialBody: summary,");
  });
});
