// @vitest-environment jsdom
/**
 * 문의 창 상태 기계 + 단일 요청 실행기 (계약 docs/audit/customer-support-full-fix-contract-2026-11-28.md §0 결정 1 · §1 · §3 · §4 · §5)
 * 재감사 docs/audit/customer-support-full-reaudit-2026-11-28.md C-1~C-22 · A-3 · A-11 · B-1 · B-2 · §1 계획 대비 미완 회귀 잠금.
 * 모두 동작 시험(실제 컴포넌트를 jsdom 에 그려 누르고 확인). 기준 트리 d2e0fc07f 에서 실패해야 한다 —
 * 그래서 새 모듈(support-modal-machine 등)은 맨 위에서 import 하지 않는다(없으면 시험 파일 전체가 안 돌아 근거가 안 됨).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  pathname: "/mypage/customer-center",
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/support/SupportSheetShell", () => ({
  SupportSheetShell: ({ open, children }: { open: boolean; children: unknown }) =>
    open ? <div data-test-sheet="1">{children as never}</div> : null,
}));
const authUser = vi.hoisted(() => ({ id: "u1" as string | null }));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => (authUser.id ? { id: authUser.id, nickname: "Kim" } : null),
  getCurrentUserIdForDb: async () => authUser.id,
}));
const session = vi.hoisted(() => ({
  ensure: vi.fn(async () => undefined),
  phase: "authenticated",
  listeners: new Set<(p: string) => void>(),
}));
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  ensureSessionHealthy: session.ensure,
  getSessionPhase: () => session.phase,
  subscribeSessionPhase: (l: (p: string) => void) => {
    session.listeners.add(l);
    return () => session.listeners.delete(l);
  },
}));
const ownerLite = vi.hoisted(() => ({
  snap: { ownerStores: [] as { id: string; store_name: string; approval_status: string }[] },
}));
vi.mock("@/lib/stores/owner-lite-external-store", () => ({
  getOwnerLiteStoreSnapshot: () => ownerLite.snap,
  getOwnerLiteStoreServerSnapshot: () => ownerLite.snap,
  subscribeOwnerLiteStore: () => () => undefined,
}));
const realtime = vi.hoisted(() => ({ onChange: null as null | ((ctx: { eventType: string; row?: Record<string, unknown> }) => void) }));
vi.mock("@/hooks/useSupabaseNotificationsRealtime", () => ({
  useSupabaseNotificationsRealtime: (onChange: (ctx: { eventType: string; row?: Record<string, unknown> }) => void) => {
    realtime.onChange = onChange;
  },
}));

import { SupportModalHost } from "@/components/support/SupportModalHost";
import { SupportCaseBootstrapClient } from "@/components/support/SupportCaseBootstrapClient";
import { SupportCasesHistoryList } from "@/components/support/SupportCasesHistoryList";
import { SupportFab } from "@/components/support/SupportFab";
import { NotificationsBadgeRealtimeBridge } from "@/components/notifications/NotificationsBadgeRealtimeBridge";
import { closeSupportModal, getSupportModalState, openSupportModal } from "@/lib/support/support-modal-controller";
import * as deliverMod from "@/lib/support/deliver-support-open";
import { SupportCenterEnterClient } from "@/components/support/SupportCenterEnterClient";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { SUPPORT_CONTEXT_SESSION_KEY } from "@/lib/support/support-context";
import { getSupportCategoryDefinition } from "@/lib/support/support-category-registry";
import { buildGenericSupportTriageContext, type SupportContext } from "@/lib/support/support-context";
import {
  initSupportTicketForm,
  readSupportTicketDraft,
  setSupportTicketBody,
  supportTicketDraftKey,
  writeSupportTicketDraft,
} from "@/lib/support/support-ticket-form";
import { SUPPORT_NOTIFICATION_ARRIVED_EVENT } from "@/lib/support/support-notification-events";
import * as ownerCta from "@/lib/support/support-owner-cta";

function caseRow(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    public_case_no: "SP-1",
    audience: "MEMBER",
    category: "ACCOUNT",
    issue_type: null,
    status: "WAITING_USER",
    requester_unread_count: 1,
    owner_store_id: null,
    created_at: "2026-11-27T00:00:00Z",
    last_message_at: "2026-11-27T01:00:00Z",
    ...over,
  };
}
const answerMsg = (over: Record<string, unknown> = {}) => ({
  id: "m2",
  sender_type: "ADMIN",
  body: "답변",
  created_at: "2026-11-27T01:00:00Z",
  deleted_at: null,
  edited_at: null,
  ...over,
});
const questionMsg = { id: "m1", sender_type: "MEMBER", body: "질문", created_at: "2026-11-27T00:00:00Z", deleted_at: null };

type Route = (url: string, init?: RequestInit) => unknown | Promise<unknown>;
let route: Route = () => ({ ok: false });
type Call = { url: string; method: string; body: Record<string, unknown> | null };
const calls: Call[] = [];
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const url = String(input);
  let body: Record<string, unknown> | null = null;
  try {
    body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  calls.push({ url, method: init?.method ?? "GET", body });
  const out = await route(url, init);
  if (out instanceof Response) return out;
  return new Response(JSON.stringify(out ?? { ok: false }), { status: 200 });
});

let container: HTMLDivElement;
let root: Root;

async function resetModal() {
  // 새 트리 = 상태 기계 초기화(쓰기 요청 중이면 닫기가 보관되므로) · 기준 트리 = 옛 닫기
  const machinePath = "@/lib/support/support-modal-machine";
  const mod = (await import(/* @vite-ignore */ machinePath).catch(() => null)) as
    | { __resetSupportModalMachineForTests?: () => void }
    | null;
  act(() => {
    if (mod?.__resetSupportModalMachineForTests) mod.__resetSupportModalMachineForTests();
    else closeSupportModal();
    // 진입 주소 보관·표시(새 트리에만 있음)
    (deliverMod as { __resetSupportEntryRoutingForTests?: () => void }).__resetSupportEntryRoutingForTests?.();
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetchMock);
  calls.length = 0;
  fetchMock.mockClear();
  nav.pathname = "/mypage/customer-center";
  nav.replace.mockClear();
  nav.push.mockClear();
  session.ensure.mockReset();
  session.ensure.mockImplementation(async () => undefined);
  authUser.id = "u1";
  window.history.replaceState(null, "", "/mypage/customer-center");
  session.phase = "authenticated";
  ownerLite.snap = { ownerStores: [] };
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
  await resetModal();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await resetModal();
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel);
function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function click(el: Element | null) {
  expect(el).not.toBeNull();
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
function deviceBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
}
const isDisabled = (sel: string) => (q<HTMLButtonElement>(sel)?.disabled ?? null);
const visibleView = () =>
  Array.from(container.querySelectorAll("[data-support-ticket-view]")).filter(
    (el) => !el.closest("[aria-hidden='true']")
  )[0] as HTMLElement | undefined;

