import { translate } from "@/lib/i18n/messages";
// @vitest-environment jsdom
/**
 * 고객 문의 운영 반영 뒤 최종 점검 (docs/audit/customer-support-inquiry-final-2026-11-28/final-audit-2.md §2) —
 * 어드민 쪽 H1 · M6 · M7 · L13 · U10 · U11 · U12 회귀 잠금.
 * 동작 시험 = 실제 콘솔을 jsdom 에 그려 누르고 요청을 확인. 문자열 확인은 「(구조 확인)」.
 */
import "@/lib/i18n/admin-catalog";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  fetchAdminMeSnapshot: async () => null,
}));
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({
  confirmAdminAction: vi.fn(async () => ({ ok: true })),
}));
const realtimeTables: string[] = [];
const realtimeHandlers: Record<string, (payload: unknown) => void> = {};
vi.mock("@/lib/supabase/client", () => {
  const channel: { on: (...a: unknown[]) => unknown; subscribe: () => unknown } = {
    on: (_kind: unknown, filter: unknown, handler?: unknown) => {
      const table = String((filter as { table?: string })?.table ?? "");
      realtimeTables.push(table);
      if (typeof handler === "function") realtimeHandlers[table] = handler as (payload: unknown) => void;
      return channel;
    },
    subscribe: () => channel,
  };
  return { getSupabaseClient: () => ({ channel: () => channel, removeChannel: async () => undefined }) };
});
vi.mock("@/lib/supabase/private-realtime-channel-options", () => ({ privateRealtimeChannelOptions: () => ({}) }));

import { MESSAGES } from "@/lib/i18n/messages";
import { AdminSupportPage } from "@/components/admin/support/AdminSupportPage";
import {
  createSupportCaseCountCache,
  dispatchAdminSupportMessageInsert,
  shouldRefreshSupportCountsForCaseUpdate,
} from "@/components/admin/support/admin-support-realtime";
import { supportAdminStatusLabel } from "@/lib/support/support-status-label";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

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
    last_message_at: `2026-11-28T0${id === "A" ? 1 : 2}:00:00Z`,
    ...over,
  };
}

type Deferred = { resolve: (body: unknown, status?: number) => void };
type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let pendingDetail: Record<string, Deferred[]> = {};
type PatchResult = { status: number; body: unknown };
let patchResponder: (call: Call) => PatchResult | Promise<PatchResult> = () => ({ status: 200, body: { ok: true } });

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

let deferLists = false;
let pendingLists: ((ids: string[]) => void)[] = [];

beforeEach(() => {
  deferLists = false;
  pendingLists = [];
  calls = [];
  pendingDetail = {};
  patchResponder = () => ({ status: 200, body: { ok: true } });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const call: Call = { url, method, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
    calls.push(call);
    if (url.startsWith("/api/admin/support/cases?")) {
      if (deferLists) {
        return new Promise<Response>((resolve) => {
          pendingLists.push((ids: string[]) => resolve(jsonResponse({ ok: true, cases: ids.map((id) => caseRow(id)), counts: {}, total: ids.length })));
        });
      }
      return jsonResponse({ ok: true, cases: [caseRow("A"), caseRow("B")], counts: {}, total: 2 });
    }
    const m = /^\/api\/admin\/support\/cases\/([^/?]+)$/.exec(url);
    if (m && method === "PATCH") {
      const r = await patchResponder(call);
      return jsonResponse(r.body, r.status);
    }
    if (m) {
      const id = decodeURIComponent(m[1]);
      return new Promise<Response>((resolve) => {
        (pendingDetail[id] ??= []).push({ resolve: (body, status = 200) => resolve(jsonResponse(body, status)) });
      });
    }
    return jsonResponse({ ok: false }, 404);
  }) as typeof fetch;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AdminSupportPage />);
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

