// @vitest-environment jsdom
/**
 * 고객센터 전체 수정 (docs/audit/customer-support-full-fix-contract-2026-11-28.md) — 어드민 화면 쪽 동작 시험.
 *  - A-1 §3: 상세 GET 은 읽기만 · 읽음(`action: "seen"`)은 탭이 보이고 그 문의 상세가 그려진 뒤에만
 *  - A-2 §4: 고객센터 알림 생성·읽음 → 헤더 받은 알림 숫자 다시 읽기 신호(ADMIN_INBOX_CHANGED_EVENT) 1초 안
 *  - B-5 §4: `/admin/support` 에서 support_cases 구독은 공통 구독 1곳만
 *  - S-3 §1: 어드민 답 재시도 = 같은 requestId · 본문이 바뀌면 새 id · 성공하면 지움
 *  - 연타: 저장 중 표시를 같은 렌더 안에서도 막는다
 *  - §7: 어드민 OPEN 이름 = 「답변 필요」
 */
import "@/lib/i18n/admin-catalog";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/support",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: unknown; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  ),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, tt: (k: string) => k, language: "ko" }),
}));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "admin-1" }),
}));
vi.mock("@/lib/admin-auth/admin-me-context", () => ({
  peekAdminMeSnapshot: () => null,
  fetchAdminMeSnapshot: async () => ({
    userId: "admin-1",
    role: "super_admin",
    uiRole: "super_admin",
    adminTier: null,
    permissions: ["support"],
    loginId: "a",
    displayName: "A",
  }),
}));
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({
  confirmAdminAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  waitForSupabaseRealtimeAuth: async () => true,
  syncSupabaseRealtimeAuthFromSession: async () => true,
}));
vi.mock("@/lib/notifications/fetch-admin-notification-preferences-client", () => ({
  ADMIN_OPS_SOUND_PREFERENCE_CHANGED: "samarket:admin-ops-sound-preference-changed",
  fetchAdminNotificationPreferencesRow: async () => null,
  invalidateAdminNotificationPreferencesFlight: () => undefined,
}));
vi.mock("@/lib/admin/admin-fetch-client", () => ({
  adminFetch: async (url: string) =>
    ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).startsWith("/api/admin/member-notes")
          ? {
              ok: true,
              total: 1,
              threads: [{ id: "t1", subject: "old note", status: "open", last_message_at: "2026-01-01T00:00:00Z", started_by: "member" }],
            }
          : { ok: true },
    }) as unknown as Response,
  clearAllAdminFetchCache: () => undefined,
  invalidateAdminFetchCache: () => undefined,
}));

/** 채널 이름별로 붙은 (표, 이벤트, 처리기) — 지운 채널(removeChannel)의 것은 뺀다 */
type Binding = { channel: string; ref: object; table: string; event: string; filter?: string; handler: (payload: unknown) => void };
const bindings: Binding[] = [];
vi.mock("@/lib/supabase/client", () => {
  const makeChannel = (name: string) => {
    const ch: { on: (...a: unknown[]) => unknown; subscribe: (cb?: (s: string) => void) => unknown } = {
      on: (_kind: unknown, filter: unknown, handler?: unknown) => {
        const f = (filter ?? {}) as { table?: string; event?: string; filter?: string };
        if (typeof handler === "function") {
          bindings.push({ channel: name, ref: ch, table: String(f.table ?? ""), event: String(f.event ?? ""), filter: f.filter, handler: handler as never });
        }
        return ch;
      },
      subscribe: () => ch,
    };
    return ch;
  };
  // 공통 구독의 토스트 보조 조회(support_cases 대상 읽기)는 빈 결과
  const query: Record<string, unknown> = {};
  for (const k of ["select", "eq", "in", "limit", "order"]) query[k] = () => query;
  query.maybeSingle = async () => ({ data: null, error: null });
  query.single = async () => ({ data: null, error: null });
  query.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
  return {
    getSupabaseClient: () => ({
      channel: (name: string) => makeChannel(name),
      from: () => query,
      removeChannel: async (ch: object) => {
        for (let i = bindings.length - 1; i >= 0; i -= 1) if (bindings[i].ref === ch) bindings.splice(i, 1);
      },
    }),
  };
});
vi.mock("@/lib/supabase/private-realtime-channel-options", () => ({ privateRealtimeChannelOptions: () => ({}) }));
vi.mock("@/lib/community-messenger/realtime/private-broadcast-client", () => ({
  messengerPrivateBroadcastChannelOptions: () => ({}),
}));