const memberCtx = (): SupportContext =>
  buildGenericSupportTriageContext({ audience: "MEMBER", sourceSurface: "mypage_customer_center" });
const ownerCtx = (): SupportContext =>
  buildGenericSupportTriageContext({ audience: "OWNER", sourceSurface: "owner_customer_center", storeId: "s1" });
const storeOrderCtx = (): SupportContext => ({
  enabled: true,
  audience: "MEMBER",
  category: "REPORT" as SupportContext["category"],
  issueType: "STORE_ORDER_DISPUTE",
  sourceSurface: "order_detail",
  referenceType: "STORE_ORDER",
  referenceId: "order-1",
  storeChatHref: "/orders/order-1/chat",
});

function holdable() {
  const h: { release: (v: unknown) => void; aborted: boolean } = { release: () => undefined, aborted: false };
  const make = (init?: RequestInit) =>
    new Promise((resolve, reject) => {
      h.release = resolve;
      init?.signal?.addEventListener("abort", () => {
        h.aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  return { h, make };
}

/** 쓰기 → 분야·세부·본문 → 접수(응답은 붙잡아 둔다) */
async function composeAndSubmit(
  body: string,
  extra: Route = () => ({ ok: false }),
  ctx: SupportContext = memberCtx()
) {
  const { h, make } = holdable();
  route = (url, init) => {
    if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [caseRow({ id: "row1" })] };
    if (url.startsWith("/api/support/cases/open")) return make(init);
    return extra(url, init);
  };
  await act(async () => root.render(<SupportModalHost />));
  act(() => {
    openSupportModal({ context: ctx });
  });
  await flush();
  if (q('[data-testid="support-ticket-field-category"]') && !ctx.issueType) {
    click(q('[data-testid="support-ticket-field-category"]'));
    click(q('[data-testid^="support-ticket-cat-"]'));
    click(q('[data-testid^="support-ticket-issue-"]'));
  }
  typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, body);
  click(q('[data-support-ticket-submit="1"]'));
  await flush(2);
  return { holder: h, ctx };
}

/* ───────────── R1 진행 중 요청 = busy 하나 ───────────── */

describe("R1 쓰기 요청 중 = 모든 버튼 같은 busy (C-1·C-2·C-3·C-4·C-5)", () => {
  it("C-1·C-2: 전송 중 「매장에 문의하기」 비활성 · 눌러도 창 유지 → 결과가 같은 창에 붙음(접수 완료)", async () => {
    const { holder } = await composeAndSubmit("주문 문제", undefined, storeOrderCtx());
    expect(isDisabled('[data-support-ticket-store-chat="1"]')).toBe(true);
    click(q('[data-support-ticket-store-chat="1"]'));
    await flush();
    // 고치기 전: 닫기 막음을 우회해 창이 닫히고 결과·오류가 버려졌다(C-1) → 다시 열면 같은 글이 카드로(C-2)
    expect(getSupportModalState().phase).toBe("open");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    await act(async () => holder.release({ ok: true, case: { id: "c-new", public_case_no: "SC-1" }, created: true }));
    await flush(3);
    expect(q('[data-support-ticket-view="submitted"]')).not.toBeNull();
  });

  it("C-3: 앞 접수가 끝나도 다른 접수 중이면 ◁ 로 닫히지 않는다 — 쓰기 동시 1개 · ✕ 비활성 = ◁ 보관", async () => {
    const { holder } = await composeAndSubmit("첫 글", undefined, storeOrderCtx());
    // 고치기 전 경로: 매장 채팅으로 닫고(C-1) 다시 열어 두 번째 접수
    const chat = q<HTMLButtonElement>('[data-support-ticket-store-chat="1"]');
    if (chat && !chat.disabled) click(chat);
    await flush();
    act(() => {
      deliverMod.deliverSupportOpen({ context: storeOrderCtx(), source: "cta" });
    });
    await flush();
    const body = q<HTMLTextAreaElement>('[data-support-ticket-body="1"]');
    if (body && !body.readOnly) typeInto(body, "두 번째 글");
    const submit = q<HTMLButtonElement>('[data-support-ticket-submit="1"]');
    if (submit && !submit.disabled) {
      click(submit);
      await flush(2);
    }
    await act(async () => holder.release({ ok: false, error: "open_failed" }));
    await flush(3);
    // 쓰기 요청은 동시에 1개뿐
    expect(calls.filter((c) => c.url.startsWith("/api/support/cases/open"))).toHaveLength(1);
    const closeDisabled = q<HTMLButtonElement>('[data-support-modal-close="1"]')!.disabled;
    deviceBack();
    await flush();
    if (closeDisabled) expect(getSupportModalState().phase).toBe("open");
  });

  it("C-4: 전송 중 진행 중 문의 행 비활성 · 눌러도 상세가 열리지 않음", async () => {
    await composeAndSubmit("행 누르기");
    const row = q<HTMLButtonElement>('[data-support-ticket-active-row="row1"]');
    expect(row).not.toBeNull();
    expect(row!.disabled).toBe(true);
    click(row);
    await flush();
    expect(q('[data-support-ticket-view="detail"]')).toBeNull();
  });

  it("C-5: 전송 중 분야·세부·회원↔매장 비활성 · 눌러도 화면 그대로(실패 문구가 보이는 자리)", async () => {
    ownerLite.snap = { ownerStores: [{ id: "s1", store_name: "Shop", approval_status: "approved" }] };
    const { holder } = await composeAndSubmit("분야 누르기");
    expect(isDisabled('[data-testid="support-ticket-field-category"]')).toBe(true);
    expect(isDisabled('[data-testid="support-ticket-field-issue"]')).toBe(true);
    expect(isDisabled('[data-support-ticket-switch="OWNER"]')).toBe(true);
    click(q('[data-testid="support-ticket-field-category"]'));
    await flush();
    expect(q('[data-support-ticket-view="pick_category"]')).toBeNull();
    await act(async () => holder.release({ ok: false, error: "open_failed" }));
    await flush(3);
    expect(q('[data-support-ticket-view="form"] [role="alert"]')?.textContent).toBe("common_error");
  });
});

/* ───────────── R2 늦은 응답 = 그 화면에만 ───────────── */

describe("R2 결과는 (창 회차·화면·문의) 가 맞을 때만 (C-6·C-9·C-13·C-14)", () => {
  it("결정 1: 쓰는 중 푸시로 다른 문의 → 상세가 위에 · ‹ = 쓰기 화면, 입력 그대로", async () => {
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [] };
      if (url.startsWith("/api/support/cases/c2")) return { ok: true, case: caseRow({ id: "c2" }), messages: [answerMsg()] };
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "쓰던 글");
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "c2", source: "push" });
    });
    await flush();
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("detail");
    click(q('[data-support-ticket-view="detail"] [data-support-ticket-back="1"]'));
    await flush();
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("form");
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("쓰던 글");
  });

  it("C-6: 전송 중 푸시로 다른 문의 → 결과 뒤 위에 열림 · 실패는 아래 쓰기 화면에 남아 ‹ 로 보임", async () => {
    const { holder } = await composeAndSubmit("실패할 글", (url) =>
      url.startsWith("/api/support/cases/c2") ? { ok: true, case: caseRow({ id: "c2" }), messages: [answerMsg()] } : { ok: false }
    );
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "c2", source: "push" });
    });
    await flush();
    await act(async () => holder.release({ ok: false, error: "open_failed" }));
    await flush(4);
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("detail");
    click(q('[data-support-ticket-view="detail"] [data-support-ticket-back="1"]'));
    await flush();
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("form");
    expect(q('[data-support-ticket-view="form"] [role="alert"]')?.textContent).toBe("common_error");
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("실패할 글");
  });

  it("C-6: 전송 중 푸시 → 성공은 접수 완료를 아래에 두고 푸시 상세를 덮지 않는다", async () => {
    const { holder } = await composeAndSubmit("성공할 글", (url) =>
      url.startsWith("/api/support/cases/c2") ? { ok: true, case: caseRow({ id: "c2" }), messages: [answerMsg()] } : { ok: false }
    );
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "c2", source: "push" });
    });
    await flush();
    await act(async () => holder.release({ ok: true, case: { id: "c-new", public_case_no: "SC-2" }, created: true }));
    await flush(4);
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("detail");
    click(q('[data-support-ticket-view="detail"] [data-support-ticket-back="1"]'));
    await flush();
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("submitted");
  });

  it("C-9: 전송 중 연 종료 문의의 「문의하기」 → 새 쓰기 화면에 이전 접수 실패가 뜨지 않는다", async () => {
    const { holder } = await composeAndSubmit("이전 글", (url) =>
      url.startsWith("/api/support/cases/cz")
        ? { ok: true, closed: true, case: caseRow({ id: "cz", status: "RESOLVED", requester_unread_count: 0 }), messages: [] }
        : { ok: false }
    );
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "cz", source: "push" });
    });
    await flush();
    // 고치기 전: 종료 문의가 바로 열려 「문의하기」를 누를 수 있었다
    const early = q<HTMLButtonElement>('[data-support-ticket-new="1"]');
    if (early && !early.disabled) click(early);
    await flush();
    await act(async () => holder.release({ ok: false, error: "open_failed" }));
    await flush(4);
    const late = q<HTMLButtonElement>('[data-support-ticket-new="1"]');
    if (late) click(late);
    await flush();
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("form");
    expect(q('[data-support-ticket-view="form"] [role="alert"]')).toBeNull();
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("");
  });

  it("C-13: 「확인했어요」 A 중 B 로 이동 → A 성공은 B 를 닫지 않는다(A 만 빠짐 · B 보임)", async () => {
    const { h, make } = holdable();
    route = (url, init) => {
      if (url.startsWith("/api/support/cases/cA")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        if (body?.action === "close") return make(init);
        if (init?.method === "POST") return { ok: true };
        return { ok: true, case: caseRow({ id: "cA" }), messages: [answerMsg()] };
      }
      if (url.startsWith("/api/support/cases/cB")) {
        if (init?.method === "POST") return { ok: true };
        return { ok: true, case: caseRow({ id: "cB", public_case_no: "SP-B" }), messages: [answerMsg({ id: "b2" })] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "cA" });
    });
    await flush();
    click(q('[data-support-ticket-confirm="1"]'));
    await flush(2);
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "cB", source: "push" });
    });
    await flush();
    await act(async () => h.release({ ok: true }));
    await flush(4);
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBe("cB");
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("detail");
  });

  it("C-14: 읽음(seen) = 화면이 보일 때만 — 숨긴 문서에서 받은 상세는 보이는 순간 seen 1번(보인 글 id·시각)", async () => {
    let visible = "hidden";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
    route = (url, init) => {
      if (url.startsWith("/api/support/cases/c1")) {
        if (init?.method === "POST") return { ok: true, notificationsRead: 0 };
        return { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(q('[data-support-ticket-view="detail"]')).not.toBeNull();
    const seen = () => calls.filter((c) => c.method === "POST" && c.body?.action === "seen");
    expect(seen()).toHaveLength(0);
    visible = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(seen()).toHaveLength(1);
    expect(seen()[0]!.body).toEqual({
      action: "seen",
      shownMessageIds: ["m1", "m2"],
      seenLastMessageAt: "2026-11-27T01:00:00Z",
    });
  });

  it("요청 예산: 서버가 needsSeen=false 라고 하면(읽을 것 없음) 보여도 seen 을 보내지 않는다", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    route = (url, init) => {
      if (url.startsWith("/api/support/cases/c1")) {
        if (init?.method === "POST") return { ok: true, notificationsRead: 0 };
        return { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()], needsSeen: false };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(q('[data-support-ticket-view="detail"]')).not.toBeNull();
    expect(calls.filter((c) => c.method === "POST" && c.body?.action === "seen")).toHaveLength(0);
  });

  it("C-14: 다른 화면 아래 숨은 상세는 seen 을 보내지 않고, 맨 위로 돌아오면 보낸다", async () => {
    route = (url, init) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [caseRow()] };
      if (url.startsWith("/api/support/cases/c1") || url.startsWith("/api/support/cases/c2")) {
        const id = url.includes("/c2") ? "c2" : "c1";
        if (init?.method === "POST") return { ok: true };
        return { ok: true, case: caseRow({ id }), messages: [answerMsg({ id: `${id}-a` })] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "c2", source: "push" });
    });
    await flush();
    const seenFor = (id: string) =>
      calls.filter((c) => c.method === "POST" && c.body?.action === "seen" && c.url.includes(`/${id}`));
    expect(seenFor("c2")).toHaveLength(1);
    expect(seenFor("c1")).toHaveLength(0);
    // c2 를 빼면 c1 이 맨 위 — 그때 c1 의 seen
    click(q('[data-support-ticket-view="detail"] [data-support-ticket-back="1"]'));
    await flush();
    expect(getSupportModalState().caseId).toBe("c1");
    expect(seenFor("c1")).toHaveLength(1);
  });
});

