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

/** 응답 뒤 작업(Next `after`) — 모아 두었다가 flush 에서 실행(다른 시험으로 새지 않게 beforeEach 에서 버림) */
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (task: (() => unknown) | Promise<unknown>) => {
    afterQueue.push(typeof task === "function" ? task : () => task);
  },
}));

const notifyCalls: { type: string; userId: string; dedupeKey: string; body?: string; deferPush?: boolean }[] = [];
/** 응답 뒤 푸시 발송(원장 · 2026-11-29) — 저장된 알림 행 유형 */
const pushCalls: { type: string; body?: string }[] = [];

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: vi.fn(
    async (
      _sb: unknown,
      input: { type: string; userId: string; dedupeKey: string; body?: string },
      opts?: { deferPush?: boolean }
    ) => {
      // 실제 알림 파이프라인과 같게: 같은 dedupe 키는 두 번 만들지 않는다(duplicate)
      if (notifyCalls.some((c) => c.dedupeKey === input.dedupeKey && c.userId === input.userId)) {
        return { ok: false, duplicate: true, error: "duplicate" };
      }
      notifyCalls.push({
        type: input.type,
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        body: input.body,
        deferPush: opts?.deferPush === true,
      });
      return { ok: true, row: { id: "n", type: input.type, body: input.body } };
    }
  ),
  dispatchNotificationEvent: vi.fn(async (_sb: unknown, row: { type: string; body?: string }) => {
    pushCalls.push({ type: row.type, body: row.body });
    return "sent";
  }),
}));

const adminNotifyCalls: {
  kind: string;
  title: string;
  dedupeKey: string;
  recipientAdminIds?: string[];
  broadcastPermission?: string | null;
  requiredPermission?: string | null;
  excludeRecipientIds?: readonly string[];
  push?: boolean;
}[] = [];

const adminResolveCalls: string[] = [];
const adminResolveInputs: { workRef: { id: string }; kinds: readonly string[]; dedupeKeys?: readonly string[] }[] = [];
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
        push?: boolean;
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
        push: input.push,
      });
      return { ok: true, created: 1, skippedRecipients: 0, pushed: 1 };
    }
  ),
  markAdminNotificationsRead: vi.fn(async () => ({ ok: false, error: "nothing_to_mark" })),
  resolveAdminNotificationsForWork: vi.fn(
    async (_sb: unknown, input: { workRef: { id: string }; kinds: readonly string[]; dedupeKeys?: readonly string[] }) => {
      adminResolveCalls.push(input.workRef.id);
      adminResolveInputs.push(input);
      return 0;
    }
  ),
  authorityAllows: vi.fn(() => authorityAllowsResult.value),
  authorityConfirmedLoss: vi.fn((a: { active?: boolean; unknown?: boolean }) => !(a?.active === false && a?.unknown) && !authorityAllowsResult.value),
  settleSupportCustomerMessageNotification: vi.fn(async () => undefined),
  resolveAdminRecipientAuthority: vi.fn(async () => ({ active: true, isSuperAdmin: true, permissions: [] })),
}));

vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: vi.fn(async () => ({ ok: false })),
}));

import {
  SUPPORT_REPLY_SEEN_RECORD_SINCE,
  supportCustomerMessageNeedsAdmin,
  supportReplySawMessage,
} from "@/lib/support/support-admin-work-check";
import {
  notifyAdminsOfCustomerMessage,
  supportShownListSeenAt,
  markSupportCaseReadForRequester,
  markSupportCaseReadForAdmin,
  adminAssignSupportCase,
  adminDeleteSupportMessage,
  adminEditSupportMessage,
  adminReplySupportCase,
  settleAdminWorkAfterSeenReply,
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
  sumSupportRequesterUnread,
} from "@/lib/support/support-case-service";
import { checkSupportCustomerPostRate } from "@/lib/support/support-customer-rate-limit";
import { createSupportRpcEmulator } from "@/lib/support/__tests__/support-rpc-emulator";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { toSupportRequesterCaseView, toSupportRequesterMessageView } from "@/lib/support/support-requester-view";
import { releaseSupportAssignmentsOnRevoke } from "@/lib/admin/admin-membership";
import {
  ADMIN_SUPPORT_LIST_FILTERS,
  isAdminSupportListFilter,
} from "@/lib/support/support-case-types";
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
  const now = () => new Date(Date.UTC(2026, 11, 1) + ++tick).toISOString(); // 본 시각 규칙 시작(2026-11-28) 뒤 — 기록 없는 답변 = 안 봤음
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
      gte: (c: string, v: unknown) => {
        st.filters.push((r) => String(r[c] ?? "") >= String(v));
        return b;
      },
      gt: (c: string, v: unknown) => {
        st.filters.push((r) => String(r[c] ?? "") > String(v));
        return b;
      },
      lte: (c: string, v: unknown) => {
        st.filters.push((r) => String(r[c] ?? "") <= String(v));
        return b;
      },
      neq: (c: string, v: unknown) => {
        st.filters.push((r) => r[c] !== v);
        return b;
      },
      is: (c: string, v: unknown) => {
        st.filters.push((r) => (r[c] ?? null) === v);
        return b;
      },
      /** `not(col, "in", "(A,B)")` 만 */
      not: (c: string, op: string, v: string) => {
        const vals = op === "in" ? v.replace(/[()]/g, "").split(",") : [v];
        st.filters.push((r) => !vals.includes(String(r[c])));
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
  // 전체 수정 (2026-11-29): DB 함수는 시험용 흉내(support-rpc-emulator — 20271129100000 SQL 과 같은 규칙)
  const emulateRpc = createSupportRpcEmulator(db, now);
  const rpcCalls: string[] = [];
  const sb = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push(name);
      return emulateRpc(name, args) ?? { data: null, error: { message: `no rpc ${name}` } };
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
const openStructuredRaw = (sb: never, issueType: string, summary: string) =>
  openSupportCaseFromContext(sb, {
    userId: U,
    context: ctx(),
    issueType,
    initialSummary: summary,
    initialBody: summary,
    allowMissingIssue: false,
  });

/** 응답 뒤로 미룬 어드민 알림 발송(after)까지 끝나게 — 시험은 그 결과를 본다 */
const flush = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise<void>((r) => setTimeout(r, 0));
    const tasks = afterQueue.splice(0);
    if (tasks.length === 0) break;
    await Promise.all(tasks.map((t) => Promise.resolve().then(t).catch(() => undefined)));
  }
};
const openStructured = async (sb: never, issueType: string, summary: string) => {
  const r = await openStructuredRaw(sb, issueType, summary);
  await flush();
  return r;
};