import { MESSAGES, translate } from "@/lib/i18n/messages";
import { AdminSupportPage } from "@/components/admin/support/AdminSupportPage";
import { AdminStorePointPendingProvider } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { AdminSupportArchivePage } from "@/components/admin/support/AdminSupportArchivePage";
import { ADMIN_INBOX_CHANGED_EVENT } from "@/lib/admin/notifications/admin-notification-kinds";
import { supportAdminStatusLabel } from "@/lib/support/support-status-label";

function caseRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    public_case_no: `SP-${id}`,
    audience: "MEMBER",
    category: "ACCOUNT",
    issue_type: null,
    status: "WAITING_ADMIN",
    priority: "NORMAL",
    assigned_admin_id: null,
    requester_user_id: `user-${id}`,
    requester_display_name: `Name ${id}`,
    admin_unread_count: 1,
    owner_store_id: null,
    created_at: "2026-11-28T00:00:00Z",
    last_message_at: "2026-11-28T01:00:00Z",
    ...over,
  };
}

function msg(id: string, caseId: string, createdAt: string, body = `body ${id}`) {
  return {
    id,
    case_id: caseId,
    sender_type: "MEMBER",
    message_type: "PUBLIC",
    body,
    created_at: createdAt,
    sender_admin_id: null,
    deleted_at: null,
    edited_at: null,
  };
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
type Detail = { case: Record<string, unknown>; messages: unknown[] };
let detailFor: (id: string) => Detail = (id) => ({ case: caseRow(id), messages: [msg(`m-${id}`, id, "2026-11-28T01:00:00Z")] });
type PatchResult = { status: number; body: unknown };
let patchResponder: (call: Call) => PatchResult | Promise<PatchResult> = () => ({ status: 200, body: { ok: true } });

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let visibility: DocumentVisibilityState = "visible";
let inboxEvents = 0;
const onInbox = () => {
  inboxEvents += 1;
};

beforeEach(() => {
  calls = [];
  bindings.length = 0;
  inboxEvents = 0;
  visibility = "visible";
  detailFor = (id) => ({ case: caseRow(id), messages: [msg(`m-${id}`, id, "2026-11-28T01:00:00Z")] });
  patchResponder = () => ({ status: 200, body: { ok: true } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  window.addEventListener(ADMIN_INBOX_CHANGED_EVENT, onInbox);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const call: Call = { url, method, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
    calls.push(call);
    if (url.startsWith("/api/admin/support/cases?")) {
      return jsonResponse({ ok: true, cases: [caseRow("A"), caseRow("B")], counts: {}, total: 2 });
    }
    const m = /^\/api\/admin\/support\/cases\/([^/?]+)$/.exec(url);
    if (m && method === "PATCH") {
      const r = await patchResponder(call);
      return jsonResponse(r.body, r.status);
    }
    if (m) {
      const d = detailFor(decodeURIComponent(m[1]));
      return jsonResponse({ ok: true, case: d.case, messages: d.messages, followupIssues: [] });
    }
    return jsonResponse({ ok: true });
  }) as typeof fetch;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  window.removeEventListener(ADMIN_INBOX_CHANGED_EVENT, onInbox);
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function mount(withProvider = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      withProvider ? (
        <AdminStorePointPendingProvider>
          <AdminSupportPage />
        </AdminStorePointPendingProvider>
      ) : (
        <AdminSupportPage />
      )
    );
  });
  await flush();
}

function q<T extends Element = HTMLElement>(sel: string): T | null {
  return host!.querySelector<T>(sel);
}

async function click(el: Element | null) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

async function typeDraft(text: string) {
  const ta = q<HTMLTextAreaElement>("[data-admin-support-composer] textarea");
  expect(ta).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(ta, text);
    ta!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await flush();
}

const seenPatches = () => calls.filter((c) => c.method === "PATCH" && c.body?.action === "seen");
const replyPatches = () => calls.filter((c) => c.method === "PATCH" && c.body?.action === "reply");

/** 공통 구독(Provider)이 받은 실시간 1건을 흉내 낸다 */
async function emitRealtime(table: string, event: string, payload: Record<string, unknown>) {
  const targets = bindings.filter((b) => b.table === table && (b.event === event || b.event === "*"));
  expect(targets.length, `${table} ${event} 구독`).toBeGreaterThan(0);
  await act(async () => {
    for (const b of targets) b.handler({ eventType: event, ...payload });
  });
  await flush();
}

describe("A-1 — 읽음은 화면이 보일 때만 (동작)", () => {
  it("탭이 숨은 채 문의를 열면 seen 없음 → 탭이 보이면 seen 1번 (보여 준 글 id · 본 마지막 글 시각)", async () => {
    await mount();
    visibility = "hidden";
    await click(q('[data-admin-support-row="A"]'));
    expect(q("[data-admin-support-center]")?.textContent ?? "").toContain("body m-A");
    expect(seenPatches()).toHaveLength(0);

    await setVisibility("visible");
    expect(seenPatches()).toHaveLength(1);
    expect(seenPatches()[0].url).toBe("/api/admin/support/cases/A");
    expect(seenPatches()[0].body).toEqual({
      action: "seen",
      shownMessageIds: ["m-A"],
      seenLastMessageAt: "2026-11-28T01:00:00Z",
    });

    // 같은 상세로 다시 보여도 또 보내지 않는다
    await setVisibility("hidden");
    await setVisibility("visible");
    expect(seenPatches()).toHaveLength(1);
  });

  it("보이는 탭에서 연 문의 = 그린 뒤 seen · 숨은 사이 고객 글로 자동 다시 읽기 = seen 없음 → 보이면 새 글까지 seen", async () => {
    await mount(true);
    await click(q('[data-admin-support-row="A"]'));
    expect(seenPatches()).toHaveLength(1);

    visibility = "hidden";
    detailFor = (id) => ({
      case: caseRow(id, { last_message_at: "2026-11-28T03:00:00Z" }),
      messages: [msg(`m-${id}`, id, "2026-11-28T01:00:00Z"), msg(`m-${id}-2`, id, "2026-11-28T03:00:00Z", "late customer")],
    });
    await emitRealtime("support_messages", "INSERT", {
      new: { id: "m-A-2", case_id: "A", sender_type: "MEMBER", message_type: "PUBLIC", sender_admin_id: null },
    });
    expect(q("[data-admin-support-center]")?.textContent ?? "").toContain("late customer");
    expect(seenPatches()).toHaveLength(1);

    await setVisibility("visible");
    expect(seenPatches()).toHaveLength(2);
    expect(seenPatches()[1].body).toEqual({
      action: "seen",
      shownMessageIds: ["m-A", "m-A-2"],
      seenLastMessageAt: "2026-11-28T03:00:00Z",
    });
  });
});

describe("A-2 — 고객센터 알림 생성·읽음 뒤 헤더 받은 알림 숫자 다시 읽기 신호 (동작)", () => {
  it("읽음(seen) 성공 → 바로 신호", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    expect(seenPatches()).toHaveLength(1);
    expect(inboxEvents).toBeGreaterThanOrEqual(1);
  });

  it("답변 성공 → 신호", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    const before = inboxEvents;
    await typeDraft("hello");
    await click(q("[data-admin-support-send]"));
    expect(replyPatches()).toHaveLength(1);
    expect(inboxEvents).toBeGreaterThan(before);
  });

  it("내 알림 행(admin_notifications) 생성·읽음 → 1초 안에 1번 · 고객 글 INSERT 만으로는 추측 신호 없음", async () => {
    await mount(true);
    const before = inboxEvents;
    // 서버가 알림 행을 만들기 전(고객 글만 도착) — 헤더 숫자는 바뀌지 않았으므로 신호 없음(추측 대기 없음)
    await emitRealtime("support_messages", "INSERT", {
      new: { id: "x1", case_id: "B", sender_type: "MEMBER", message_type: "PUBLIC", sender_admin_id: null },
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await flush();
    expect(inboxEvents).toBe(before);
    // 알림 행 생성 2건 + 읽음 1건이 몰려도 1번
    await emitRealtime("admin_notifications", "INSERT", { new: { id: "n1", recipient_admin_id: "admin-1" } });
    await emitRealtime("admin_notifications", "INSERT", { new: { id: "n2", recipient_admin_id: "admin-1" } });
    await emitRealtime("admin_notifications", "UPDATE", { new: { id: "n1", recipient_admin_id: "admin-1" } });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await flush();
    expect(inboxEvents - before).toBe(1);
    const binding = bindings.find((b) => b.table === "admin_notifications");
    expect(binding?.filter).toMatch(/^recipient_admin_id=eq\./);
  });
});

describe("B-5 — /admin/support 의 support_cases 구독은 공통 구독 1곳 (동작)", () => {
  it("Provider + 콘솔을 함께 그려도 support_cases 를 듣는 채널은 1개 · 그 변경이 콘솔 목록에 반영", async () => {
    await mount(true);
    const channels = new Set(bindings.filter((b) => b.table === "support_cases").map((b) => b.channel));
    expect([...channels]).toHaveLength(1);
    const listGets = () => calls.filter((c) => c.method === "GET" && c.url.startsWith("/api/admin/support/cases?")).length;
    const before = listGets();
    await emitRealtime("support_cases", "INSERT", { new: { id: "NEW", status: "OPEN" }, old: null });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await flush();
    expect(listGets()).toBeGreaterThan(before);
  });
});

describe("S-3 — 어드민 답 재시도 = 같은 requestId (동작)", () => {
  it("실패 뒤 같은 본문 = 같은 id · 본문 바뀌면 새 id · 성공 뒤 같은 본문 = 새 id", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    patchResponder = (c) =>
      c.body?.action === "reply" ? { status: 503, body: { ok: false, error: "message_save_failed" } } : { status: 200, body: { ok: true } };
    await typeDraft("answer one");
    await click(q("[data-admin-support-send]"));
    await click(q("[data-admin-support-send]"));
    const [r1, r2] = replyPatches();
    expect(typeof r1.body?.requestId).toBe("string");
    expect(String(r1.body?.requestId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(r2.body?.requestId).toBe(r1.body?.requestId);

    await typeDraft("answer two");
    await click(q("[data-admin-support-send]"));
    const r3 = replyPatches()[2];
    expect(r3.body?.requestId).not.toBe(r1.body?.requestId);

    patchResponder = (c) =>
      c.body?.action === "reply" ? { status: 200, body: { ok: true, replayed: true } } : { status: 200, body: { ok: true } };
    await click(q("[data-admin-support-send]"));
    const r4 = replyPatches()[3];
    expect(r4.body?.requestId).toBe(r3.body?.requestId);
    // replay 응답도 성공 — 입력칸 비움
    expect(q<HTMLTextAreaElement>("[data-admin-support-composer] textarea")?.value).toBe("");

    await typeDraft("answer two");
    await click(q("[data-admin-support-send]"));
    const r5 = replyPatches()[4];
    expect(r5.body?.requestId).not.toBe(r3.body?.requestId);
  });
});

describe("S-3 — request_id_conflict 뒤에는 새 requestId (동작)", () => {
  it("같은 본문이라도 서버가 id 충돌을 알리면 다음 전송은 새 id · 안내 문구", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    patchResponder = (c) =>
      c.body?.action === "reply" ? { status: 409, body: { ok: false, error: "request_id_conflict" } } : { status: 200, body: { ok: true } };
    await typeDraft("same text");
    await click(q("[data-admin-support-send]"));
    expect(host!.textContent ?? "").toContain("admin_support_error_request_id_conflict");
    await click(q("[data-admin-support-send]"));
    const [r1, r2] = replyPatches();
    expect(typeof r1.body?.requestId).toBe("string");
    expect(r2.body?.requestId).not.toBe(r1.body?.requestId);
  });
});

describe("연타 — 같은 렌더 안 두 번 눌러도 저장은 1번 (동작)", () => {
  it("보내기 버튼 두 번 연속 클릭(사이 렌더 없음) → reply PATCH 1건", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    let release: (r: PatchResult) => void = () => {};
    patchResponder = (c) =>
      c.body?.action === "reply" ? new Promise<PatchResult>((r) => (release = r)) : { status: 200, body: { ok: true } };
    await typeDraft("double");
    const btn = q<HTMLButtonElement>("[data-admin-support-send]")!;
    await act(async () => {
      btn.click();
      btn.click();
    });
    await flush();
    expect(replyPatches()).toHaveLength(1);
    await act(async () => release({ status: 200, body: { ok: true } }));
    await flush();
  });
});