/* ───────────── R3 열기 = 쌓기 ───────────── */

describe("R3 열기 요청은 덮어쓰지 않고 쌓는다 (C-10·C-11·C-22)", () => {
  it("C-10: 접수 완료 화면에서 푸시 → 그 문의 상세", async () => {
    const { holder } = await composeAndSubmit("접수", (url) =>
      url.startsWith("/api/support/cases/c3") ? { ok: true, case: caseRow({ id: "c3" }), messages: [answerMsg()] } : { ok: false }
    );
    await act(async () => holder.release({ ok: true, case: { id: "c-new", public_case_no: "SC-3" }, created: true }));
    await flush(3);
    expect(q('[data-support-ticket-view="submitted"]')).not.toBeNull();
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "c3", source: "push" });
    });
    await flush();
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("detail");
  });

  it("C-11: 같은 문의 상세가 열린 채 새 답변 푸시 → 다시 읽는다", async () => {
    route = (url, init) => {
      if (url.startsWith("/api/support/cases/c1")) {
        if (init?.method === "POST") return { ok: true };
        return { ok: true, case: caseRow(), messages: [answerMsg()] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    const gets = () => calls.filter((c) => c.url.startsWith("/api/support/cases/c1") && c.method === "GET").length;
    expect(gets()).toBe(1);
    act(() => {
      deliverMod.deliverSupportOpen({ caseId: "c1", source: "push" });
    });
    await flush();
    expect(gets()).toBe(2);
  });

  it("C-22: 열린 쓰기 창 위로 다른 맥락 열기 → 새 맥락의 쓰기 화면(상태·저장 칸 모두 새 맥락)", async () => {
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    expect(q('[data-support-ticket-who="MEMBER"]')).not.toBeNull();
    act(() => {
      deliverMod.deliverSupportOpen({ context: ownerCtx(), source: "fab" });
    });
    await flush();
    expect(q('[data-support-ticket-who="OWNER"]')).not.toBeNull();
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "매장 글");
    click(q('[data-support-modal-close="1"]'));
    expect(readSupportTicketDraft(supportTicketDraftKey(ownerCtx()))?.body).toBe("매장 글");
  });
});