beforeEach(() => {
  afterQueue.length = 0;
  notifyCalls.length = 0;
  pushCalls.length = 0;
  adminNotifyCalls.length = 0;
  adminResolveCalls.length = 0;
  adminResolveInputs.length = 0;
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
    await flush(); // 최종 감사 L7: 고객 알림은 응답 뒤
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
    // UI U1·U2 (2026-11-27): 상태 알약은 고객 화면 공용 정의(supportRequesterStatusPill) — 미읽음은 색·문구 판정에만 쓴다
    // 최종 감사 U-10: 행은 공용 행(SupportCaseRowButton) — 알약 판정은 그 행에서
    expect(hist).toContain("<SupportCaseRowButton");
    expect(readFileSync(join(process.cwd(), "components/support/SupportCaseRow.tsx"), "utf8")).toContain(
      "supportRequesterStatusPill(c.status, c.requester_unread_count)"
    );
    // 숫자는 고객센터 FAB 아이콘에만 — 목록 행에는 숫자를 그리지 않는다(Owner 2026-11-10)
    expect(hist).not.toMatch(/\{c\.requester_unread_count\}/);
  });

  it("DEF-07/10/11/12: customer modal failure, restore and audience contracts", () => {
    const host = readFileSync(join(process.cwd(), "components/support/SupportModalHost.tsx"), "utf8");
    const views = readFileSync(join(process.cwd(), "components/support/SupportTicketViews.tsx"), "utf8");
    // 계약 §5: 네트워크 실패 = 요청 실행기 한 곳에서 network_error(상세는 그 값을 오류로 그림)
    const ops = readFileSync(join(process.cwd(), "lib/support/support-modal-ops.ts"), "utf8");
    expect(ops).toMatch(/catch \{[\s\S]*error: "network_error"/);
    // 최종 감사: case_closed·case_updated·invalid_transition 이면 다시 읽는다(단일 판정 supportErrorNeedsReload)
    expect(views).toContain("if (supportErrorNeedsReload(res.error)) void load();");
    // 병합 전 2차 6: 새 문의 대상 = 그 문의의 대상 먼저(동작 시험은 support-ui-final-check 「병합 전 2차 6」)
    expect(host).toContain("(caseAudience ?? prev?.audience)");
    // 상태 기계(옛 컨트롤러 흡수): 닫기 intent 가 복원값을 지운다
    const ctrl = readFileSync(join(process.cwd(), "lib/support/support-modal-machine.ts"), "utf8");
    expect(ctrl).toMatch(/case "close":[\s\S]{0,120}clearSupportModalRestoreCaseId\(\)/);
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
    // 전체 수정 §2: 접수 = support_open_case 한 트랜잭션(안에서 첫 글) · 답변 = support_append_message
    expect(rpcCalls.filter((n) => n === "support_open_case")).toHaveLength(1);
    expect(rpcCalls.filter((n) => n === "support_append_message")).toHaveLength(1);
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
    await flush(); // 최종 감사 L7: 고객 알림은 응답 뒤
    const resolved = notifyCalls.find((n) => n.type === "support_case_resolved");
    expect(resolved?.userId).toBe(U);
    // 4절 문구 — 문구 모음(받는 사람 언어). 이 가짜 DB 는 프로필이 없어 기본 언어(en).
    expect(resolved?.body).toBe(notifySafeT("en", "notify_support_case_resolved_body"));

    notifyCalls.length = 0;
    const byAdmin = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    expect(byAdmin.ok).toBe(true);
    await flush();
    const reopened = notifyCalls.filter((n) => n.type === "support_case_reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0].userId).toBe(U);
    expect(reopened[0].body).toBe(notifySafeT("en", "notify_support_case_reopened_body"));

    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    notifyCalls.length = 0;
    const bySelf = await reopenSupportCase(sb, { userId: U, caseId: a.case.id });
    expect(bySelf.ok).toBe(true);
    await flush();
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
    await flush(); // 어드민 알림 = 응답 뒤
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
    await flush();
    expect(adminNotifyCalls).toHaveLength(1);
    expect(adminNotifyCalls[0].broadcastPermission).toBe("support");

    await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: ADMIN });
    adminNotifyCalls.length = 0;
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또 질문" });
    await flush();
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
    // 최종 감사 L6: 고객 「확인했어요」는 답변 뒤(WAITING_USER)만 — 추가 문의에 다시 답한 뒤 닫는다(어드민 미읽음은 남아 있다)
    await adminReplySupportCase(second.sb, { adminUserId: ADMIN, caseId: b.case.id, body: "다시 답변" });
    const row = second.db.support_cases[0];
    expect(row.status).toBe("WAITING_USER");
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

  it("F10 (구조 확인): reply never closes in the same call (no closeAfter)", () => {
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
    await flush(); // 답변 알림(응답 뒤)을 먼저 끝낸다 — 아래 「자동 종료 알림 0」 판정과 섞이지 않게
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

  it("F3 (구조 확인): requester list keeps closed cases with an unread answer; detail returns them once then marks read", () => {
    expect(requesterVisibleActiveOrFilter()).toBe(
      "status.in.(OPEN,WAITING_ADMIN,WAITING_USER),requester_unread_count.gt.0"
    );
    const route = readFileSync(join(process.cwd(), "app/api/support/cases/[caseId]/route.ts"), "utf8");
    // 전체 수정 §3: GET 은 종료+안 읽은 답변의 내용을 돌려주기만 — 읽음은 seen(동작 시험 support-full-fix-server-2026-11-29)
    expect(route).toContain("if (closed && !(unreadCount > 0))");
    expect(route).toContain("requesterSeenSupportCase(sb");
    const views = readFileSync(join(process.cwd(), "components/support/SupportTicketViews.tsx"), "utf8");
    expect(views).toContain("data-support-ticket-closed-unread");
  });

  it("F4 (구조 확인): the submitted screen says when the inquiry joined an open one, with that case's own labels", () => {
    const host = readFileSync(join(process.cwd(), "components/support/SupportModalHost.tsx"), "utf8");
    expect(host).toContain("const merged = res.json.created === false;");
    expect(host).toContain("opened.issue_type");
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
    // 전체 수정 §2 (S-16): 종료의 어드민 알림 읽음은 DB 함수가 같은 트랜잭션에서 — 받은 어드민 전원 행
    const alertRow = (caseId: string, admin: string) => ({
      id: `n-${admin}-${caseId}`, recipient_admin_id: admin, kind: "support_customer_replied",
      work_ref_table: "support_cases", work_ref_id: caseId, dedupe_key: `support_customer_replied:x-${caseId}`, read_at: null,
    });
    (db.admin_notifications ??= []).push(alertRow(a.case.id, ADMIN), alertRow(a.case.id, OTHER_ADMIN));
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(db.admin_notifications.every((n) => n.read_at)).toBe(true);

    const second = makeDb();
    const b = await openStructured(second.sb, "ORDER_STATUS", "y");
    if (!b.ok) throw new Error(b.error);
    await adminReplySupportCase(second.sb, { adminUserId: ADMIN, caseId: b.case.id, body: "답변" });
    (second.db.admin_notifications ??= []).push(alertRow(b.case.id, ADMIN), alertRow(b.case.id, OTHER_ADMIN));
    await requesterCloseSupportCase(second.sb, { userId: U, caseId: b.case.id });
    expect(second.db.admin_notifications.every((n) => n.read_at)).toBe(true);
    expect(db.support_cases).toHaveLength(1);
  });

  it("D10 (구조 확인): the actor is never an admin-notification recipient", () => {
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

  it("D1·D7·D9·D12·D15·D4/D13 (구조 확인): wiring", () => {
    const host = src("components/support/SupportModalHost.tsx");
    // 계약 §5: 401 = 요청 실행기 한 규칙(auth_out → 로그인 화면) — 호스트는 그 화면을 그린다
    expect(host).toContain('case "login":');
    expect(src("lib/support/support-modal-ops.ts")).toContain('dispatchSupportModalIntent({ type: "auth_out" })');
    const views = src("components/support/SupportTicketViews.tsx");
    expect(views).toContain("}, [viewId, caseId]);");
    expect(views).toContain("closedUnreadSeen");
    expect(views).toContain("if (stale() || !res.current) return;");
    const bridge = src("components/notifications/NotificationsBadgeRealtimeBridge.tsx");
    // 전체 수정 §4 A-3: RESYNC + support_* 알림 행 UPDATE 일 때만 (동작 시험 = support-modal-machine-2026-11-28 「A-3」)
    expect(bridge).toMatch(/eventType === "RESYNC" \|\| \(eventType === "UPDATE" && isSupportNotificationRealtimeRow\(row\)\)/);
    expect(bridge).toMatch(/requestNotificationBadgeCountResync\("app_resume"\);[\s\S]{0,200}dispatchSupportNotificationArrived\(\)/);
    const svc = src("lib/support/support-case-service.ts");
    // 전체 수정 §2: 접수(문의·세션·첫 글·사건)는 DB 함수 한 트랜잭션 — 빈 문의가 남을 수 없다
    expect(svc).toContain('sb.rpc("support_open_case"');
    expect(svc).toContain("if (/support_case_closed/.test(error?.message ?? \"\")) return { ok: false, error: \"case_closed\" };");
    expect(svc).toMatch(/runAfterResponse\(\(\) =>\s+notifyAdminsOfCustomerMessage\(sb, input\)/);
    const customerRoute = src("app/api/support/cases/[caseId]/route.ts");
    expect(customerRoute).not.toContain("reopenSupportCase");
    const adminRoute = src("app/api/admin/support/cases/[caseId]/route.ts");
    expect(adminRoute).not.toContain("requireAuthenticatedUserId");
    expect(adminRoute).toContain("adminSeenSupportCase(sb");
    expect(src("lib/support/support-notification-ledger.ts")).toContain("includeAdmin: true");
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

  it("B+E: an answer that arrived after the shown list keeps its bell row unread, so deleting it still lowers the count", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const ra = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 A" });
    if (!ra.ok) throw new Error(ra.error);
    const shownIds = db.support_messages.map((m) => String(m.id)); // 고객 화면이 받은 목록 (A 까지)
    const shownAt = String(db.support_cases[0].last_message_at);
    const rb = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 B" }); // 목록을 읽은 뒤 도착
    if (!rb.ok) throw new Error(rb.error);
    const row = (id: string, msg: string) => ({
      id,
      user_id: U,
      type: "support_admin_replied",
      dedupe_key: `support_admin_replied:${msg}`,
      unread: true,
      read_at: null,
      display_payload: { supportCaseId: a.case.id },
    });
    db.notification_events.push(row("ne-a", String(ra.message.id)), row("ne-b", String(rb.message.id)));

    await markSupportCaseReadForRequester(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: shownAt });
    await markSupportCaseNotificationsRead(sb, { userId: U, caseId: a.case.id, shownMessageIds: shownIds });
    expect(db.notification_events.find((n) => n.id === "ne-a")?.unread).toBe(false);
    expect(db.notification_events.find((n) => n.id === "ne-b")?.unread).toBe(true);
    // 남은 위험 ①: 숫자 = 아직 안 본 답변(B) 1 — 알림 행(B 만 안 읽음)과 같다
    expect(Number(db.support_cases[0].requester_unread_count)).toBe(1);

    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: String(rb.message.id) });
    expect(Number(db.support_cases[0].requester_unread_count)).toBe(0);
  });

  it("E: mark-read never clears messages that arrived after the list the viewer was shown", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 A" });
    const shownAt = String(db.support_cases[0].last_message_at);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 B" });
    const r = await markSupportCaseReadForRequester(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: shownAt });
    // 남은 위험 ①: 본 목록 뒤에 온 답변 B 만 남긴다(통째로 2 가 아니라 정확히 1)
    expect(r.ok && r.wrote).toBe(true);
    expect(Number(db.support_cases[0].requester_unread_count)).toBe(1);

    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 1" });
    const adminShownAt = String(db.support_cases[0].last_message_at);
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 2" });
    const ra = await markSupportCaseReadForAdmin(sb, a.case.id, adminShownAt);
    // 어드민 쪽도 본 목록 뒤의 고객 글(추가 2) 1건만 남긴다
    expect(ra.ok && ra.wrote).toBe(true);
    expect(Number(db.support_cases[0].admin_unread_count)).toBe(1);
  });

  it("E2 (구조 확인): a deferred admin notification is not created once the admin already answered", () => {
    const svc = src("lib/support/support-case-service.ts");
    // 남은 위험 ③④: 끝난 일 = 처리됨 재생 키만(알림 없음) · 상태를 못 읽으면 보내지 않음(재생 함수가 남은 일만 다시 만든다)
    expect(svc).toContain('const workDone = verdict === "skip";');
    expect(svc).toContain("supportCustomerMessageNeedsAdmin(sb, { caseId: c.id, messageId: input.messageId })");
    expect(svc).toMatch(/if \(workDone\) \{[\s\S]{0,200}markCustomerMessageHandledForReplay\(sb,/);
    expect(svc).toMatch(/if \(verdict === "retry"\) \{[\s\S]{0,300}return;/);
  });

  it("남은 위험 ④: admin work already finished at send time → no admin notification, only a handled replay key", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const r = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    if (!r.ok) throw new Error(r.error);
    await flush();
    adminNotifyCalls.length = 0;
    db.support_cases[0].status = "WAITING_USER"; // 발송 시점에 어드민이 이미 답함
    await notifyAdminsOfCustomerMessage(sb, {
      caseRow: db.support_cases[0] as never,
      messageId: String(r.message.id),
      body: "추가",
      actorUserId: U,
      isNewCase: false,
    });
    expect(adminNotifyCalls).toHaveLength(0); // 알림함·푸시 없음
    const marker = (db.admin_notification_outbox ?? []).find(
      (o) => o.source_key === `support_customer_replied:${r.message.id}`
    );
    expect(marker?.status).toBe("delivered"); // 재생 함수가 이 키를 보고 건너뛴다

    // 아직 어드민 일이 남은 새 고객 글 = 평소대로 발송
    const next = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "또" });
    if (!next.ok) throw new Error(next.error);
    await flush();
    adminNotifyCalls.length = 0;
    await notifyAdminsOfCustomerMessage(sb, {
      caseRow: db.support_cases[0] as never,
      messageId: String(next.message.id),
      body: "또",
      actorUserId: U,
      isNewCase: false,
    });
    expect(adminNotifyCalls).toHaveLength(1);
    expect(adminNotifyCalls[0].push).toBe(true);
  });

  it("남은 위험 ① (4차): the read cutoff is the newest shown message, so a reply that arrived before the list read counts as seen", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 A" });
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변 B" }); // 문의 행 읽은 뒤·목록 읽기 전에 도착
    const shownList = db.support_messages.map((m) => ({ created_at: String(m.created_at) })); // 목록엔 B 까지 있음
    const seen = supportShownListSeenAt(shownList, "2000-01-01T00:00:00Z");
    expect(seen).toBe(String(db.support_messages[db.support_messages.length - 1].created_at));
    await markSupportCaseReadForRequester(sb, { userId: U, caseId: a.case.id, seenLastMessageAt: seen });
    expect(Number(db.support_cases[0].requester_unread_count)).toBe(0);
    expect(supportShownListSeenAt([], "fallback-at")).toBe("fallback-at");
  });

  it("남은 위험 5 (구조 확인): admin detail marks only the shown customer messages' admin notifications read", () => {
    // 전체 수정 §3: 어드민 seen 이 보여 준 글 id 를 그대로 원장에 넘긴다(동작 시험 support-full-fix-server-2026-11-29 A-1)
    const route = src("app/api/admin/support/cases/[caseId]/route.ts");
    expect(route).toContain("shownMessageIds: shown,");
    const ledger = src("lib/support/support-notification-ledger.ts");
    expect(ledger).toContain("shownCustomerMessageIds: input.shownMessageIds,");
    expect(ledger).toContain("dedupeKeys: input.shownCustomerMessageIds!.map((id) => `support_customer_replied:${id}`)");
  });

  it("6차 2: an already-answered old message is not 'needed' even after a newer customer message reopens admin work (동작)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 글");
    if (!a.ok) throw new Error(a.error);
    const first = String(db.support_messages[0].id);
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: first })).toBe("send");
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답변" });
    const later = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "새 글" });
    if (!later.ok) throw new Error(later.error);
    await flush();
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN"); // 다시 어드민 일이 생겼지만
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: first })).toBe("skip"); // 옛 글은 이미 답 받음
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: String(later.message.id) })).toBe("send");
  });

  it("F/G (구조 확인): merge into a case closed meanwhile → new case; session failure → no empty case left (structure)", () => {
    // 전체 수정 §2 (S-4): 붙이기·새 문의·세션은 DB 함수 한 트랜잭션(FOR UPDATE 로 그사이 종료된 문의는 새 문의) — 빈 문의 지우기 경로 없음
    const svc = src("lib/support/support-case-service.ts");
    expect(svc).not.toContain("discardFailedNewCase");
    const mig = src("supabase/migrations/20271129100000_support_full_fix.sql");
    expect(mig).toContain("AND c.status IN ('OPEN', 'WAITING_ADMIN', 'WAITING_USER')\n   ORDER BY c.last_message_at DESC\n   LIMIT 1\n   FOR UPDATE;");
    expect(mig).toContain("ON CONFLICT (case_id) WHERE closed_at IS NULL DO NOTHING");
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
    // 3차 재감사 1: 담당자 유무와 무관하게 어드민 일이 남은 문의만 재생(앱 응답 뒤 발송과 같은 조건)
    expect(mig).toContain("and c.status in ('OPEN', 'WAITING_ADMIN')");
    expect(mig).toContain("or c.assigned_admin_id is null");
    expect(mig).toContain("case when r.is_first then '새 고객 문의 · ' else '고객 추가 문의 · ' end");
    expect(mig).toContain("'excludeRecipientIds', jsonb_build_array(r.sender_user_id)");
  });

  it("J (구조 확인): reopen is admin-only (customer API has no reopen; service always uses the admin gate)", () => {
    const svc = src("lib/support/support-case-service.ts");
    // 전체 수정 §2: 재오픈 = DB 함수 전이 표(어드민 경로에서만 부른다)
    expect(svc).toMatch(/export async function reopenSupportCase[\s\S]{0,600}action: "reopen"/);
    expect(src("app/api/support/cases/[caseId]/route.ts")).not.toContain("reopenSupportCase");
  });

  it("H (구조 확인): the admin console uses the admin error copy, never raw codes or customer copy", () => {
    const page = src("components/admin/support/AdminSupportPage.tsx");
    expect(page).not.toContain("supportErrorLabel(safeT");
    expect(page).toContain("adminSupportErrorLabel(safeT, error)");
    expect(page).not.toContain("manualListLoadAtRef");
  });
});