async function resolveDetail(id: string, over: Record<string, unknown> = {}, messageBody = `msg of ${id}`) {
  const d = pendingDetail[id]?.shift();
  expect(d, `pending detail request for ${id}`).toBeTruthy();
  await act(async () => {
    d!.resolve({
      ok: true,
      case: caseRow(id, over),
      messages: [
        {
          id: `m-${id}`,
          case_id: id,
          sender_type: "USER",
          message_type: "PUBLIC",
          body: messageBody,
          created_at: "2026-11-28T00:00:00Z",
          sender_admin_id: null,
          deleted_at: null,
          edited_at: null,
        },
      ],
      followupIssues: [],
    });
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

const centerText = () => q("[data-admin-support-center]")?.textContent ?? "";

describe("H1 — 문의를 바꿔 누르면 이전 문의가 남지 않고, 저장은 보이는 문의로만 (동작)", () => {
  it("A → B 클릭, B 응답 뒤 늦은 A 응답 → 화면 B · 답변은 B 로 · B 의 seenLastMessageAt", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    expect(centerText()).toContain("SP-A");

    // 실시간 다시 읽기(열린 문의 A) — 응답이 늦게 온다
    await act(async () => {
      dispatchAdminSupportMessageInsert({ caseId: "A", senderAdminId: null });
    });
    await flush();
    expect(pendingDetail.A?.length).toBe(1);

    await click(q('[data-admin-support-row="B"]'));
    // B 응답 전: A 내용이 보이지 않고, 답변 버튼은 누를 수 없다
    expect(centerText()).not.toContain("SP-A");
    expect(centerText()).not.toContain("msg of A");
    const sendWhileLoading = q<HTMLButtonElement>("[data-admin-support-send]");
    expect(sendWhileLoading == null || sendWhileLoading.disabled).toBe(true);

    await resolveDetail("B");
    await resolveDetail("A"); // 늦은 A 응답
    expect(centerText()).toContain("SP-B");
    expect(centerText()).toContain("msg of B");
    expect(centerText()).not.toContain("SP-A");
    expect(centerText()).not.toContain("msg of A");

    await typeDraft("hello B");
    await click(q("[data-admin-support-send]"));
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("/api/admin/support/cases/B");
    expect(patches[0].body).toMatchObject({
      action: "reply",
      body: "hello B",
      seenLastMessageAt: "2026-11-28T02:00:00Z",
    });
  });

  it("B 를 불러오는 중에는 상태·담당 버튼도 없다(A 화면으로 저장 불가)", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    expect(q("[data-admin-support-resolve]")).toBeTruthy();
    await click(q('[data-admin-support-row="B"]'));
    expect(q("[data-admin-support-resolve]")).toBeNull();
    expect(q("[data-admin-support-assign-self]")).toBeNull();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });
});

describe("M6 — 「상담 종료」는 본 마지막 글 시각을 보내고, case_updated 면 다시 읽는다 (동작)", () => {
  it("종료 PATCH 에 seenLastMessageAt · case_updated → 상세 GET 다시 · 안내 문구", async () => {
    await mount();
    await click(q('[data-admin-support-row="B"]'));
    await resolveDetail("B");
    patchResponder = () => ({ status: 409, body: { ok: false, error: "case_updated" } });
    const getsBefore = calls.filter((c) => c.method === "GET" && c.url === "/api/admin/support/cases/B").length;
    await click(q("[data-admin-support-resolve]"));
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toBe("/api/admin/support/cases/B");
    expect(patch?.body).toMatchObject({ action: "status", status: "RESOLVED", seenLastMessageAt: "2026-11-28T02:00:00Z" });
    const getsAfter = calls.filter((c) => c.method === "GET" && c.url === "/api/admin/support/cases/B").length;
    expect(getsAfter).toBe(getsBefore + 1);
    await resolveDetail("B", { last_message_at: "2026-11-28T03:00:00Z" }, "new customer msg");
    expect(centerText()).toContain("new customer msg");
    expect(centerText()).toContain("admin_support_error_case_updated");
  });
});

describe("L13 — 콘솔은 support_messages 를 직접 구독하지 않고 공통 구독 이벤트로 받는다 (동작)", () => {
  it("콘솔 채널에 support_messages 없음 · 이벤트로 열린 문의 다시 읽기", async () => {
    realtimeTables.length = 0;
    await mount();
    expect(realtimeTables).toContain("support_cases");
    expect(realtimeTables).not.toContain("support_messages");
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    await act(async () => {
      dispatchAdminSupportMessageInsert({ caseId: "A", senderAdminId: null });
    });
    await flush();
    expect(pendingDetail.A?.length).toBe(1);
  });

  it("공통 구독이 이벤트를 보낸다 (구조 확인)", () => {
    const provider = src("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain("dispatchAdminSupportMessageInsert({");
    expect(src("components/admin/support/AdminSupportPage.tsx")).not.toContain('table: "support_messages"');
  });
});

describe("M7 — 공통 구독 support_cases UPDATE 는 숫자 관련 값이 바뀔 때만 다시 읽기 (동작)", () => {
  it("처음 본 문의 → 읽음 · 같은 값 → 안 읽음 · 상태/담당/미읽음 변화 → 읽음", () => {
    const cache = createSupportCaseCountCache();
    const row = { id: "c1", status: "WAITING_ADMIN", assigned_admin_id: null, admin_unread_count: 1, requester_unread_count: 0 };
    expect(shouldRefreshSupportCountsForCaseUpdate(cache, row)).toBe(true);
    // 고객 읽음(requester_unread_count)·마지막 글 시각만 바뀜 → 다시 읽지 않음
    expect(shouldRefreshSupportCountsForCaseUpdate(cache, { ...row, requester_unread_count: 5, last_message_at: "x" })).toBe(false);
    expect(shouldRefreshSupportCountsForCaseUpdate(cache, { ...row, admin_unread_count: 0 })).toBe(true);
    expect(shouldRefreshSupportCountsForCaseUpdate(cache, { ...row, admin_unread_count: 0 })).toBe(false);
    expect(shouldRefreshSupportCountsForCaseUpdate(cache, { ...row, admin_unread_count: 0, status: "WAITING_USER" })).toBe(true);
    expect(
      shouldRefreshSupportCountsForCaseUpdate(cache, { ...row, admin_unread_count: 0, status: "WAITING_USER", assigned_admin_id: "a" })
    ).toBe(true);
    expect(shouldRefreshSupportCountsForCaseUpdate(cache, { id: "" })).toBe(false);
  });

  it("공통 구독이 같은 판정을 쓴다 (구조 확인)", () => {
    const provider = src("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain("shouldRefreshSupportCountsForCaseUpdate(supportCountCache");
    expect(provider).not.toMatch(/table: "support_cases" \},\s*\/\/ Count refresh only — UPDATE[^\n]*\n\s*\(\) => scheduleRefresh\(\)/);
  });
});

describe("U11 — WAITING_ADMIN 어드민 이름 = 탭 「답변 필요」 (동작)", () => {
  it("알약·탭 같은 말 · 영어 짧은 말", () => {
    const ko = MESSAGES.ko as Record<string, string>;
    const en = MESSAGES.en as Record<string, string>;
    expect(supportAdminStatusLabel("WAITING_ADMIN", (k) => translate("ko", k))).toBe(ko.admin_needs_reply);
    expect(supportAdminStatusLabel("WAITING_ADMIN", (k) => translate("en", k))).toBe(en.admin_needs_reply);
    expect(supportAdminStatusLabel("WAITING_ADMIN", (k) => translate("en", k))).not.toBe("Waiting admin");
  });
});

describe("U12 · U10 (구조 확인)", () => {
  it("콘솔·매장 문의 패널에 언어 삼항 없음", () => {
    const page = src("components/admin/support/AdminSupportPage.tsx");
    const panel = src("components/admin/support/AdminSupportStoreInquiriesPanel.tsx");
    for (const s of [page, panel]) {
      expect(s).not.toContain('translateBy(ko ? "ko" : "en"');
      expect(s).not.toMatch(/ko \? st\.ko : st\.en/);
    }
  });

  it("좁은 화면 주 동작(답변·상담 종료·재오픈) 44px", async () => {
    await mount();
    await click(q('[data-admin-support-row="B"]'));
    await resolveDetail("B");
    expect(q("[data-admin-support-send]")?.className).toContain("min-h-11");
    expect(q("[data-admin-support-resolve]")?.className).toContain("min-h-11");
    expect(q("[data-admin-support-send]")?.className).toContain("lg:min-h-0");
  });
});

/** 저장(PATCH) 응답을 손으로 풀기 */
function deferredPatch() {
  let release: (r: PatchResult) => void = () => {};
  const p = new Promise<PatchResult>((r) => {
    release = r;
  });
  patchResponder = () => p;
  return async (r: PatchResult) => {
    await act(async () => {
      release(r);
    });
    await flush();
  };
}

const draftValue = () => q<HTMLTextAreaElement>("[data-admin-support-composer] textarea")?.value ?? null;

describe("병합 전 2차 1 — 저장 중에는 다른 문의로 바꿀 수 없고, 결과·실패는 그 문의 화면에 남는다 (동작)", () => {
  it("저장 중 B 클릭 = 무시(B 요청 없음) · 실패 → A 화면에 안내 · 쓰던 답 남음", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    await typeDraft("answer A");
    const finishPatch = deferredPatch();
    await click(q("[data-admin-support-send]"));
    expect(q('[data-admin-support-row="B"]')?.getAttribute("data-admin-support-row-disabled")).toBe("1");
    await click(q('[data-admin-support-row="B"]'));
    expect(pendingDetail.B ?? []).toHaveLength(0);
    await finishPatch({ status: 400, body: { ok: false, error: "network_error" } });
    expect(centerText()).toContain("SP-A");
    expect(host!.textContent ?? "").toContain("common_network_error");
    expect(draftValue()).toBe("answer A");
  });

  it("저장이 끝나면 다시 다른 문의를 누를 수 있다", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    await typeDraft("answer A");
    const finishPatch = deferredPatch();
    await click(q("[data-admin-support-send]"));
    await finishPatch({ status: 200, body: { ok: true } });
    if (pendingDetail.A?.length) await resolveDetail("A");
    expect(q('[data-admin-support-row="B"]')?.getAttribute("data-admin-support-row-disabled")).toBeNull();
    await click(q('[data-admin-support-row="B"]'));
    await resolveDetail("B");
    expect(centerText()).toContain("SP-B");
  });
});

describe("PR #687 재감사 6 — 글 INSERT 이벤트로는 목록을 다시 읽지 않는다 (동작)", () => {
  it("열린 문의 상세만 다시 읽고 목록 GET 은 없다", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    const listCalls = () => calls.filter((c) => c.url.startsWith("/api/admin/support/cases?")).length;
    const before = listCalls();
    await act(async () => {
      dispatchAdminSupportMessageInsert({ caseId: "A", senderAdminId: null });
      dispatchAdminSupportMessageInsert({ caseId: "B", senderAdminId: null });
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await flush();
    expect(listCalls()).toBe(before);
    expect(pendingDetail.A?.length).toBe(1);
  });
});

describe("PR #687 재감사 8 — 답을 쓰는 사이 새 고객 글이 화면에 나타나면 알린다 (동작)", () => {
  it("쓰는 중 + 다시 읽기에 새 고객 글 → 안내 · 쓰는 중 아니면 안내 없음", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    await typeDraft("writing…");
    await act(async () => {
      dispatchAdminSupportMessageInsert({ caseId: "A", senderAdminId: null });
    });
    await flush();
    const d = pendingDetail.A?.shift();
    expect(d).toBeTruthy();
    await act(async () => {
      d!.resolve({
        ok: true,
        case: caseRow("A", { last_message_at: "2026-11-28T03:00:00Z" }),
        messages: [
          { id: "m-A", case_id: "A", sender_type: "USER", message_type: "PUBLIC", body: "msg of A", created_at: "2026-11-28T00:00:00Z", sender_admin_id: null, deleted_at: null, edited_at: null },
          { id: "m-A2", case_id: "A", sender_type: "MEMBER", message_type: "PUBLIC", body: "new from customer", created_at: "2026-11-28T03:00:00Z", sender_admin_id: null, deleted_at: null, edited_at: null },
        ],
        followupIssues: [],
      });
    });
    await flush();
    expect(centerText()).toContain("new from customer");
    expect(host!.textContent ?? "").toContain("admin_support_notice_unseen_customer_messages");
  });
});

describe("PR #687 재감사(2차) 1 — 목록은 가장 최근 요청의 응답만 그린다 (동작)", () => {
  it("먼저 보낸 목록 응답이 늦게 와도 나중 요청 결과를 덮지 않는다", async () => {
    await mount();
    deferLists = true;
    const emit = async () => {
      await act(async () => {
        realtimeHandlers.support_cases?.({ eventType: "INSERT", new: { id: "NEW" }, old: null });
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      await flush();
    };
    await emit(); // 목록 요청 #1
    await emit(); // 목록 요청 #2
    expect(pendingLists).toHaveLength(2);
    await act(async () => pendingLists[1](["NEWEST"]));
    await flush();
    await act(async () => pendingLists[0](["STALE"]));
    await flush();
    expect(q('[data-admin-support-row="NEWEST"]')).toBeTruthy();
    expect(q('[data-admin-support-row="STALE"]')).toBeNull();
  });
});

describe("병합 전 L2 — 열린 문의가 다른 곳에서 바뀌면 상세를 다시 읽는다 (동작)", () => {
  it("열린 문의 상태 변경 실시간 → 상세 다시 읽기 · 다른 문의 변경 → 안 읽음", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    const gets = () => calls.filter((c) => c.method === "GET" && c.url === "/api/admin/support/cases/A").length;
    const before = gets();
    await act(async () => {
      realtimeHandlers.support_cases?.({ eventType: "UPDATE", new: { ...caseRow("B"), status: "RESOLVED" }, old: { id: "B" } });
    });
    await flush();
    expect(gets()).toBe(before);
    await act(async () => {
      realtimeHandlers.support_cases?.({ eventType: "UPDATE", new: { ...caseRow("A"), status: "RESOLVED" }, old: { id: "A" } });
    });
    await flush();
    expect(gets()).toBe(before + 1);
  });

  it("답변이 case_closed 로 거절되면 상세를 다시 읽는다", async () => {
    await mount();
    await click(q('[data-admin-support-row="A"]'));
    await resolveDetail("A");
    patchResponder = () => ({ status: 400, body: { ok: false, error: "case_closed" } });
    const gets = () => calls.filter((c) => c.method === "GET" && c.url === "/api/admin/support/cases/A").length;
    const before = gets();
    await typeDraft("late answer");
    await click(q("[data-admin-support-send]"));
    expect(gets()).toBe(before + 1);
  });
});