/* ───────────── 요청 id · 시간 제한 · 401 ───────────── */

function captureLongTimers() {
  const realSetTimeout = window.setTimeout.bind(window);
  const limits: { ms: number; fire: () => void }[] = [];
  const spy = vi.spyOn(window, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (typeof ms === "number" && ms >= 10_000) {
      limits.push({ ms, fire: fn });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(fn, ms, ...rest);
  }) as typeof window.setTimeout);
  return { limits, restore: () => spy.mockRestore() };
}

describe("요청 id = 보낸 본문에 묶음 · 시간 제한 20초/15초 · 401 한 규칙 (C-7·C-19)", () => {
  it("C-7: 접수 20초 끊김 → 「연결 오류」 → 다시 누르면 같은 requestId(서버 replay → 같은 글 2번 없음)", async () => {
    const timers = captureLongTimers();
    try {
      const { ctx } = await composeAndSubmit("끊길 글");
      timers.limits.find((l) => l.ms === 20_000)?.fire();
      await flush(3);
      expect(q('[role="alert"]')?.textContent).toBe("common_network_error");
      const first = calls.filter((c) => c.url.startsWith("/api/support/cases/open"));
      expect(first).toHaveLength(1);
      expect(typeof first[0]!.body?.requestId).toBe("string");
      // 초안에도 그 id 가 남는다(새로고침 뒤 이어 써도 같은 id)
      expect(JSON.parse(window.sessionStorage.getItem(supportTicketDraftKey(ctx)) ?? "{}").requestId).toBe(
        first[0]!.body?.requestId
      );
      click(q('[data-support-ticket-submit="1"]'));
      await flush(2);
      const all = calls.filter((c) => c.url.startsWith("/api/support/cases/open"));
      expect(all).toHaveLength(2);
      expect(all[1]!.body?.requestId).toBe(all[0]!.body?.requestId);
    } finally {
      timers.restore();
    }
  });

  it("C-7: 본문을 바꿔 다시 보내면 새 requestId", async () => {
    const timers = captureLongTimers();
    try {
      await composeAndSubmit("처음 글");
      timers.limits.find((l) => l.ms === 20_000)?.fire();
      await flush(3);
      typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "고친 글");
      click(q('[data-support-ticket-submit="1"]'));
      await flush(2);
      const all = calls.filter((c) => c.url.startsWith("/api/support/cases/open"));
      expect(all).toHaveLength(2);
      expect(typeof all[1]!.body?.requestId).toBe("string");
      expect(all[1]!.body?.requestId).not.toBe(all[0]!.body?.requestId);
    } finally {
      timers.restore();
    }
  });

  it("C-7(추가 문의): 끊긴 뒤 같은 글 다시 보내기 = 같은 requestId", async () => {
    const timers = captureLongTimers();
    try {
      route = (url, init) => {
        if (url.startsWith("/api/support/cases/c1")) {
          const body = init?.body ? JSON.parse(String(init.body)) : null;
          if (body?.body)
            return new Promise((_, reject) =>
              init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
            );
          if (init?.method === "POST") return { ok: true };
          return { ok: true, case: caseRow(), messages: [answerMsg()] };
        }
        return { ok: false };
      };
      await act(async () => root.render(<SupportModalHost />));
      act(() => {
        openSupportModal({ caseId: "c1" });
      });
      await flush();
      click(q('[data-support-ticket-followup-open="1"]'));
      typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "하나 더");
      click(q('[data-support-ticket-followup-send="1"]'));
      await flush(2);
      timers.limits.find((l) => l.ms === 20_000)?.fire();
      await flush(3);
      expect(q('[role="alert"]')?.textContent).toBe("common_network_error");
      click(q('[data-support-ticket-followup-send="1"]'));
      await flush(2);
      const sends = calls.filter((c) => c.method === "POST" && c.body?.body === "하나 더");
      expect(sends).toHaveLength(2);
      expect(typeof sends[0]!.body?.requestId).toBe("string");
      expect(sends[1]!.body?.requestId).toBe(sends[0]!.body?.requestId);
    } finally {
      timers.restore();
    }
  });

  it("읽기 15초: 상세 응답이 없으면 끊고 「연결 오류」 + 다시 시도", async () => {
    const timers = captureLongTimers();
    try {
      route = (url, init) => {
        if (url.startsWith("/api/support/cases/c1")) {
          return new Promise((_, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
          );
        }
        return { ok: false };
      };
      await act(async () => root.render(<SupportModalHost />));
      act(() => {
        openSupportModal({ caseId: "c1" });
      });
      await flush(2);
      const read = timers.limits.find((l) => l.ms === 15_000);
      expect(read).toBeDefined();
      read!.fire();
      await flush(3);
      expect(q('[data-support-ticket-detail-retry="1"]')).not.toBeNull();
    } finally {
      timers.restore();
    }
  });

  it("C-19: 추가 문의 401 → 세션 살리기 1번 뒤 다시 보냄 → 또 401 = 로그인 화면(접수·상세와 같은 규칙)", async () => {
    route = (url, init) => {
      if (url.startsWith("/api/support/cases/c1")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        if (body?.body) return new Response("{}", { status: 401 });
        if (init?.method === "POST") return { ok: true };
        return { ok: true, case: caseRow(), messages: [answerMsg()] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-followup-open="1"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "세션 만료 뒤 글");
    click(q('[data-support-ticket-followup-send="1"]'));
    await flush(6);
    expect(session.ensure).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.body?.body === "세션 만료 뒤 글")).toHaveLength(2);
    expect(q('[data-support-ticket-view="login"]')).not.toBeNull();
  });

  it("C-19: 접수 401 도 세션 살리기 1번 뒤 다시 보낸다(바로 로그인 화면 아님)", async () => {
    let n = 0;
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [] };
      if (url.startsWith("/api/support/cases/open")) {
        n += 1;
        return n === 1 ? new Response("{}", { status: 401 }) : { ok: true, case: { id: "c-new", public_case_no: "SC-9" }, created: true };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    click(q('[data-testid="support-ticket-field-category"]'));
    click(q('[data-testid^="support-ticket-cat-"]'));
    click(q('[data-testid^="support-ticket-issue-"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "만료 직후 접수");
    click(q('[data-support-ticket-submit="1"]'));
    await flush(6);
    expect(session.ensure).toHaveBeenCalledTimes(1);
    expect(q('[data-support-ticket-view="submitted"]')).not.toBeNull();
  });
});

/* ───────────── 추가 문의 보내는 중 ───────────── */

describe("추가 문의 보내는 중 (C-8·C-15·C-16)", () => {
  async function openFromComposeAndSend() {
    const { h, make } = holdable();
    route = (url, init) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [caseRow()] };
      if (url.startsWith("/api/support/cases/c1")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        if (body?.body) return make(init);
        if (init?.method === "POST") return { ok: true };
        return { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "쓰던 글");
    click(q('[data-support-ticket-active-row="c1"]'));
    await flush();
    click(q('[data-support-ticket-followup-open="1"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "보낼 글");
    click(q('[data-support-ticket-followup-send="1"]'));
    await flush(2);
    return h;
  }

  it("C-15·C-16: 보내는 중 입력칸 잠금 · 「취소」 비활성 · ‹·✕ 비활성", async () => {
    const h = await openFromComposeAndSend();
    expect(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!.readOnly).toBe(true);
    expect(isDisabled('[data-support-ticket-followup-cancel="1"]')).toBe(true);
    expect(isDisabled('[data-support-ticket-view="detail"] [data-support-ticket-back="1"]')).toBe(true);
    expect(isDisabled('[data-support-ticket-view="detail"] [data-support-modal-close="1"]')).toBe(true);
    await act(async () => h.release({ ok: true }));
    await flush(3);
  });

  it("C-8: 보내는 중 ◁ = ‹ 와 같은 경로(보관) — 입력칸은 결과까지 그대로 · 성공 뒤 ◁ 실행 = 쓰기 화면", async () => {
    const h = await openFromComposeAndSend();
    deviceBack();
    await flush();
    expect(q('[data-support-ticket-followup="1"]')).not.toBeNull();
    await act(async () => h.release({ ok: true }));
    await flush(4);
    expect(visibleView()?.getAttribute("data-support-ticket-view")).toBe("form");
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("쓰던 글");
  });
});

/* ───────────── R7 기록 항목·경로 ───────────── */

describe("R7 경로 변화·진입 주소 (C-20·C-21)", () => {
  it("C-20: 창 아래에서 경로가 바뀌면 창을 닫는다(기록 항목은 그 이동이 소비)", async () => {
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    const back = vi.spyOn(window.history, "back");
    nav.pathname = "/chats/room-9";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
    // 새 화면을 되돌리지 않는다
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("C-21: /support/cases/X — 주소를 먼저 정리하고, 정리된 주소에서 창을 연다(◁ 반복 없음)", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases/cX") ? { ok: true, case: caseRow({ id: "cX" }), messages: [answerMsg()] } : { ok: false };
    nav.pathname = "/support/cases/cX";
    window.history.replaceState(null, "", "/support/cases/cX");
    let openWhenReplaced: string | null = null;
    nav.replace.mockImplementation(() => {
      openWhenReplaced = getSupportModalState().phase;
    });
    const page = document.createElement("div");
    document.body.appendChild(page);
    const pageRoot = createRoot(page);
    await act(async () => root.render(<SupportModalHost />));
    await act(async () => pageRoot.render(<SupportCaseBootstrapClient caseId="cX" />));
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/");
    // 고치기 전: 창을 먼저 열고(기록 항목이 진입 주소 위) 주소를 바꿔 ◁ 가 진입 주소로 돌아가 다시 열렸다
    expect(openWhenReplaced).toBe("closed");
    act(() => pageRoot.unmount());
    page.remove();
    nav.pathname = "/";
    window.history.replaceState(null, "", "/");
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBe("cX");
    nav.replace.mockReset();
  });
});

/* ───────────── 목록·요금표 (C-18·B-1·B-2) ───────────── */

describe("진행 중 목록 · 요금표 (C-18·B-1·B-2)", () => {
  it("B-1: 진행 중 목록은 5개만 요청(limit=5)", async () => {
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    const list = calls.find((c) => c.url.startsWith("/api/support/cases?"));
    expect(list).toBeDefined();
    expect(new URL(list!.url, "https://x").searchParams.get("limit")).toBe("5");
  });

  it("C-18: 회원 → 매장 전환 = 이전 대상 행을 바로 비움 · 실패면 안내 + 다시 시도", async () => {
    ownerLite.snap = { ownerStores: [{ id: "s1", store_name: "Shop", approval_status: "approved" }] };
    let release: (v: unknown) => void = () => undefined;
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) {
        const sp = new URL(url, "https://x").searchParams;
        if (sp.get("audience") === "OWNER") return new Promise((r) => (release = r));
        return { ok: true, cases: [caseRow({ id: "member-row" })] };
      }
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: memberCtx() });
    });
    await flush();
    expect(q('[data-support-ticket-active-row="member-row"]')).not.toBeNull();
    click(q('[data-support-ticket-switch="OWNER"]'));
    await flush();
    expect(q('[data-support-ticket-active-row="member-row"]')).toBeNull();
    await act(async () => release({ ok: false }));
    await flush();
    expect(q('[data-support-ticket-active-error="1"]')).not.toBeNull();
  });

  it("B-2: 요금표는 창이 열린 동안 1번만 받는다", async () => {
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [] };
      if (url.startsWith("/api/ads/pricing-guide")) return { ok: false };
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({
        context: { ...memberCtx(), category: "AD" as SupportContext["category"], needsCategorySelection: false },
      });
    });
    await flush();
    const pricingRow = q('[data-testid="support-ticket-ad-pricing"]');
    if (!pricingRow) {
      // 회원 광고 분야를 고른다
      click(q('[data-testid="support-ticket-field-category"]'));
      click(q('[data-testid="support-ticket-cat-AD"]'));
      deviceBack();
      await flush();
    }
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [] };
      if (url.startsWith("/api/ads/pricing-guide")) return { ok: true, guide: { member: [], store: [] } };
      return { ok: false };
    };
    click(q('[data-testid="support-ticket-ad-pricing"]'));
    await flush();
    deviceBack();
    await flush();
    click(q('[data-testid="support-ticket-ad-pricing"]'));
    await flush();
    expect(calls.filter((c) => c.url.startsWith("/api/ads/pricing-guide"))).toHaveLength(1);
  });
});