describe("§7 — 어드민 OPEN 이름 = 「답변 필요」 (동작)", () => {
  it("OPEN 알약 = WAITING_ADMIN 알약 = 탭 「답변 필요」 (ko·en)", () => {
    const ko = MESSAGES.ko as Record<string, string>;
    const en = MESSAGES.en as Record<string, string>;
    expect(supportAdminStatusLabel("OPEN", (k) => translate("ko", k))).toBe(ko.admin_needs_reply);
    expect(supportAdminStatusLabel("OPEN", (k) => translate("en", k))).toBe(en.admin_needs_reply);
    expect(supportAdminStatusLabel("OPEN", (k) => translate("ko", k))).toBe(
      supportAdminStatusLabel("WAITING_ADMIN", (k) => translate("ko", k))
    );
  });
});

describe("§7 — 옛 문의 보관함 문구는 화면 언어 번역기(t)로만 (동작)", () => {
  it("상태·시작한 사람 칸이 t(key) 결과로 그려진다 (언어 삼항 + 직접 번역 없음)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<AdminSupportArchivePage />);
    });
    await flush();
    const text = host.textContent ?? "";
    expect(text).toContain("old note");
    // 시험의 t 는 키를 그대로 돌려준다 — 화면 번역기를 거치면 키가, 우회하면 번역 문장이 보인다
    expect(text).toContain("admin_support_awaiting_reply");
    expect(text).toContain("admin_support_member_started");
  });
});
