/**
 * Support audit Phase 1 — behavioural regression lock (DEF-01/02/03/04/09/10/15/19 + label SSOT).
 * Runs the real support services against an in-memory Supabase double; no network, no DB.
 * Each case failed on main@70cc8918a (see audit design doc §1) and must keep passing.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { MESSAGES } from "@/lib/i18n/messages";
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

const adminNotifyCalls: {
  kind: string;
  title: string;
  dedupeKey: string;
  recipientAdminIds?: string[];
  broadcastPermission?: string | null;
  requiredPermission?: string | null;
  excludeRecipientIds?: readonly string[];
}[] = [];

const adminResolveCalls: string[] = [];
const authorityAllowsResult = { value: true };

vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  createAdminNotification: vi.fn(
    async (
      _sb: unknown,
      input: {
        kind: string;
        title: string;
        dedupeKey: string;
        recipientAdminIds?: string[];
        broadcastPermission?: string | null;
        requiredPermission?: string | null;
        excludeRecipientIds?: readonly string[];
      }
    ) => {
      adminNotifyCalls.push({
        kind: input.kind,
        title: input.title,
        dedupeKey: input.dedupeKey,
        recipientAdminIds: input.recipientAdminIds,
        broadcastPermission: input.broadcastPermission,
        requiredPermission: input.requiredPermission,
        excludeRecipientIds: input.excludeRecipientIds,
      });
      return { ok: true, created: 1, skippedRecipients: 0, pushed: 1 };
    }
  ),
  markAdminNotificationsRead: vi.fn(async () => ({ ok: false, error: "nothing_to_mark" })),
  resolveAdminNotificationsForWork: vi.fn(async (_sb: unknown, input: { workRef: { id: string } }) => {
    adminResolveCalls.push(input.workRef.id);
    return 0;
  }),
  authorityAllows: vi.fn(() => authorityAllowsResult.value),
  resolveAdminRecipientAuthority: vi.fn(async () => ({ active: true, isSuperAdmin: true, permissions: [] })),
}));

vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: vi.fn(async () => ({ ok: false })),
}));

import {
  markSupportCaseReadForRequester,
  markSupportCaseReadForAdmin,
  adminAssignSupportCase,
  adminDeleteSupportMessage,
  adminEditSupportMessage,
  adminReplySupportCase,
  adminUpdateSupportCaseStatus,
  enrichSupportCasesForAdminDisplay,
  listSupportCasesForAdmin,
  listSupportMessages,
  markSupportCaseNotificationsRead,
  autoCloseStaleAnsweredSupportCases,
  openSupportCaseFromContext,
  postRequesterSupportMessage,
  reopenSupportCase,
  requesterCloseSupportCase,
  requesterVisibleActiveOrFilter,
  shouldRunSupportAutoClose,
  SUPPORT_AUTO_CLOSE_AFTER_DAYS,
} from "@/lib/support/support-case-service";
import {
  ADMIN_SUPPORT_LIST_FILTERS,
  isAdminSupportListFilter,
} from "@/lib/support/support-case-types";
import { loadSupportControlPlane } from "@/lib/admin/support-control-plane/load-support-control-plane";
import { supportCaseStatusLabelMeta } from "@/lib/support/support-status-label";
import { sortActiveSupportTickets } from "@/lib/support/support-ticket-form";
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
      range: [number, number] | null;
      count: boolean;
      patch: Row | null;
      rows: Row | Row[] | null;
    } = { op: "select", filters: [], order: null, limit: null, range: null, count: false, patch: null, rows: null };
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
    /** Filtered + ordered rows before range — emulates `count: "exact"` for the filter set. */
    const applyFilteredCount = () => {
      let rows = db[table] ?? [];
      for (const f of st.filters) rows = rows.filter(f);
      return rows.length;
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
      const rows = apply();
      const paged = st.range ? rows.slice(st.range[0], st.range[1] + 1) : rows;
      return { data: paged, error: null, count: st.count ? applyFilteredCount() : null };
    };
    const b = {
      select: (_cols?: string, opts?: { count?: string }) => {
        if (opts?.count === "exact") st.count = true;
        return b;
      },
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
        // Primary sort only — later `.order()` calls are tie-breakers.
        st.order ??= [c, o?.ascending !== false];
        return b;
      },
      range: (from: number, to: number) => {
        st.range = [from, to];
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
  adminNotifyCalls.length = 0;
  adminResolveCalls.length = 0;
  authorityAllowsResult.value = true;
});