/* ───────────── §1 계획 미완 3건 ───────────── */

describe("계획 대비 미완 (초안 · 종료+안 읽음 · FAB 갈색)", () => {
  it("빈 내용으로 옛 초안을 지우지 않는다(카드 → 한 글자 → 모두 지움 → 닫기 = 초안 남음)", async () => {
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    const ctx = memberCtx();
    writeSupportTicketDraft(supportTicketDraftKey(ctx), setSupportTicketBody(initSupportTicketForm(ctx), "옛 초안"));
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ context: ctx });
    });
    await flush();
    expect(q('[data-support-ticket-draft="1"]')).not.toBeNull();
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "x");
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "");
    await new Promise((r) => setTimeout(r, 350));
    click(q('[data-support-modal-close="1"]'));
    await flush();
    expect(readSupportTicketDraft(supportTicketDraftKey(ctx))).not.toBeNull();
  });

  it("종료+안 읽은 답변: ✕ 로 닫아도 기억을 지운다 → 옛 푸시로 다시 열면 「종료된 문의예요」", async () => {
    let served = false;
    route = (url, init) => {
      if (!url.startsWith("/api/support/cases/cB")) return { ok: false };
      if (init?.method === "POST") {
        served = true; // seen = 서버가 그 내용을 읽음 처리
        return { ok: true };
      }
      return {
        ok: true,
        closed: true,
        case: caseRow({ id: "cB", status: "RESOLVED", requester_unread_count: served ? 0 : 1 }),
        messages: served ? [] : [{ ...answerMsg(), body: "OLD ANSWER" }],
      };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "cB" });
    });
    await flush();
    expect(document.body.textContent).toContain("OLD ANSWER");
    served = true; // (기준 트리: GET 이 읽음 처리)
    click(q('[data-support-modal-close="1"]'));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
    act(() => {
      openSupportModal({ caseId: "cB" });
    });
    await flush();
    expect(q('[data-support-ticket-closed="1"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("OLD ANSWER");
  });

  it("FAB 갈색 = support-owner-cta.ts 의 값(FAB 도 같은 정의)", async () => {
    route = () => ({ ok: true, unread: 0 });
    const fabClass = (ownerCta as Record<string, unknown>).OWNER_SUPPORT_FAB_CLASS;
    expect(typeof fabClass).toBe("string");
    await act(async () => root.render(<SupportFab context={ownerCtx()} />));
    expect(q('[data-support-fab="1"]')!.className).toContain(fabClass as string);
  });
});