describe("support final audit 2026-11-28 — D1·D5·L1~L11 (동작)", () => {
  const OTHER_ADMIN = "44444444-4444-4444-8444-444444444444";
  const customerMsgs = (db: Record<string, Row[]>) =>
    db.support_messages.filter((m) => m.sender_type === "MEMBER" || m.sender_type === "OWNER");

  it("D1: a customer message that arrived while the admin was writing keeps the case in 「답변 필요」 and its alert unread", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 문의");
    if (!a.ok) throw new Error(a.error);
    // 어드민이 상세를 연 시점의 last_message_at
    const seen = String(db.support_cases[0].last_message_at);
    const first = customerMsgs(db)[0];
    // 답을 쓰는 사이 고객이 추가 글
    const late = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "그사이 추가" });
    if (!late.ok) throw new Error(late.error);
    await flush();
    adminNotifyCalls.length = 0;
    adminResolveInputs.length = 0;
    const r = await adminReplySupportCase(sb, {
      adminUserId: ADMIN,
      caseId: a.case.id,
      body: "답변",
      seenLastMessageAt: seen,
    });
    expect(r.ok && r.unseenCustomerMessages).toBe(1);
    // 고치기 전: 무조건 WAITING_USER(고객 확인 대기) → 「답변 필요」 탭에서 빠졌다
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
    // 본 글(첫 글) 알림만 읽음 · 담당 지정 알림은 종류로 읽음 · 그사이 온 글 알림은 남는다
    const replies = adminResolveInputs.find((i) => i.kinds.includes("support_customer_replied"));
    expect(replies?.dedupeKeys).toEqual([`support_customer_replied:${first.id}`]);
    expect(adminResolveInputs.some((i) => i.kinds.includes("support_case_assigned") && !i.dedupeKeys)).toBe(true);
    // 그 글 알림이 아직 없었어도 만든다(같은 dedupe 키 — 중복 없음)
    await flush();
    expect(adminNotifyCalls.map((c) => c.dedupeKey)).toContain(`support_customer_replied:${late.message.id}`);
    // 작업 판정도 같은 뜻: 답변보다 먼저 왔지만 못 본 글 = 아직 어드민 일
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: late.message.id })).toBe("send");
    // 첫 글은 답을 받았고 그 뒤 고객 글이 남은 일 → skip 은 아님(답변 뒤 고객 글 없음) — 본 글은 읽음 처리로 끝난다
    // 3차 재감사: 답변마다 「본 시각」 기록 1건 (판정의 유일한 근거)
    const seenEv = db.support_case_events.filter((e) => e.event_type === "admin_reply_seen");
    expect(seenEv).toHaveLength(1);
    expect((seenEv[0].payload as { seen_at?: string }).seen_at).toBe(seen);
  });

  it("3차 재감사: a reply whose seen record is not in yet never counts as having seen (no false 「answered」)", () => {
    const after = (min: number) => new Date(Date.parse(SUPPORT_REPLY_SEEN_RECORD_SINCE) + min * 60_000).toISOString();
    const reply = { id: "r1", created_at: after(10) };
    const msgAt = after(5);
    // 기록 아직 없음 → 안 봤음 (두 어드민 동시 답변 경합에서 상대 기록이 늦어도 알림을 잃지 않는다)
    expect(supportReplySawMessage(reply, new Map(), msgAt)).toBe(false);
    // 기록 = 본 시각이 글보다 이르면 안 봤음 · 같거나 늦으면 봤음
    expect(supportReplySawMessage(reply, new Map([["r1", Date.parse(after(4))]]), msgAt)).toBe(false);
    expect(supportReplySawMessage(reply, new Map([["r1", Date.parse(after(5))]]), msgAt)).toBe(true);
    // 규칙 시작 전 옛 답변(기록 없음) = 그때까지 모두 봄
    const old = { id: "r0", created_at: "2026-11-01T00:00:00.000Z" };
    expect(supportReplySawMessage(old, new Map(), "2026-10-31T00:00:00.000Z")).toBe(true);
  });

  it("3차 재감사: two stale admins answering at the same moment — the other's seen record arriving late does not lose the message", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 문의");
    if (!a.ok) throw new Error(a.error);
    const s0 = String(db.support_cases[0].last_message_at);
    const m = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "M" });
    if (!m.ok) throw new Error(m.error);
    await flush();
    // B 의 답변 R 은 저장됐지만 「본 시각」 기록은 아직(경합) — 규칙 시작 뒤 시각으로 직접 넣는다
    const rAt = new Date(Date.parse(String(db.support_cases[0].last_message_at)) + 60_000).toISOString();
    db.support_messages.push({
      id: randomUUID(), case_id: a.case.id, sender_type: "ADMIN", sender_admin_id: OTHER_ADMIN, message_type: "PUBLIC",
      body: "B 답(기록 전)", created_at: rAt, deleted_at: null,
    });
    db.support_messages.forEach((x) => {
      if (x.id === m.message.id) x.created_at = new Date(Date.parse(rAt) - 30_000).toISOString();
    });
    db.support_cases[0].status = "WAITING_ADMIN";
    // 이 순간(B 기록 전) 도는 판정 = 어드민 일 남음 — 「답 받음」으로 읽음 처리되지 않는다
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: m.message.id })).toBe("send");
    // B 가 M 을 못 본 기록(본 시각 s0)이 들어와도 그대로
    db.support_case_events.push({
      id: randomUUID(), case_id: a.case.id, event_type: "admin_reply_seen", actor_user_id: null,
      payload: { reply_message_id: db.support_messages[db.support_messages.length - 1].id, seen_at: s0 }, created_at: rAt,
    });
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: m.message.id })).toBe("send");
  });

  it("2차 재감사: two stale admins reply in turn — a message neither saw stays unseen (case 「답변 필요」, alert kept)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 문의");
    if (!a.ok) throw new Error(a.error);
    const s0 = String(db.support_cases[0].last_message_at); // 두 어드민 모두 이 화면
    const m1 = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "M1" });
    if (!m1.ok) throw new Error(m1.error);
    await flush();
    await adminReplySupportCase(sb, { adminUserId: OTHER_ADMIN, caseId: a.case.id, body: "B 답", seenLastMessageAt: s0 });
    await flush();
    adminResolveInputs.length = 0;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "A 답", seenLastMessageAt: s0 });
    await flush();
    expect(r.ok && r.unseenCustomerMessages).toBe(1);
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
    const replies = adminResolveInputs.find((i) => i.kinds.includes("support_customer_replied"));
    expect(replies?.dedupeKeys ?? []).not.toContain(`support_customer_replied:${m1.message.id}`);
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: m1.message.id })).toBe("send");
  });

  it("2차 재감사: a later reply by another admin who saw the message wins — no revert, no re-unread", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 문의");
    if (!a.ok) throw new Error(a.error);
    const s0 = String(db.support_cases[0].last_message_at);
    const m = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "M" });
    if (!m.ok) throw new Error(m.error);
    await flush();
    // A 의 답변 저장 직후(정리 작업 전) B 가 M 을 보고 답한 상황을 만든다
    const origRpc = (sb as { rpc: (n: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc;
    let injected = false;
    (sb as { rpc: unknown }).rpc = async (n: string, args: Record<string, unknown> = {}) => {
      const out = await origRpc(n, args);
      if (n === "support_append_message" && !injected && args.p_sender_admin_id === ADMIN) {
        injected = true;
        const b = (await origRpc(n, { ...args, p_sender_admin_id: OTHER_ADMIN, p_body: "B 가 M 보고 답" })) as { data: { id: string; created_at: string } };
        // B 의 정리 단계가 남기는 「본 시각」(M 을 봄)
        db.support_case_events.push({
          id: randomUUID(), case_id: a.case.id, event_type: "admin_reply_seen", actor_user_id: null,
          payload: { reply_message_id: b.data.id, seen_at: b.data.created_at }, created_at: b.data.created_at,
        });
      }
      return out;
    };
    db.admin_notifications = [
      {
        id: randomUUID(), recipient_admin_id: OTHER_ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases",
        work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${m.message.id}`, read_at: "2026-11-28T00:00:00.000Z", archived_at: null,
      },
    ];
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "A 답(오래된 화면)", seenLastMessageAt: s0 });
    await flush();
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    expect(db.admin_notifications[0].read_at).not.toBeNull();
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: m.message.id })).toBe("skip");
  });

  it("4차 재감사: a wrong revert by an earlier-finishing settle is corrected when the other reply's settle runs (converges to WAITING_USER)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 문의");
    if (!a.ok) throw new Error(a.error);
    const s0 = String(db.support_cases[0].last_message_at);
    const m = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "M" });
    if (!m.ok) throw new Error(m.error);
    await flush();
    // R_B(최신 화면 — M 봄)가 먼저 저장, 바로 뒤 R_A(오래된 화면). R_A 의 정리가 R_B 기록보다 먼저 돈다.
    const origRpc = (sb as { rpc: (n: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc;
    let rb: { id: string; created_at: string } | null = null;
    (sb as { rpc: unknown }).rpc = async (n: string, args: Record<string, unknown> = {}) => {
      if (n === "support_append_message" && !rb && args.p_sender_admin_id === ADMIN) {
        rb = ((await origRpc(n, { ...args, p_sender_admin_id: OTHER_ADMIN, p_body: "B 답" })) as { data: { id: string; created_at: string } }).data;
      }
      return origRpc(n, args);
    };
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "A 답", seenLastMessageAt: s0 });
    await flush();
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN"); // R_B 기록 전이라 보수적으로 되돌림
    // 이제 R_B 의 정리(본 시각 = 자기 답변 시각 → M 봄)
    if (!rb) throw new Error("no rb");
    const rbRow = rb as { id: string; created_at: string };
    await settleAdminWorkAfterSeenReply(sb, {
      caseRow: db.support_cases[0] as never,
      seenLastMessageAt: rbRow.created_at,
      reply: rbRow,
    });
    await flush();
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: m.message.id })).toBe("skip");
  });

  it("D1-b: a message another admin already answered after my stale view is not counted as unseen", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "첫 문의");
    if (!a.ok) throw new Error(a.error);
    const seen = String(db.support_cases[0].last_message_at); // 내 화면(오래됨)
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    await flush();
    // 다른 어드민이 그 추가 글에 이미 답함
    await adminReplySupportCase(sb, { adminUserId: OTHER_ADMIN, caseId: a.case.id, body: "다른 어드민 답" });
    await flush();
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "내 답", seenLastMessageAt: seen });
    expect(r.ok && r.unseenCustomerMessages).toBe(0);
    expect(db.support_cases[0].status).toBe("WAITING_USER");
  });

  it("D1: everything seen → WAITING_USER and every shown customer alert read; no seen value = legacy (all read)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "문의");
    if (!a.ok) throw new Error(a.error);
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    await flush();
    const seen = String(db.support_cases[0].last_message_at);
    adminResolveInputs.length = 0;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답", seenLastMessageAt: seen });
    expect(r.ok && r.unseenCustomerMessages).toBe(0);
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    const keys = adminResolveInputs.find((i) => i.kinds.includes("support_customer_replied"))?.dedupeKeys ?? [];
    expect([...keys].sort()).toEqual(customerMsgs(db).map((m) => `support_customer_replied:${m.id}`).sort());

    const legacy = makeDb();
    const b = await openStructured(legacy.sb, "ORDER_STATUS", "문의");
    if (!b.ok) throw new Error(b.error);
    adminResolveInputs.length = 0;
    await adminReplySupportCase(legacy.sb, { adminUserId: ADMIN, caseId: b.case.id, body: "답" });
    expect(legacy.db.support_cases[0].status).toBe("WAITING_USER");
    // 본 시각 없는 호출 = 답변 시각까지 모두 봄 → 그때까지 고객 글 알림 전부 읽음 (예전 「전원 읽음」과 같은 뜻)
    const legacyKeys = adminResolveInputs.find((i) => i.kinds.includes("support_customer_replied"))?.dedupeKeys ?? [];
    expect([...legacyKeys].sort()).toEqual(customerMsgs(legacy.db).map((m) => `support_customer_replied:${m.id}`).sort());
  });

  it("D1 work check: an old message answered before a newer customer message is still skipped (6차 2 유지)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "옛 글");
    if (!a.ok) throw new Error(a.error);
    const old = customerMsgs(db)[0];
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "새 글" });
    await flush();
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: String(old.id) })).toBe("skip");
  });

  it("D1 work check: an answered message in a reopened case (OPEN, no customer message after the reply, no unseen record) is skipped", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "옛 글");
    if (!a.ok) throw new Error(a.error);
    const old = customerMsgs(db)[0];
    await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    await flush();
    // 어드민 재오픈과 같은 상태: 답변 뒤 고객 글 없음 · 상태 OPEN
    db.support_cases[0].status = "OPEN";
    expect(await supportCustomerMessageNeedsAdmin(sb, { caseId: a.case.id, messageId: String(old.id) })).toBe("skip");
  });

  it("D5: 5 customer messages in a minute or 30 in an hour → rate_limited (sender's own messages only)", async () => {
    const now = new Date("2026-11-28T10:00:00.000Z");
    const at = (secAgo: number) => new Date(now.getTime() - secAgo * 1000).toISOString();
    const msg = (secAgo: number, sender = U) => ({
      id: randomUUID(), case_id: "c", sender_type: "MEMBER", sender_user_id: sender, message_type: "PUBLIC", body: "x", created_at: at(secAgo),
    });
    const four = makeDb({ support_messages: [10, 20, 30, 40].map((s) => msg(s)) });
    expect(await checkSupportCustomerPostRate(four.sb, U, now)).toBe("ok");
    const five = makeDb({ support_messages: [10, 20, 30, 40, 50].map((s) => msg(s)) });
    expect(await checkSupportCustomerPostRate(five.sb, U, now)).toBe("rate_limited");
    // 다른 사람 글·1분 지난 글은 1분 한도에 안 센다
    const mixed = makeDb({ support_messages: [...[10, 20, 30, 40].map((s) => msg(s)), msg(15, ADMIN), msg(120)] });
    expect(await checkSupportCustomerPostRate(mixed.sb, U, now)).toBe("ok");
    const hour = makeDb({ support_messages: Array.from({ length: 30 }, (_, i) => msg(120 + i * 60)) });
    expect(await checkSupportCustomerPostRate(hour.sb, U, now)).toBe("rate_limited");
    const hourOld = makeDb({ support_messages: Array.from({ length: 30 }, (_, i) => msg(3700 + i)) });
    expect(await checkSupportCustomerPostRate(hourOld.sb, U, now)).toBe("ok");
  });

  it("L1: a closed case cannot be assigned (no assignment alert); an assignment that lost a race does not overwrite", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    adminNotifyCalls.length = 0;
    const closed = await adminAssignSupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, assigneeAdminId: OTHER_ADMIN });
    expect(closed).toEqual({ ok: false, error: "case_closed" });
    expect(db.support_cases[0].assigned_admin_id).toBeNull();
    expect(adminNotifyCalls).toHaveLength(0);

    const two = makeDb();
    const b = await openStructured(two.sb, "ORDER_STATUS", "y");
    if (!b.ok) throw new Error(b.error);
    adminNotifyCalls.length = 0;
    const THIRD = "55555555-5555-4555-8555-555555555555";
    // 경합: 이 요청이 문의를 읽은 뒤·쓰기 직전에 다른 어드민이 THIRD 로 지정했다
    // 전체 수정 §2: 지정 쓰기는 DB 함수(support_transition_case) — 그 함수가 부르기 직전에 다른 어드민이 지정했다
    const base = two.sb as unknown as { from: unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> };
    let raced = false;
    const sbRace = {
      ...base,
      rpc: (n: string, a?: Record<string, unknown>) => {
        if (n === "support_transition_case" && !raced) {
          raced = true;
          two.db.support_cases[0].assigned_admin_id = THIRD;
        }
        return base.rpc(n, a);
      },
    } as never;
    const lost = await adminAssignSupportCase(sbRace, { adminUserId: ADMIN, caseId: b.case.id, assigneeAdminId: OTHER_ADMIN });
    // 고치기 전: 다른 어드민의 지정을 덮어쓰고 지정 알림까지 나갔다
    expect(lost).toEqual({ ok: false, error: "case_updated" });
    expect(two.db.support_cases[0].assigned_admin_id).toBe(THIRD);
    expect(adminNotifyCalls.filter((c) => c.kind === "support_case_assigned")).toHaveLength(0);
  });

  it("L2·L3: releasing a revoked assignee re-notifies EVERY unanswered customer message of the open case to every support admin", async () => {
    const caseOpen = randomUUID();
    const caseAnswered = randomUUID();
    const { db, sb } = makeDb({
      support_cases: [
        { id: caseOpen, public_case_no: "SC-1", status: "WAITING_ADMIN", assigned_admin_id: ADMIN, requester_user_id: U, audience: "MEMBER" },
        { id: caseAnswered, public_case_no: "SC-2", status: "WAITING_USER", assigned_admin_id: ADMIN, requester_user_id: U, audience: "MEMBER" },
      ],
      support_messages: [
        { id: "m-a", case_id: caseOpen, sender_type: "MEMBER", sender_user_id: U, message_type: "PUBLIC", body: "a", created_at: "2026-11-27T00:00:00.000Z", deleted_at: null },
        // 규칙 시작 전 옛 답변 = m-a 를 봤음(답 받음)
        { id: "r-1", case_id: caseOpen, sender_type: "ADMIN", sender_admin_id: ADMIN, message_type: "PUBLIC", body: "r", created_at: "2026-11-27T00:30:00.000Z", deleted_at: null },
        { id: "m-b", case_id: caseOpen, sender_type: "MEMBER", sender_user_id: U, message_type: "PUBLIC", body: "b", created_at: "2026-11-27T01:00:00.000Z", deleted_at: null },
        { id: "m-c", case_id: caseOpen, sender_type: "MEMBER", sender_user_id: U, message_type: "PUBLIC", body: "c", created_at: "2026-11-27T02:00:00.000Z", deleted_at: null },
        { id: "m-2", case_id: caseAnswered, sender_type: "MEMBER", sender_user_id: U, message_type: "PUBLIC", body: "x", created_at: "2026-11-27T00:00:00.000Z", deleted_at: null },
      ],
    });
    adminNotifyCalls.length = 0;
    const r = await releaseSupportAssignmentsOnRevoke(sb, { userId: ADMIN, revokedBy: null });
    // 재감사 L2-a: 재알림은 응답 뒤(after · 동적 import) — 끝나기를 기다린다
    for (let i = 0; i < 50 && adminNotifyCalls.length < 2; i++) await new Promise<void>((r) => setTimeout(r, 5));
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(r.released).toBe(2);
    expect(db.support_cases.every((c) => c.assigned_admin_id === null)).toBe(true);
    // 고치기 전(L3): 가장 늦은 글 m-c 1건만 → 지금: 답을 못 받은 m-b·m-c 둘 다 (답 받은 m-a 는 아님)
    expect(adminNotifyCalls.map((c) => c.dedupeKey)).toEqual(["support_customer_replied:m-b", "support_customer_replied:m-c"]);
    for (const c of adminNotifyCalls) {
      expect(c).toMatchObject({ broadcastPermission: "support", excludeRecipientIds: [U] });
    }
  });

  it("재감사 7: re-notify after release is capped (200 messages) and id lists are read in chunks of 100", async () => {
    const caseOpen = randomUUID();
    const msgs = Array.from({ length: 250 }, (_, i) => ({
      id: `m-${String(i).padStart(3, "0")}`,
      case_id: caseOpen,
      sender_type: "MEMBER",
      sender_user_id: U,
      message_type: "PUBLIC",
      body: `b${i}`,
      created_at: new Date(Date.UTC(2026, 11, 2) + i * 1000).toISOString(),
      deleted_at: null,
    }));
    const { sb } = makeDb({
      support_cases: [{ id: caseOpen, public_case_no: "SC-9", status: "WAITING_ADMIN", assigned_admin_id: ADMIN, requester_user_id: U, audience: "MEMBER" }],
      support_messages: msgs,
    });
    const inSizes: number[] = [];
    const origFrom = (sb as { from: (t: string) => Record<string, unknown> }).from;
    (sb as { from: unknown }).from = (t: string) => {
      const b = origFrom(t) as { in: (c: string, v: unknown[]) => unknown };
      const origIn = b.in;
      b.in = (c: string, v: unknown[]) => {
        if (t === "support_messages" && c === "id") inSizes.push(v.length);
        return origIn(c, v);
      };
      return b;
    };
    adminNotifyCalls.length = 0;
    const { renotifyReleasedSupportCases, RENOTIFY_MAX_MESSAGES } = await import("@/lib/support/support-released-case-renotify");
    const sent = await renotifyReleasedSupportCases(sb, [caseOpen]);
    expect(RENOTIFY_MAX_MESSAGES).toBe(200);
    expect(sent).toBe(200);
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied")).toHaveLength(200);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(100);
  });

  it("L5: the assignee is the author (admin asked as a member) → every other support admin, not the author", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    db.support_cases[0].assigned_admin_id = U; // 글쓴이 본인이 담당
    adminNotifyCalls.length = 0;
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    await flush();
    const calls = adminNotifyCalls.filter((c) => c.kind === "support_customer_replied");
    // 고치기 전: recipientAdminIds [U] + 제외 [U] → 아무도 안 받음
    expect(calls).toHaveLength(1);
    expect(calls[0].recipientAdminIds).toBeUndefined();
    expect(calls[0].broadcastPermission).toBe("support");
    expect(calls[0].excludeRecipientIds).toEqual([U]);
  });

  it("L6: 「확인했어요」 before any answer (OPEN·WAITING_ADMIN) is rejected; the case stays open", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const r = await requesterCloseSupportCase(sb, { userId: U, caseId: a.case.id });
    expect(r).toEqual({ ok: false, error: "invalid_transition" });
    expect(db.support_cases[0].status).toBe("OPEN");
  });

  it("L7 · S-6 (2026-11-29): the reply stores the customer's bell row before returning (same request), the push goes right after", async () => {
    const { sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    notifyCalls.length = 0;
    pushCalls.length = 0;
    const r = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    expect(r.ok).toBe(true);
    // 계약 §4: 고객 미읽음 +1 과 알림함 행이 같은 요청 — 푸시만 응답 뒤(L7 의 「푸시를 기다리지 않음」은 그대로)
    expect(notifyCalls.filter((n) => n.type === "support_admin_replied")).toEqual([
      expect.objectContaining({ deferPush: true }),
    ]);
    // 푸시는 응답을 기다리게 하지 않는 별도 작업(응답 뒤 끝까지 보장) — 한 번만
    await flush();
    expect(pushCalls.filter((p) => p.type === "support_admin_replied")).toHaveLength(1);
  });

  it("L3: customer API views carry only customer fields (no assignee / priority / admin unread / guidance / admin id)", () => {
    const row = {
      id: "c", public_case_no: "SC-1", audience: "MEMBER", requester_user_id: U, owner_store_id: null, category: "ORDER",
      issue_type: "ORDER_STATUS", subject: "ORDER · mypage", source_surface: "mypage", reference_type: null, reference_id: null,
      initial_summary: "s", guidance_key: "g", guidance_revision: 1, guidance_outcome: "o", status: "WAITING_USER",
      priority: "HIGH", assigned_admin_id: ADMIN, previous_case_id: null, requester_unread_count: 1, admin_unread_count: 3,
      created_at: "t", updated_at: "t", last_message_at: "t", first_admin_response_at: "t", resolved_at: null, archived_at: null,
    } as const;
    const v = toSupportRequesterCaseView(row as never) as Record<string, unknown>;
    for (const k of ["assigned_admin_id", "priority", "admin_unread_count", "guidance_key", "guidance_revision", "guidance_outcome", "subject", "source_surface", "requester_user_id", "previous_case_id", "first_admin_response_at", "archived_at"]) {
      expect(v).not.toHaveProperty(k);
    }
    expect(v).toMatchObject({ id: "c", status: "WAITING_USER", requester_unread_count: 1, last_message_at: "t", category: "ORDER", issue_type: "ORDER_STATUS" });
    const m = toSupportRequesterMessageView({
      id: "m", case_id: "c", sender_type: "ADMIN", sender_user_id: null, sender_admin_id: ADMIN, message_type: "PUBLIC",
      body: "지운 답", created_at: "t", deleted_at: "t2",
    }) as Record<string, unknown>;
    expect(m).not.toHaveProperty("sender_admin_id");
    expect(m).not.toHaveProperty("sender_user_id");
    expect(m.body).toBe("");
  });

  it("L4: a DB failure while opening returns a stable key, never the DB message", async () => {
    const { sb } = makeDb();
    // 전체 수정 §2: 접수 = DB 함수 하나 — 그 함수가 DB 오류를 내도 응답엔 고정 키만
    const base = sb as unknown as { from: (t: string) => unknown; rpc: (n: string, a?: unknown) => Promise<unknown> };
    const sbFail = {
      ...base,
      rpc: async (n: string, a?: unknown) =>
        n === "support_open_case" ? { data: null, error: { message: 'permission denied for relation "secret_table"' } } : base.rpc(n, a),
    } as never;
    const r = await openSupportCaseFromContext(sbFail, {
      userId: U, context: ctx(), issueType: "ORDER_STATUS", initialSummary: "x", initialBody: "x", allowMissingIssue: false,
    });
    expect(r).toEqual({ ok: false, error: "case_open_failed" });
  });

  it("L10: FAB unread sum = own cases of that audience/store with unread answers (closed-but-unread included)", async () => {
    const STORE = randomUUID();
    const { sb } = makeDb({
      support_cases: [
        { id: "1", requester_user_id: U, audience: "MEMBER", status: "WAITING_USER", requester_unread_count: 2 },
        { id: "2", requester_user_id: U, audience: "MEMBER", status: "RESOLVED", requester_unread_count: 1 },
        { id: "3", requester_user_id: U, audience: "MEMBER", status: "OPEN", requester_unread_count: 0 },
        { id: "4", requester_user_id: U, audience: "OWNER", owner_store_id: STORE, status: "WAITING_USER", requester_unread_count: 5 },
        { id: "5", requester_user_id: ADMIN, audience: "MEMBER", status: "WAITING_USER", requester_unread_count: 7 },
      ],
    });
    expect(await sumSupportRequesterUnread(sb, { userId: U, audience: "MEMBER" })).toEqual({ ok: true, unread: 3 });
    // A-6 (2026-11-29): 사장님 문의 숫자는 지금 그 매장 사장님일 때만 — 소유 확인 실패(이 시험의 기본 흉내) = 0
    expect(await sumSupportRequesterUnread(sb, { userId: U, audience: "OWNER", storeId: STORE })).toEqual({ ok: true, unread: 0 });
    vi.mocked(getCachedStoreIfOwner).mockResolvedValueOnce({ ok: true, store: { id: STORE } } as never);
    expect(await sumSupportRequesterUnread(sb, { userId: U, audience: "OWNER", storeId: STORE })).toEqual({ ok: true, unread: 5 });
  });

  it("L11·L11-a: the message list keeps the NEWEST 1000 (oldest dropped, shown oldest-first); mark-read uses the row the caller already read", async () => {
    const caseId = randomUUID();
    const base = Date.UTC(2026, 10, 28);
    const { db, sb } = makeDb({
      support_cases: [{ id: caseId, requester_user_id: U, audience: "MEMBER", status: "WAITING_USER", requester_unread_count: 1, last_message_at: "z" }],
      // 일부러 섞인 순서로 넣는다 — 저장 순서가 아니라 시각으로 최신을 골라야 한다
      support_messages: Array.from({ length: 1001 }, (_, k) => {
        const i = (k * 2) % 1001; // 1001 과 서로소 — 0..1000 을 한 번씩
        return { id: `m${i}`, case_id: caseId, sender_type: "MEMBER", message_type: "PUBLIC", body: "x", created_at: new Date(base + i * 1000).toISOString() };
      }),
    });
    const list = await listSupportMessages(sb, { caseId });
    if (!list.ok) throw new Error(list.error);
    expect(list.messages).toHaveLength(1000);
    const ids = list.messages.map((m) => m.id);
    // 고치기 전(오래된 순 상한): m0 이 남고 최신 m1000 이 잘렸다
    expect(ids).not.toContain("m0");
    expect(ids[0]).toBe("m1");
    expect(ids[ids.length - 1]).toBe("m1000");
    // 넘겨준 행(숫자 0)을 그대로 쓴다 → DB 를 다시 읽었다면 1 을 보고 고쳐 썼을 것
    const r = await markSupportCaseReadForRequester(sb, {
      userId: U,
      caseId,
      caseRow: { ...(db.support_cases[0] as Row), requester_unread_count: 0 } as never,
    });
    expect(r).toEqual({ ok: true, wrote: false });
  });

  it("L12 (구조 확인): the 405 stub and the unused summary route are gone; stale customer-realtime comments fixed", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/support/cases/route.ts"), "utf8");
    expect(route).not.toMatch(/export async function POST/);
    expect(route).not.toContain("use_case_detail_route");
    const svc = readFileSync(join(process.cwd(), "lib/support/support-case-service.ts"), "utf8");
    expect(svc).not.toContain("Prevents SupportModalHost Realtime");
    expect(svc).not.toContain("support_cases UPDATE subscription");
  });
});

/**
 * 운영 반영 뒤 최종 점검 (docs/audit/customer-support-inquiry-final-2026-11-28/final-audit-2.md §2) — 서버 M5·M6·M8·L2·L6·L8 (동작).
 */
describe("support final check 2026-11-28 — server M5·M6·M8·L2·L6·L8 (동작)", () => {
  const OTHER_ADMIN = "66666666-6666-4666-8666-666666666666";

  it("M5: deleting the only answer moves the case back to 「답변 필요」 (last message time kept), revives the read alert and re-notifies", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    if (!reply.ok) throw new Error(reply.error);
    await flush();
    const row = db.support_cases[0];
    expect(row.status).toBe("WAITING_USER");
    const seed = db.support_messages.find((m) => m.sender_type === "MEMBER")!;
    // 답변으로 그 글 알림은 읽힌 상태
    db.admin_notifications = [
      { id: "an-1", recipient_admin_id: OTHER_ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${seed.id}`, read_at: "2026-12-01T00:00:00.000Z" },
      { id: "an-2", recipient_admin_id: OTHER_ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: randomUUID(), dedupe_key: "support_customer_replied:other", read_at: "2026-12-01T00:00:00.000Z" },
    ];
    const lastAt = row.last_message_at;
    adminNotifyCalls.length = 0;
    const del = await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: reply.message.id });
    expect(del).toEqual({ ok: true });
    await flush();
    // 고치기 전: WAITING_USER 그대로(어느 큐에도 없이 7일 뒤 자동 종료)
    expect(row.status).toBe("WAITING_ADMIN");
    expect(row.last_message_at).toBe(lastAt);
    expect(db.admin_notifications.find((n) => n.id === "an-1")?.read_at).toBeNull();
    expect(db.admin_notifications.find((n) => n.id === "an-2")?.read_at).not.toBeNull();
    // B-3 (2026-11-29): 알림 행이 이미 있는 글은 되살리기만 — 다시 퍼뜨리지 않는다(받는 사람 권한·본문을 다시 읽지 않음)
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied")).toEqual([]);
  });

  it("병합 전 2차 4·5: 이미 「답변 필요」(WAITING_ADMIN)에서 유일한 답을 지우면 그 답이 본 글 알림만 되살리고, 첫 글 제목 = 「새 고객 문의」", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const seed = db.support_messages.find((m) => m.sender_type === "MEMBER")!;
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    if (!reply.ok) throw new Error(reply.error);
    await flush();
    const late = await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    if (!late.ok) throw new Error(late.error);
    await flush();
    const row = db.support_cases[0];
    expect(row.status).toBe("WAITING_ADMIN");
    // 첫 글 알림 행은 없다(예: 옛 알림 정리) · 추가 글 알림은 어드민이 읽음
    db.admin_notifications = [
      { id: "an-late", recipient_admin_id: OTHER_ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${late.message.id}`, read_at: "2026-12-01T00:00:00.000Z", archived_at: null },
    ];
    adminNotifyCalls.length = 0;
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: reply.message.id });
    await flush();
    expect(row.status).toBe("WAITING_ADMIN");
    // 지운 답이 봤던 첫 글만 다시 알림(행이 없으니 만듦) · 원래부터 기다리던 추가 글(어드민이 읽음)은 그대로
    expect(db.admin_notifications.find((n) => n.id === "an-late")?.read_at).not.toBeNull();
    const calls = adminNotifyCalls.filter((c) => c.kind === "support_customer_replied");
    expect(calls.map((c) => c.dedupeKey)).toEqual([`support_customer_replied:${seed.id}`]);
    expect(calls[0].title).toContain("새 고객 문의");
  });

  it("남은 위험 2: 재오픈(OPEN)된 문의에서 유일한 답을 지우면 그 답이 본 글 알림을 되살린다(상태 OPEN 그대로)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const seed = db.support_messages.find((m) => m.sender_type === "MEMBER")!;
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    if (!reply.ok) throw new Error(reply.error);
    await flush();
    await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    await flush();
    const reopened = await reopenSupportCase(sb, { userId: ADMIN, caseId: a.case.id, isAdmin: true });
    if (!reopened.ok) throw new Error(reopened.error);
    await flush();
    const row = db.support_cases[0];
    expect(row.status).toBe("OPEN");
    db.admin_notifications = [
      { id: "an-seed", recipient_admin_id: OTHER_ADMIN, kind: "support_customer_replied", work_ref_table: "support_cases", work_ref_id: a.case.id, dedupe_key: `support_customer_replied:${seed.id}`, read_at: "2026-12-01T00:00:00.000Z", archived_at: null },
    ];
    adminNotifyCalls.length = 0;
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: reply.message.id });
    await flush();
    expect(row.status).toBe("OPEN");
    expect(db.admin_notifications.find((n) => n.id === "an-seed")?.read_at).toBeNull();
    // B-3: 행이 있는 글은 되살리기만(다시 퍼뜨리지 않음)
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied").map((c) => c.dedupeKey)).toEqual([]);
    expect(seed.id).toBeTruthy();
  });

  it("M5: deleting one of two answers that both saw the message keeps 「고객 확인 대기」 (no re-notify)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const r1 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답1" });
    const r2 = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답2" });
    if (!r1.ok || !r2.ok) throw new Error("reply");
    await flush();
    adminNotifyCalls.length = 0;
    await adminDeleteSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: r2.message.id });
    await flush();
    expect(db.support_cases[0].status).toBe("WAITING_USER");
    expect(adminNotifyCalls.filter((c) => c.kind === "support_customer_replied")).toHaveLength(0);
  });

  it("M6: closing with the seen last-message time refuses when a customer message arrived after it (case_updated, nothing changes)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const seen = String(db.support_cases[0].last_message_at);
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 글" });
    await flush();
    notifyCalls.length = 0;
    const stale = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED", seenLastMessageAt: seen });
    // 고치기 전: 종료 + 고객 「종료」 알림 — 새 글은 아무도 안 봄
    expect(stale).toEqual({ ok: false, error: "case_updated" });
    expect(db.support_cases[0].status).toBe("WAITING_ADMIN");
    await flush();
    expect(notifyCalls.filter((n) => n.type === "support_case_resolved")).toHaveLength(0);
    // 같은 시각(표기만 다름)이면 닫는다 — 시각으로 비교
    const current = new Date(String(db.support_cases[0].last_message_at)).toISOString().replace("Z", "+00:00");
    const ok = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED", seenLastMessageAt: current });
    expect(ok.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
  });

  it("M6: without a seen time the close works as before (old screens)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가 글" });
    const r = await adminUpdateSupportCaseStatus(sb, { adminUserId: ADMIN, caseId: a.case.id, status: "RESOLVED" });
    expect(r.ok).toBe(true);
    expect(db.support_cases[0].status).toBe("RESOLVED");
  });

  it("M8·L6: admin mark-read reuses the row the detail GET already read and writes nothing when nothing changes", async () => {
    const caseId = randomUUID();
    const { db, sb } = makeDb({
      support_cases: [{ id: caseId, status: "WAITING_ADMIN", admin_unread_count: 1, last_message_at: "2026-12-01T00:00:02.000Z", updated_at: "u0" }],
      support_messages: [
        { id: "c1", case_id: caseId, sender_type: "MEMBER", message_type: "PUBLIC", created_at: "2026-12-01T00:00:02.000Z", deleted_at: null },
      ],
    });
    // L6: 넘겨준 행(미읽음 0)을 그대로 쓴다 → 고치기 전에는 DB 를 다시 읽어 1 을 보고 0 으로 고쳐 썼다
    const reused = await markSupportCaseReadForAdmin(sb, caseId, "2026-12-01T00:00:02.000Z", { ...(db.support_cases[0] as Row), admin_unread_count: 0 } as never);
    expect(reused).toEqual({ ok: true, wrote: false });
    expect(db.support_cases[0].admin_unread_count).toBe(1);
    // M8: 본 시각 뒤에 고객 글 1건 = 계산값 1 = 지금 값 → UPDATE 없음(updated_at 그대로 · 실시간 메아리 없음)
    const same = await markSupportCaseReadForAdmin(sb, caseId, "2026-12-01T00:00:01.000Z", db.support_cases[0] as never);
    expect(same).toEqual({ ok: true, wrote: false });
    expect(db.support_cases[0].updated_at).toBe("u0");
  });

  it("L6: a merged open does not re-read the case before appending (one fewer case read)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const base = sb as unknown as { from: (t: string) => unknown; rpc: unknown };
    let caseReads = 0;
    const counting = {
      ...base,
      from: (t: string) => {
        if (t === "support_cases") caseReads += 1;
        return base.from(t);
      },
    } as never;
    const merged = await openSupportCaseFromContext(counting, {
      userId: U, context: ctx(), issueType: "ORDER_STATUS", initialSummary: "또", initialBody: "또", allowMissingIssue: false,
    });
    if (!merged.ok) throw new Error(merged.error);
    await flush();
    expect(merged.created).toBe(false);
    expect(db.support_cases).toHaveLength(1);
    // 전체 수정 §2: 진행 중 조회·붙이기·다시 읽기 = DB 함수 하나(문의 표 직접 읽기 0) + 응답 뒤 어드민 알림 판정 1 = 1
    expect(caseReads).toBe(1);
  });

  it("L2: the app self-heal releases the unreachable assignee only while the case is still active", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    db.support_cases[0].assigned_admin_id = OTHER_ADMIN;
    const { createAdminNotification } = await import("@/lib/admin/notifications/admin-notification-service");
    // 담당자 알림을 만드는 사이 문의가 종료됐고, 담당자는 권한을 잃었다(받을 수 없음)
    vi.mocked(createAdminNotification).mockImplementationOnce(async () => {
      db.support_cases[0].status = "RESOLVED";
      return { ok: true, created: 0, skippedRecipients: 1, revokedRecipients: 1, pushed: 0 };
    });
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    await flush();
    // 고치기 전: 종료 문의도 담당을 풀었다(앱 경로만 규칙이 달랐다)
    expect(db.support_cases[0].assigned_admin_id).toBe(OTHER_ADMIN);
    expect(db.support_case_events.some((e) => e.event_type === "assignee_released_admin_revoked")).toBe(false);
  });

  it("L2: the app self-heal still releases the assignee of an active case (one event)", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    db.support_cases[0].assigned_admin_id = OTHER_ADMIN;
    const { createAdminNotification } = await import("@/lib/admin/notifications/admin-notification-service");
    vi.mocked(createAdminNotification).mockImplementationOnce(async () => ({ ok: true, created: 0, skippedRecipients: 1, revokedRecipients: 1, pushed: 0 }));
    adminNotifyCalls.length = 0;
    await postRequesterSupportMessage(sb, { userId: U, caseId: a.case.id, body: "추가" });
    await flush();
    expect(db.support_cases[0].assigned_admin_id).toBeNull();
    expect(db.support_case_events.filter((e) => e.event_type === "assignee_released_admin_revoked")).toHaveLength(1);
    expect(adminNotifyCalls.some((c) => c.broadcastPermission === "support")).toBe(true);
  });

  it("L8: an edited answer is trimmed and capped at 8000 characters like a new message", async () => {
    const { db, sb } = makeDb();
    const a = await openStructured(sb, "ORDER_STATUS", "x");
    if (!a.ok) throw new Error(a.error);
    const reply = await adminReplySupportCase(sb, { adminUserId: ADMIN, caseId: a.case.id, body: "답" });
    if (!reply.ok) throw new Error(reply.error);
    const edited = await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: reply.message.id, body: `  ${"가".repeat(9000)}  ` });
    expect(edited.ok).toBe(true);
    const stored = db.support_messages.find((m) => m.id === reply.message.id)!;
    // 고치기 전: 9000자 그대로 저장
    expect(String(stored.body)).toHaveLength(8000);
    expect(await adminEditSupportMessage(sb, { adminUserId: ADMIN, caseId: a.case.id, messageId: reply.message.id, body: "   " })).toEqual({
      ok: false,
      error: "empty_body",
    });
  });

  it("U13 (server): the customer message view carries edited_at so the screen can show 「수정됨」", () => {
    const v = toSupportRequesterMessageView({
      id: "m", case_id: "c", sender_type: "ADMIN", sender_user_id: null, sender_admin_id: ADMIN, message_type: "PUBLIC",
      body: "고친 답", created_at: "t", edited_at: "t2", deleted_at: null,
    } as never);
    expect(v.edited_at).toBe("t2");
    expect(v.body).toBe("고친 답");
  });
});