describe("support audit phase 1 — regression lock", () => {
  it("DEF-01: dedupe reuse keeps the customer's new text (WAITING_ADMIN, admin unread +1 on top of the new-case 1)", async () => {
    const { db, sb } = makeDb();
    const first = await openStructured(sb, "ORDER_STATUS", "첫번째 문의 내용");
    const second = await openStructured(sb, "DELIVERY_STATUS", "두번째 새 문의");
    expect(first.ok && first.created).toBe(true);
    expect(second.ok && !second.created).toBe(true);
    expect(db.support_cases).toHaveLength(1);
    expect(db.support_messages.map((m) => m.body)).toContain("두번째 새 문의");
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
    // 고객 문의 SSOT §4 (F2): 새 문의 = 1, 이어 붙은 글 +1
    expect(db.support_cases[0].admin_unread_count).toBe(2);
  });

  it("DEF-19: structured open seeds with the customer's own words, stays OPEN (actionable) and counts as admin unread 1 (SSOT F2)", async () => {
    const { db, sb } = makeDb();
    await openStructured(sb, "ORDER_STATUS", "주문이 안 와요");
    expect(db.support_messages[0].body).toBe("주문이 안 와요");
    expect(db.support_cases[0].status).toBe("OPEN");
    expect(db.support_cases[0].admin_unread_count).toBe(1);
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
    /** 언어 SSOT S6: 상태 문구는 카탈로그 키 값으로 확인(대체 문구 삭제) */
    expect(MESSAGES.ko[supportCaseStatusLabelMeta("OPEN").key]).toBe("답변 대기");
    expect(MESSAGES.ko[supportCaseStatusLabelMeta("WAITING_ADMIN").key]).toBe("답변 대기");
    // 접수형 문의(Owner 2026-11-10) — 답변 대기 / 답변 완료 / 종료
    expect(MESSAGES.ko[supportCaseStatusLabelMeta("WAITING_USER").key]).toBe("답변 완료");
    expect(MESSAGES.ko[supportCaseStatusLabelMeta("RESOLVED").key]).toBe("종료");
    expect(MESSAGES.ko[supportCaseStatusLabelMeta("ARCHIVED").key]).toBe("종료");
    const hist = readFileSync(join(process.cwd(), "components/support/SupportCasesHistoryList.tsx"), "utf8");
    expect(hist).not.toMatch(/\{c\.status\}/);
    expect(hist).not.toMatch(/\{c\.category\}/);
    expect(hist).toContain("supportCaseStatusLabelMeta");
    // 숫자는 고객센터 FAB 아이콘에만 — 목록 행에는 숫자 없음(Owner 2026-11-10)
    expect(hist).not.toContain("requester_unread_count");
  });

  it("DEF-07/10/11/12: customer modal failure, restore and audience contracts", () => {
    const host = readFileSync(join(process.cwd(), "components/support/SupportModalHost.tsx"), "utf8");
    const views = readFileSync(join(process.cwd(), "components/support/SupportTicketViews.tsx"), "utf8");
    const load = views.slice(views.indexOf("const load = useCallback"), views.indexOf("const sendFollowUp = async"));
    expect(load).toMatch(/catch \{[\s\S]*setError\("network_error"\)/);
    expect(views).toContain('json.error === "case_closed"');
    expect(host).toContain("(prev?.audience ?? fromCase?.audience)");
    const ctrl = readFileSync(join(process.cwd(), "lib/support/support-modal-controller.ts"), "utf8");
    expect(ctrl).toMatch(/closeSupportModal\(\): void \{[\s\S]*clearSupportModalRestoreCaseId\(\)/);
    const detail = readFileSync(
      join(process.cwd(), "app/api/admin/support/cases/[caseId]/route.ts"),
      "utf8"
    );
    expect(detail).toContain("enrichSupportCasesForAdminDisplay(sb, [gate.case])");
    // DEF-19: 첫 메시지 = 고객이 쓴 문장 그대로(접수형 한 화면 쓰기)
    const form = readFileSync(join(process.cwd(), "lib/support/support-ticket-form.ts"), "utf8");
    expect(form).toContain("initialBody: body,");
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
    // 4절 문구 — 문구 모음(받는 사람 언어). 이 가짜 DB 는 프로필이 없어 기본 언어(en).
    expect(resolved?.body).toBe(notifySafeT("en", "notify_support_case_resolved_body"));

    notifyCalls.length = 0;
    const byAdmin = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    expect(byAdmin.ok).toBe(true);
    const reopened = notifyCalls.filter((n) => n.type === "support_case_reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0].userId).toBe(U);
    expect(reopened[0].body).toBe(notifySafeT("en", "notify_support_case_reopened_body"));

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

  it("Pagination: limit/offset page the filter set and total is the exact filtered count", async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 7; i++) {
      rows.push({ id: `p${i}`, status: "WAITING_ADMIN", audience: "MEMBER", last_message_at: `2026-10-0${i + 1}` });
    }
    rows.push({ id: "closed", status: "RESOLVED", audience: "MEMBER", last_message_at: "2026-10-09" });
    const { sb } = makeDb({ support_cases: rows });
    const first = await listSupportCasesForAdmin(sb, { tab: "ACTIONABLE", limit: 3, offset: 0 });
    const last = await listSupportCasesForAdmin(sb, { tab: "ACTIONABLE", limit: 3, offset: 6 });
    if (!first.ok || !last.ok) throw new Error("list failed");
    expect(first.total).toBe(7);
    expect(first.cases.map((c) => c.id)).toEqual(["p0", "p1", "p2"]);
    expect([first.limit, first.offset]).toEqual([3, 0]);
    expect(last.cases.map((c) => c.id)).toEqual(["p6"]);
    expect(last.total).toBe(7);
    const route = readFileSync(join(process.cwd(), "app/api/admin/support/cases/route.ts"), "utf8");
    expect(route).toContain("parseAdminListPage(sp)");
    expect(route).toMatch(/total: res\.total/);
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

  it("Console: reply edit/delete keeps the customer's notification preview in step", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "원문" });
    if (!r.ok) throw new Error(r.error);
    db.notification_events.push({
      id: "ne-1",
      user_id: U,
      type: "support_admin_replied",
      dedupe_key: `support_admin_replied:${r.message.id}`,
      body: "원문",
    });
    await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id, body: "수정본" });
    expect(db.notification_events[0].body).toBe("수정본");
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r.message.id });
    // 언어 재감사 2026-11-27 §4-3: 문장 대신 문구 키 — 알림함이 보는 사람 언어로 그린다
    expect(db.notification_events[0].body).toBe("support_message_deleted");
  });
});