/* ───────────── 숫자 신호 (A-3·A-11) ───────────── */

describe("고객 숫자 신호 — 알림 행 INSERT·UPDATE 둘 다 (A-3·A-11)", () => {
  it("A-3: 알림 행 UPDATE(답변 삭제로 읽음 처리 등) → 고객센터 숫자 다시 읽기 신호", async () => {
    const got = vi.fn();
    window.addEventListener(SUPPORT_NOTIFICATION_ARRIVED_EVENT, got);
    await act(async () => root.render(<NotificationsBadgeRealtimeBridge enabled={false} />));
    expect(realtime.onChange).not.toBeNull();
    act(() => realtime.onChange!({ eventType: "UPDATE", row: { type: "support_admin_replied" } }));
    expect(got).toHaveBeenCalledTimes(1);
    // 고객센터와 상관없는 알림 읽음은 고객센터 숫자를 다시 읽지 않는다(요청 늘리지 않음)
    act(() => realtime.onChange!({ eventType: "UPDATE", row: { type: "trade_chat_message" } }));
    act(() => realtime.onChange!({ eventType: "UPDATE" }));
    expect(got).toHaveBeenCalledTimes(1);
    window.removeEventListener(SUPPORT_NOTIFICATION_ARRIVED_EVENT, got);
  });

  it("A-11: 「내 문의」 목록이 고객지원 알림 신호에 다시 읽는다(상태 알약 맞춤)", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases?") ? { ok: true, cases: [caseRow()], nextCursor: null } : { ok: false };
    await act(async () => root.render(<SupportCasesHistoryList audience="MEMBER" />));
    await flush();
    const lists = () => calls.filter((c) => c.url.startsWith("/api/support/cases?")).length;
    const before = lists();
    expect(before).toBeGreaterThan(0);
    act(() => {
      window.dispatchEvent(new Event(SUPPORT_NOTIFICATION_ARRIVED_EVENT));
    });
    await new Promise((r) => setTimeout(r, 600));
    await flush();
    expect(lists()).toBeGreaterThan(before);
  });
});

/* ───────────── 재감사 (HEAD e249d41d3) 결함 1~4 ───────────── */

describe("재감사 1 — 비로그인 「로그인」 뒤 같은 창", () => {
  it("FAB → 로그인 안내 → 「로그인」 = 맥락 저장 → 로그인하고 돌아오면 같은 쓰기 창", async () => {
    authUser.id = null;
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    const ctx = ownerCtx();
    act(() => {
      navigateToSupportCenter(ctx);
    });
    await flush();
    expect(q('[data-support-ticket-view="login"]')).not.toBeNull();
    click(q('[data-support-ticket-login="1"]'));
    await flush();
    const saved = JSON.parse(window.sessionStorage.getItem(SUPPORT_CONTEXT_SESSION_KEY) ?? "null");
    // 고치기 전(HEAD): 로그인 화면이 stack 을 통째로 바꿔 맥락이 null → 아무것도 저장하지 않았다
    expect(saved?.audience).toBe("OWNER");
    expect(saved?.storeId).toBe("s1");
    const target = [...nav.replace.mock.calls, ...nav.push.mock.calls].map((c) => String(c[0]));
    expect(target.some((h) => h.startsWith("/login?next="))).toBe(true);
    expect(getSupportModalState().phase).toBe("closed");

    // 로그인 화면 → 로그인 완료 → 원래 화면(같은 앱 셸 — 호스트는 다시 마운트되지 않는다)
    nav.pathname = "/login";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
    authUser.id = "u1";
    nav.pathname = "/mypage/customer-center";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-who="OWNER"]')).not.toBeNull();
    expect(getSupportModalState().context?.storeId).toBe("s1");
  });
});

/** 기준·고치기 전 트리의 푸시 고객센터 갈래(PushRouteListener 옛 코드) — 새 트리는 `deliverSupportPushOpen` 하나 */
function pushSupportOpen(caseId: string) {
  const helper = (deliverMod as {
    deliverSupportPushOpen?: (i: { caseId: string; source: "push" }, r: { replace: (h: string) => void }) => unknown;
  }).deliverSupportPushOpen;
  if (helper) {
    helper({ caseId, source: "push" }, { replace: nav.replace });
    return;
  }
  deliverMod.deliverSupportOpen({ caseId, source: "push" });
  if (window.location.pathname.startsWith("/support/")) nav.replace("/");
}

describe("재감사 2 — 고객센터 흐름 자신의 주소 정리는 「경로 바뀜」이 아님", () => {
  const detailRoute: Route = (url, init) => {
    const m = /\/api\/support\/cases\/(c[XY])/.exec(url);
    if (!m) return url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false };
    if (init?.method === "POST") return { ok: true };
    return { ok: true, case: caseRow({ id: m[1] }), messages: [answerMsg({ id: `${m[1]}-a` })] };
  };

  it("A: /support/cases/X 위에서 푸시(Y) → 주소 정리(replace \"/\") 뒤에도 창 유지 · Y 상세", async () => {
    route = detailRoute;
    nav.pathname = "/support/cases/cX";
    window.history.replaceState(null, "", "/support/cases/cX");
    await act(async () => root.render(<SupportModalHost />));
    act(() => pushSupportOpen("cY"));
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/");
    nav.pathname = "/";
    window.history.replaceState(null, "", "/");
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBe("cY");
  });

  it("B: 복원(새로고침) + /support/cases/X 진입 화면의 replace → 창이 닫히지 않음", async () => {
    route = detailRoute;
    window.sessionStorage.setItem("dibay_support_modal_restore_case_id", "cX");
    nav.pathname = "/support/cases/cX";
    window.history.replaceState(null, "", "/support/cases/cX");
    const page = document.createElement("div");
    document.body.appendChild(page);
    const pageRoot = createRoot(page);
    await act(async () => root.render(<SupportModalHost />));
    await act(async () => pageRoot.render(<SupportCaseBootstrapClient caseId="cX" />));
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/");
    act(() => pageRoot.unmount());
    page.remove();
    nav.pathname = "/";
    window.history.replaceState(null, "", "/");
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBe("cX");
  });

  it("B: 새로고침 뒤 /support/enter(저장 맥락) — 진입 화면이 맥락을 읽고 주소를 정리한 뒤 그 맥락의 창(닫히지 않음)", async () => {
    route = detailRoute;
    window.sessionStorage.setItem(SUPPORT_CONTEXT_SESSION_KEY, JSON.stringify(ownerCtx()));
    nav.pathname = "/support/enter";
    window.history.replaceState(null, "", "/support/enter");
    const page = document.createElement("div");
    document.body.appendChild(page);
    const pageRoot = createRoot(page);
    await act(async () => root.render(<SupportModalHost />));
    await act(async () => pageRoot.render(<SupportCenterEnterClient />));
    await flush();
    // 고치기 전: 호스트가 먼저 저장 맥락을 꺼내 진입 화면은 「맥락 없음」 오류 · 주소 정리 없음
    expect(page.querySelector("[data-support-enter-error]")).toBeNull();
    expect(nav.replace).toHaveBeenCalledWith("/");
    act(() => pageRoot.unmount());
    page.remove();
    nav.pathname = "/";
    window.history.replaceState(null, "", "/");
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-who="OWNER"]')).not.toBeNull();
  });

  it("(대조) 고객센터 흐름이 아닌 이동은 여전히 창을 닫는다", async () => {
    route = detailRoute;
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "cX" });
    });
    await flush();
    nav.pathname = "/chats";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
  });
});

describe("재감사 3 — 요청 id = 본문·분야·세부·대상·매장 묶음 · replay 는 서버 문의를 보임", () => {
  it("끊긴 뒤 같은 글로 분야·세부만 바꿔 다시 보내면 새 requestId", async () => {
    const timers = captureLongTimers();
    try {
      await composeAndSubmit("같은 글");
      timers.limits.find((l) => l.ms === 20_000)?.fire();
      await flush(3);
      const cats = Array.from(container.querySelectorAll('[data-testid^="support-ticket-cat-"]'));
      void cats;
      click(q('[data-testid="support-ticket-field-category"]'));
      const all = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="support-ticket-cat-"]'));
      expect(all.length).toBeGreaterThan(1);
      click(all[1]!);
      click(q('[data-testid^="support-ticket-issue-"]'));
      await flush();
      click(q('[data-support-ticket-submit="1"]'));
      await flush(2);
      const opens = calls.filter((c) => c.url.startsWith("/api/support/cases/open"));
      expect(opens).toHaveLength(2);
      expect(typeof opens[1]!.body?.requestId).toBe("string");
      expect(opens[1]!.body?.requestId).not.toBe(opens[0]!.body?.requestId);
    } finally {
      timers.restore();
    }
  });

  it("replay 응답(created=true)이면 접수 완료 카드 = 서버 문의의 분야(화면 상태 아님)", async () => {
    const { holder } = await composeAndSubmit("다시 보낸 글");
    const sentCategory = String(
      (calls.find((c) => c.url.startsWith("/api/support/cases/open"))!.body?.context as { category?: string })?.category
    );
    const serverCategory = sentCategory === "ACCOUNT" ? "TECHNICAL" : "ACCOUNT";
    const serverLabel = getSupportCategoryDefinition(serverCategory)?.labelKey;
    const sentLabel = getSupportCategoryDefinition(sentCategory)?.labelKey;
    expect(serverLabel).toBeTruthy();
    await act(async () =>
      holder.release({
        ok: true,
        created: true,
        replayed: true,
        case: {
          id: "c-first",
          public_case_no: "SC-FIRST",
          category: serverCategory,
          issue_type: null,
          created_at: "2026-11-28T00:00:00Z",
        },
      })
    );
    await flush(3);
    const card = q('[data-support-ticket-view="submitted"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(String(serverLabel));
    expect(card!.textContent).not.toContain(String(sentLabel));
  });
});

/** 헤더는 왔는데 본문이 끝나지 않는 응답 */
const hangingBody = () => new Response(new ReadableStream({ start() {} }), { status: 200 });