/**
 * 고객 문의 SSOT (docs/support-center/support-inquiry-ssot.md, 2026-11-27) — 재감사 결함 F1~F15 회귀 잠금.
 */
describe("support inquiry SSOT 2026-11-27 — reaudit fixes", () => {
  const OTHER_ADMIN = "33333333-3333-4333-8333-333333333333";

  it("F1: a new inquiry notifies every support admin (admin store + push), keyed by the first message id", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "주문이 안 와요");
    if (!a.ok) throw new Error(a.error);
    expect(adminNotifyCalls).toHaveLength(1);
    const n = adminNotifyCalls[0];
    expect(n.kind).toBe("support_customer_replied");
    expect(n.broadcastPermission).toBe("support");
    expect(n.recipientAdminIds).toBeUndefined();
    expect(n.dedupeKey).toBe(`support_customer_replied:${db.support_messages[0].id}`);
    expect(n.title).toContain(String(a.case.public_case_no));
  });

  it("F1: an unassigned follow-up goes to every support admin; an assigned one to the assignee only", async () => {
    const { sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변" });
    adminNotifyCalls.length = 0;
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 질문" });
    expect(adminNotifyCalls).toHaveLength(1);
    expect(adminNotifyCalls[0].broadcastPermission).toBe("support");

    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN });
    adminNotifyCalls.length = 0;
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또 질문" });
    expect(adminNotifyCalls).toHaveLength(1);
    expect(adminNotifyCalls[0].recipientAdminIds).toEqual([ADMIN]);
    expect(adminNotifyCalls[0].broadcastPermission).toBeUndefined();
  });

  it("F14: assignment by another admin notifies the assignee; self-assignment does not", async () => {
    const { sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    adminNotifyCalls.length = 0;
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN });
    expect(adminNotifyCalls).toHaveLength(0);
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: OTHER_ADMIN });
    expect(adminNotifyCalls).toHaveLength(1);
    expect(adminNotifyCalls[0].kind).toBe("support_case_assigned");
    expect(adminNotifyCalls[0].recipientAdminIds).toEqual([OTHER_ADMIN]);
  });

  it("F6: closing (admin or customer) leaves no admin unread count", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    expect(db.support_cases[0].admin_unread_count).toBe(1);
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(db.support_cases[0].admin_unread_count).toBe(0);

    const second = makeDb();
    const b = await openStructured(second.sb, "ORDER_STATUS", "y");
    if (!b.ok) throw new Error(b.error);
    await adminReplySupportCase(second.sb, { adminUserId: ADMIN, caseId: b.case.id, body: "답변" });
    await postRequesterSupportMessage(second.sb, { userId: U, caseId: b.case.id, body: "추가" });
    const row = second.db.support_cases[0];
    expect(Number(row.admin_unread_count)).toBeGreaterThan(0);
    await requesterCloseSupportCase(second.sb, { userId: U, caseId: b.case.id });
    expect(row.admin_unread_count).toBe(0);
    expect(row.status).toBe("RESOLVED");
  });

  it("F15: the status action cannot move a closed case back to active (reopen path only)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    const r = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "OPEN" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_transition");
    expect(db.support_cases[0].status).toBe("RESOLVED");
  });

  it("F10: reply never closes in the same call (no closeAfter)", () => {
    const svc = readFileSync(join(process.cwd(), "lib/support/support-case-service.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "app/api/admin/support/cases/[caseId]/route.ts"), "utf8");
    expect(svc).not.toContain("closeAfter");
    expect(route).not.toContain("closeAfter");
  });

  it("F7: answered cases with no customer message for 7 days close automatically, silently", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변" });
    const row = db.support_cases[0];
    expect(row.status).toBe("WAITING_USER");
    expect(SUPPORT_AUTO_CLOSE_AFTER_DAYS).toBe(7);
    const lastAt = new Date(String(row.last_message_at));

    const early = await autoCloseStaleAnsweredSupportCases(sb, { now: new Date(lastAt.getTime() + 6 * 86_400_000) });
    expect(early.ok && early.closed).toBe(0);
    expect(row.status).toBe("WAITING_USER");

    notifyCalls.length = 0;
    const late = await autoCloseStaleAnsweredSupportCases(sb, { now: new Date(lastAt.getTime() + 8 * 86_400_000) });
    expect(late.ok && late.closed).toBe(1);
    expect(row.status).toBe("RESOLVED");
    expect(row.admin_unread_count).toBe(0);
    // 고객이 아직 답변을 안 읽었으면 그대로 → 종료돼도 내용이 보인다(F3)
    expect(Number(row.requester_unread_count)).toBeGreaterThan(0);
    expect(notifyCalls).toHaveLength(0);
    expect(
      db.support_case_events.some(
        (e) => e.case_id === row.id && (e.payload as { by?: string } | null)?.by === "auto_7d"
      )
    ).toBe(true);
    expect(shouldRunSupportAutoClose(new Date(Date.UTC(2026, 10, 27, 3, 2)))).toBe(true);
    expect(shouldRunSupportAutoClose(new Date(Date.UTC(2026, 10, 27, 3, 7)))).toBe(false);
  });

  it("F3: requester list keeps closed cases with an unread answer; detail returns them once then marks read", () => {
    expect(requesterVisibleActiveOrFilter()).toBe(
      "status.in.(OPEN,WAITING_ADMIN,WAITING_USER),requester_unread_count.gt.0"
    );
    const route = readFileSync(join(process.cwd(), "app/api/support/cases/[caseId]/route.ts"), "utf8");
    expect(route).toMatch(
      /isSupportTicketClosedStatus\(gate\.case\.status\) && Number\(gate\.case\.requester_unread_count \?\? 0\) > 0[\s\S]{0,400}markSupportCaseReadForRequester/
    );
    const views = readFileSync(join(process.cwd(), "components/support/SupportTicketViews.tsx"), "utf8");
    expect(views).toContain("data-support-ticket-closed-unread");
  });

  it("F4: the submitted screen says when the inquiry joined an open one, with that case's own labels", () => {
    const host = readFileSync(join(process.cwd(), "components/support/SupportModalHost.tsx"), "utf8");
    expect(host).toContain("const merged = json.created === false;");
    expect(host).toContain("json.case.issue_type");
    const views = readFileSync(join(process.cwd(), "components/support/SupportTicketViews.tsx"), "utf8");
    expect(views).toContain('t("support_ticket_merged_heading")');
  });
});