describe("재감사 4 — 마감 = 작업 전체(본문 읽기·401 세션 살리기 포함)", () => {
  it("접수: 헤더 뒤 본문이 안 오면 20초에 「연결 오류」 · 창 다시 사용", async () => {
    const timers = captureLongTimers();
    try {
      route = (url) => {
        if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [] };
        if (url.startsWith("/api/support/cases/open")) return hangingBody();
        return { ok: false };
      };
      await act(async () => root.render(<SupportModalHost />));
      act(() => {
        openSupportModal({ context: memberCtx() });
      });
      await flush();
      click(q('[data-testid="support-ticket-field-category"]'));
      click(q('[data-testid^="support-ticket-cat-"]'));
      click(q('[data-testid^="support-ticket-issue-"]'));
      typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "본문이 멈춘 글");
      click(q('[data-support-ticket-submit="1"]'));
      await flush(3);
      for (const l of timers.limits.filter((x) => x.ms === 20_000)) l.fire();
      await flush(4);
      expect(q('[role="alert"]')?.textContent).toBe("common_network_error");
      expect(q<HTMLButtonElement>('[data-support-modal-close="1"]')!.disabled).toBe(false);
    } finally {
      timers.restore();
    }
  });

  it("추가 문의: 401 뒤 세션 살리기가 멈춰도 20초에 「연결 오류」 · busy 풀림", async () => {
    const timers = captureLongTimers();
    try {
      session.ensure.mockImplementation(() => new Promise(() => undefined));
      route = (url, init) => {
        if (url.startsWith("/api/support/cases/c1")) {
          const body = init?.body ? JSON.parse(String(init.body)) : null;
          if (body?.body) return new Response("{}", { status: 401 });
          if (init?.method === "POST") return { ok: true };
          return { ok: true, case: caseRow(), messages: [answerMsg()] };
        }
        return { ok: false };
      };
      await act(async () => root.render(<SupportModalHost />));
      act(() => {
        openSupportModal({ caseId: "c1" });
      });
      await flush();
      click(q('[data-support-ticket-followup-open="1"]'));
      typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "세션이 멈춘 글");
      click(q('[data-support-ticket-followup-send="1"]'));
      await flush(3);
      for (const l of timers.limits.filter((x) => x.ms === 20_000)) l.fire();
      await flush(4);
      expect(q('[role="alert"]')?.textContent).toBe("common_network_error");
      expect(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!.readOnly).toBe(false);
    } finally {
      timers.restore();
    }
  });

  it("상세 읽기: 헤더 뒤 본문이 안 오면 15초에 끊고 다시 시도", async () => {
    const timers = captureLongTimers();
    try {
      route = (url) => (url.startsWith("/api/support/cases/c1") ? hangingBody() : { ok: false });
      await act(async () => root.render(<SupportModalHost />));
      act(() => {
        openSupportModal({ caseId: "c1" });
      });
      await flush(3);
      for (const l of timers.limits.filter((x) => x.ms === 15_000)) l.fire();
      await flush(4);
      expect(q('[data-support-ticket-detail-retry="1"]')).not.toBeNull();
    } finally {
      timers.restore();
    }
  });
});

/* ───────────── 2차 재감사 (HEAD 4f11bba68) — 로그인 뒤 같은 창 표시 = 그 로그인 시도 1번 ───────────── */

describe("2차 재감사 — 로그인 뒤 같은 창 표시는 그 로그인 시도 1번", () => {
  /** 비로그인 FAB → 로그인 안내 → 「로그인」 (표시·맥락 저장) */
  async function startLoginFromFab() {
    authUser.id = null;
    session.phase = "terminal_guest";
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      navigateToSupportCenter(ownerCtx());
    });
    await flush();
    click(q('[data-support-ticket-login="1"]'));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
    nav.pathname = "/login";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
  }
  const signalAuthChanged = () =>
    act(() => {
      window.dispatchEvent(new Event("kasama-test-auth-changed"));
      for (const l of session.listeners) l(session.phase);
    });

  it("전체 새로고침 복귀: 마운트 뒤 로그인 신호로 사용자가 채워지면 그때 1번 연다", async () => {
    await startLoginFromFab();
    // OAuth·네이티브 로그인 = 문서 새로 열기 — 호스트가 새로 마운트, 프로필은 아직 없음(세션 확인 중)
    act(() => root.unmount());
    root = createRoot(container);
    await resetModal();
    nav.pathname = "/mypage/customer-center";
    window.history.replaceState(null, "", "/mypage/customer-center");
    session.phase = "loading";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
    // 프로필 캐시가 채워지고 로그인 신호
    authUser.id = "u1";
    session.phase = "authenticated";
    signalAuthChanged();
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().context?.storeId).toBe("s1");
    // 1번만 — 닫고 신호·이동이 또 와도 다시 열지 않는다
    act(() => closeSupportModal());
    await flush();
    signalAuthChanged();
    nav.pathname = "/market";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
  });

  it("로그인을 그만둠: 비로그인 채 일반 화면으로 돌아오면 표시를 버림 → 나중 로그인·이동에 창이 뜨지 않음", async () => {
    await startLoginFromFab();
    expect(window.sessionStorage.getItem("dibay_support_login_return")).not.toBeNull();
    // ◁ 로 로그인 화면을 떠나 원래 화면(여전히 비로그인)
    nav.pathname = "/mypage/customer-center";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(window.sessionStorage.getItem("dibay_support_login_return")).toBeNull();
    // 한참 뒤 다른 경로(로그인 창 등)로 로그인 → 다른 화면으로 이동
    authUser.id = "u1";
    session.phase = "authenticated";
    signalAuthChanged();
    nav.pathname = "/market";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
  });

  it("3차 재감사: 표시 기한(30분)이 지나면 맥락도 함께 지운다 → 그 뒤 새로고침에 쓰기 창이 저절로 열리지 않음", async () => {
    await startLoginFromFab();
    expect(window.sessionStorage.getItem("dibay:support:center:pending-context")).not.toBeNull();
    const raw = JSON.parse(window.sessionStorage.getItem("dibay_support_login_return")!);
    window.sessionStorage.setItem("dibay_support_login_return", JSON.stringify({ ...raw, at: Date.now() - 31 * 60 * 1000 }));
    // 로그인 화면에서 오래 있다가 로그인(로그인 화면 위 신호)
    authUser.id = "u1";
    session.phase = "authenticated";
    signalAuthChanged();
    await flush();
    expect(window.sessionStorage.getItem("dibay_support_login_return")).toBeNull();
    expect(window.sessionStorage.getItem("dibay:support:center:pending-context")).toBeNull();
    // 같은 탭 새로고침 = 호스트 새로 마운트
    act(() => root.unmount());
    root = createRoot(container);
    await resetModal();
    nav.pathname = "/mypage/customer-center";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
  });

  it("3차 재감사: 로그인 확인 때 창이 이미 열려 있으면 표시와 맥락을 함께 버린다", async () => {
    await startLoginFromFab();
    authUser.id = "u1";
    session.phase = "authenticated";
    route = (url) =>
      url.startsWith("/api/support/cases/c1") ? { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] } : { ok: false };
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    nav.pathname = "/mypage/customer-center";
    await act(async () => root.render(<SupportModalHost />));
    await flush();
    expect(window.sessionStorage.getItem("dibay_support_login_return")).toBeNull();
    expect(window.sessionStorage.getItem("dibay:support:center:pending-context")).toBeNull();
  });
});