/**
 * 수정 후 재감사 (docs/audit/customer-support-inquiry-reaudit-2026-11-27/final-reaudit.md) D1~D16 회귀 잠금.
 */
describe("support inquiry SSOT 2026-11-27 — post-fix reaudit D1~D16", () => {
  const OTHER_ADMIN = "44444444-4444-4444-8444-444444444444";
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("D2: an assignee must hold the support permission; the assignee notification requires it too", async () => {
    const { sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    authorityAllowsResult.value = false;
    const r = await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: OTHER_ADMIN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("assignee_not_support_admin");
    expect(src("lib/support/support-case-service.ts")).toMatch(
      /recipientAdminIds: \[assignee\],\s*requiredPermission: "support"/
    );
  });

  it("D3: answering / closing / customer close / auto close resolve the case's admin notifications for every admin", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변" });
    expect(adminResolveCalls).toContain(a.case.id);
    adminResolveCalls.length = 0;
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "메모", internalNote: true });
    expect(adminResolveCalls).toHaveLength(0);
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(adminResolveCalls).toContain(a.case.id);

    const second = makeDb();
    const b = await openStructured(second.sb, "ORDER_STATUS", "y");
    if (!b.ok) throw new Error(b.error);
    await adminReplySupportCase(second.sb, { adminUserId: ADMIN, caseId: b.case.id, body: "답변" });
    adminResolveCalls.length = 0;
    await requesterCloseSupportCase(second.sb, { userId: U, caseId: b.case.id });
    expect(adminResolveCalls).toContain(b.case.id);
    expect(db.support_cases).toHaveLength(1);
  });

  it("D10: the actor is never an admin-notification recipient", () => {
    expect(src("lib/support/support-case-service.ts")).toContain("excludeRecipientIds: [input.actorUserId]");
    const svc = src("lib/admin/notifications/admin-notification-service.ts");
    expect(svc).toContain("candidates = candidates.filter((uid) => !excluded.has(uid))");
  });

  it("D11: assigning the same admin twice changes nothing and notifies once", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    adminNotifyCalls.length = 0;
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: OTHER_ADMIN });
    const events = db.support_case_events.length;
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: OTHER_ADMIN });
    expect(adminNotifyCalls.filter((n) => n.kind === "support_case_assigned")).toHaveLength(1);
    expect(db.support_case_events.length).toBe(events);
  });

  it("D14: the compose screen's open list keeps closed cases that still hold an unread answer, answered first", () => {
    const rows = [
      { id: "open", status: "OPEN", last_message_at: "2026-11-27T03:00:00Z", requester_unread_count: 0 },
      { id: "closed-read", status: "RESOLVED", last_message_at: "2026-11-27T04:00:00Z", requester_unread_count: 0 },
      { id: "closed-unread", status: "RESOLVED", last_message_at: "2026-11-27T01:00:00Z", requester_unread_count: 1 },
    ];
    expect(sortActiveSupportTickets(rows).map((r) => r.id)).toEqual(["closed-unread", "open"]);
  });

  it("D1·D7·D9·D12·D15·D4/D13: wiring", () => {
    const host = src("components/support/SupportModalHost.tsx");
    expect(host).toContain("onUnauthorized={handleUnauthorized}");
    const views = src("components/support/SupportTicketViews.tsx");
    expect(views).toContain("}, [caseId]);");
    expect(views).toContain("closedUnreadSeen");
    expect(views).toContain("if (stale()) return;");
    const bridge = src("components/notifications/NotificationsBadgeRealtimeBridge.tsx");
    expect(bridge).toMatch(/eventType === "RESYNC"\) dispatchSupportNotificationArrived\(\)/);
    expect(bridge).toMatch(/requestNotificationBadgeCountResync\("app_resume"\);[\s\S]{0,200}dispatchSupportNotificationArrived\(\)/);
    const svc = src("lib/support/support-case-service.ts");
    expect(svc).toContain('return { ok: false, error: "first_message_failed" };');
    expect(svc).toContain("if (/support_case_closed/.test(error?.message ?? \"\")) return { ok: false, error: \"case_closed\" };");
    expect(svc).toContain("keepAliveAfterResponse(work)");
    const customerRoute = src("app/api/support/cases/[caseId]/route.ts");
    expect(customerRoute).not.toContain("reopenSupportCase");
    const adminRoute = src("app/api/admin/support/cases/[caseId]/route.ts");
    expect(adminRoute).not.toContain("requireAuthenticatedUserId");
    expect(adminRoute).toContain("includeAdmin: true");
    const mig = src("supabase/migrations/20271127230000_support_append_message_closed_guard.sql");
    expect(mig).toContain("RAISE EXCEPTION 'support_case_closed'");
    expect(mig).toMatch(/ELSE\s*-- 어드민 메모[\s\S]*SET updated_at = v_now/);
  });
});

/**
 * 2차 재감사 (docs/audit/customer-support-inquiry-reaudit-2026-11-27/final-reaudit-2.md) A~J — 실패 상황 그대로 재현하는 동작 시험.
 */
describe("support inquiry SSOT 2026-11-27 — second reaudit A~J (behaviour)", () => {
  const OTHER_ADMIN = "55555555-5555-4555-8555-555555555555";
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("A: 「확인했어요」 after an unseen newer answer does NOT close — returns case_updated, answer stays unread", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 A" });
    const seenByCustomer = String(db.support_cases[0].last_message_at); // 고객 화면이 본 시각
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 B" }); // 고객은 아직 못 봄
    const r = await requesterCloseSupportCase(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: seenByCustomer });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("case_updated");
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    expect(Number(db.support_cases[0].requester_unread_count)).toBe(2);

    const latestSeen = String(db.support_cases[0].last_message_at);
    const ok = await requesterCloseSupportCase(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: latestSeen });
    expect(ok.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
  });

  it("B: deleting an already-read answer keeps the unread count; deleting the unread one lowers it", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const ra = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 A" });
    const rb = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 B" });
    if (!ra.ok || !rb.ok) throw new Error("reply failed");
    // 고객이 A 는 읽고 B 는 아직 안 읽음 = 미읽음 1
    db.support_cases[0].requester_unread_count = 1;
    db.notification_events.push(
      { id: "ne-a", user_id: U, type: "support_admin_replied", dedupe_key: `support_admin_replied:${ra.message.id}`, unread: false },
      { id: "ne-b", user_id: U, type: "support_admin_replied", dedupe_key: `support_admin_replied:${rb.message.id}`, unread: true }
    );
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: ra.message.id });
    expect(db.support_cases[0].requester_unread_count).toBe(1);
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: rb.message.id });
    expect(db.support_cases[0].requester_unread_count).toBe(0);
  });

  it("E: mark-read never clears messages that arrived after the list the viewer was shown", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 A" });
    const shownAt = String(db.support_cases[0].last_message_at);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 B" });
    const r = await markSupportCaseReadForRequester(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: shownAt });
    expect(r.ok && r.wrote).toBe(false);
    expect(Number(db.support_cases[0].requester_unread_count)).toBe(2);

    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 1" });
    const adminShownAt = String(db.support_cases[0].last_message_at);
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 2" });
    const ra = await markSupportCaseReadForAdmin(sb, a.case.id, adminShownAt);
    expect(ra.ok && ra.wrote).toBe(false);
    expect(Number(db.support_cases[0].admin_unread_count)).toBeGreaterThan(0);
  });

  it("E2: a deferred admin notification is not created once the admin already answered", () => {
    const svc = src("lib/support/support-case-service.ts");
    expect(svc).toMatch(/if \(liveStatus !== "OPEN" && liveStatus !== "WAITING_ADMIN"\) return;/);
  });

  it("F/G: merge into a case closed meanwhile → new case; session failure → no empty case left (structure)", () => {
    const svc = src("lib/support/support-case-service.ts");
    expect(svc).toContain('if (continued.ok || continued.error !== "case_closed") return continued;');
    expect(svc).toMatch(/if \(!session\.ok\) \{\s*await discardFailedNewCase\(sb, created\.id\);/);
    expect(src("app/api/support/cases/open/route.ts")).toContain('res.error === "case_closed"');
  });

  it("I: the assignment notification requires the support permission; customer-message notifications exclude the sender", async () => {
    const { sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    expect(adminNotifyCalls[0]?.excludeRecipientIds).toEqual([U]);
    adminNotifyCalls.length = 0;
    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: OTHER_ADMIN });
    const assigned = adminNotifyCalls.find((n) => n.kind === "support_case_assigned");
    expect(assigned?.requiredPermission).toBe("support");
    expect(src("components/admin/store-points/AdminStorePointPendingProvider.tsx")).toContain("!fromSelf &&");
    const mig = src("supabase/migrations/20271127240000_support_replay_unassigned.sql");
    expect(mig).toContain("c.assigned_admin_id is null and c.status in ('OPEN', 'WAITING_ADMIN')");
    expect(mig).toContain("'excludeRecipientIds', jsonb_build_array(r.sender_user_id)");
  });

  it("J: reopen is admin-only (customer API has no reopen; service always uses the admin gate)", () => {
    const svc = src("lib/support/support-case-service.ts");
    expect(svc).toMatch(/export async function reopenSupportCase[\s\S]{0,400}const gate = await getSupportCaseForAdmin\(sb, input\.caseId\);/);
    expect(src("app/api/support/cases/[caseId]/route.ts")).not.toContain("reopenSupportCase");
  });

  it("H: the admin console uses the admin error copy, never raw codes or customer copy", () => {
    const page = src("components/admin/support/AdminSupportPage.tsx");
    expect(page).not.toContain("supportErrorLabel(safeT");
    expect(page).toContain("adminSupportErrorLabel(safeT, error)");
    expect(page).not.toContain("manualListLoadAtRef");
  });
});
