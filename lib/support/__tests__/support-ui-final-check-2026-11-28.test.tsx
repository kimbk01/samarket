// @vitest-environment jsdom
/**
 * 운영 반영 뒤 최종 점검 화면 수정 (docs/audit/customer-support-inquiry-final-2026-11-28/final-audit-2.md §2 ·
 * 시안 ui-mockup.html 6절) 회귀 잠금 — M1·M2·M3·M4 · U1~U9·U13·U14 (고객 화면).
 * 동작 시험 = 실제 컴포넌트를 jsdom 에 그려 누르고 확인. 문자열 확인은 「(구조 확인)」.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/mypage/customer-center",
  useSearchParams: () => searchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: unknown; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  ),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/support/SupportSheetShell", () => ({
  SupportSheetShell: ({ open, children }: { open: boolean; children: unknown }) =>
    open ? <div data-test-sheet="1">{children as never}</div> : null,
}));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "u1", nickname: "Kim" }),
  getCurrentUserIdForDb: async () => "u1",
}));
vi.mock("@/components/business/owner/OwnerCareAdminNotesList", () => ({ OwnerCareAdminNotesList: () => null }));
vi.mock("@/components/support/SupportContextProvider", () => ({
  SupportContextProvider: ({ children }: { children: unknown }) => children as never,
}));

let searchParams = new URLSearchParams();

import { MESSAGES } from "@/lib/i18n/messages";
import { SupportModalHost } from "@/components/support/SupportModalHost";
import { OwnerCustomerCenterView } from "@/components/business/owner/OwnerCustomerCenterView";
import {
  closeSupportModal,
  getSupportModalState,
  openSupportModal,
} from "@/lib/support/support-modal-controller";
import { buildGenericSupportTriageContext } from "@/lib/support/support-context";
import { readSupportTicketDraft, supportTicketDraftKey } from "@/lib/support/support-ticket-form";
import { supportPrimaryCtaToneClass } from "@/lib/support/support-owner-cta";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ko = MESSAGES.ko as Record<string, string>;
const en = MESSAGES.en as Record<string, string>;
const BROWN = "!bg-[var(--dibay-brown)]";

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
const fetchCalls: { url: string; method: string }[] = [];
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const url = String(input);
  fetchCalls.push({ url, method: init?.method ?? "GET" });
  const body = await route(url, init);
  if (body instanceof Response) return body;
  return new Response(JSON.stringify(body ?? { ok: false }), { status: 200 });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetchMock);
  fetchCalls.length = 0;
  fetchMock.mockClear();
  searchParams = new URLSearchParams();
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => closeSupportModal());
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

/** 기기 ◁ — 브라우저가 창의 기록 항목을 꺼낸 것과 같은 popstate */
function deviceBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
}

const memberCtx = () => buildGenericSupportTriageContext({ audience: "MEMBER", sourceSurface: "mypage_customer_center" });
const ownerCtx = () =>
  buildGenericSupportTriageContext({ audience: "OWNER", sourceSurface: "owner_customer_center", storeId: "s1" });

function openCompose(ctx = memberCtx()) {
  act(() => {
    openSupportModal({ context: ctx });
  });
}

/** 쓰기 → 진행 중 c1 → 상세. 상세 응답은 `detail` */
async function openDetailFromCompose(detail: () => unknown) {
  route = (url, init) => {
    if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [caseRow()] };
    if (url.startsWith("/api/support/cases/c1")) {
      if (init?.method === "POST") return { ok: true };
      return detail();
    }
    return { ok: false };
  };
  await act(async () => root.render(<SupportModalHost />));
  openCompose();
  await flush();
  typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "쓰던 글");
  click(q('[data-support-ticket-active-row="c1"]'));
  await flush();
  expect(q('[data-support-ticket-view="detail"]')).not.toBeNull();
}

/* ───────────── M1 기기 ◁ = 한 단계 뒤로 ───────────── */

describe("M1 기기 ◁ = 화면 ‹ 와 같이 한 단계 뒤로 (동작)", () => {
  it("분야 선택에서 ◁ → 쓰기 화면(창 열림) · 쓰기 화면에서 ◁ → 닫기", async () => {
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    openCompose();
    await flush();
    click(q('[data-testid="support-ticket-field-category"]'));
    expect(q('[data-support-ticket-view="pick_category"]')).not.toBeNull();

    deviceBack();
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-view="form"]')).not.toBeNull();
    // 창이 가진 기록 항목을 다시 넣었다(다음 ◁ 도 이 창이 받는다)
    expect(window.history.state?.dibaySupportModal).toBe(true);

    deviceBack();
    expect(getSupportModalState().phase).toBe("closed");
  });

  it("진행 중 문의 상세에서 ◁ → 쓰기 화면, 입력 그대로", async () => {
    await openDetailFromCompose(() => ({ ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] }));
    deviceBack();
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-view="detail"]')).toBeNull();
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("쓰던 글");
  });

  it("추가 문의 입력 중 ◁ → 입력 칸만 닫힘 · 글은 남고 문의별로 저장 · 다시 열면 그대로", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases/c1")
        ? { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-followup-open="1"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "하나 더 궁금해요");

    deviceBack();
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-view="detail"]')).not.toBeNull();
    expect(q('[data-support-ticket-followup="1"]')).toBeNull();
    expect(window.sessionStorage.getItem("dibaySupportFollowUpDraft:c1")).toBe("하나 더 궁금해요");

    click(q('[data-support-ticket-followup-open="1"]'));
    expect(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!.value).toBe("하나 더 궁금해요");

    // 직접 연 상세의 첫 단계 = ◁ 닫기 → 다시 열어도 글이 남아 있다
    deviceBack();
    deviceBack();
    expect(getSupportModalState().phase).toBe("closed");
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-followup-open="1"]'));
    expect(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!.value).toBe("하나 더 궁금해요");
  });

  it("보내면 저장본 지움", async () => {
    route = (url, init) =>
      url.startsWith("/api/support/cases/c1")
        ? init?.method === "POST"
          ? { ok: true }
          : { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-followup-open="1"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "보낼 글");
    click(q('[data-support-ticket-followup-send="1"]'));
    await flush();
    expect(window.sessionStorage.getItem("dibaySupportFollowUpDraft:c1")).toBeNull();
  });
});

/* ───────────── M2 진행 중에서 연 상세 끝 = 쓰기 화면으로 ───────────── */

describe("M2 진행 중 상세의 「확인했어요」·「확인」 → 쓰기 화면 (동작)", () => {
  it("확인했어요 성공 → 창 유지 · 쓰기 화면 · 입력 그대로", async () => {
    await openDetailFromCompose(() => ({ ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] }));
    click(q('[data-support-ticket-confirm="1"]'));
    await flush();
    expect(fetchCalls.some((c) => c.url.startsWith("/api/support/cases/c1") && c.method === "POST")).toBe(true);
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-view="detail"]')).toBeNull();
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("쓰던 글");
  });

  it("종료+안 읽은 답변 「확인」 → 쓰기 화면", async () => {
    await openDetailFromCompose(() => ({
      ok: true,
      closed: true,
      case: caseRow({ status: "RESOLVED" }),
      messages: [answerMsg()],
    }));
    click(q('[data-support-ticket-ok="closed_unread"]'));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("쓰던 글");
  });

  it("재감사 4: 답변 대기 상세 「확인」 → 쓰기 화면 · 입력 그대로", async () => {
    await openDetailFromCompose(() => ({ ok: true, case: caseRow({ status: "WAITING_ADMIN", requester_unread_count: 0 }), messages: [questionMsg] }));
    click(q('[data-support-ticket-ok="waiting"]'));
    await flush();
    expect(getSupportModalState().phase).toBe("open");
    expect(q('[data-support-ticket-view="detail"]')).toBeNull();
    expect(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!.value).toBe("쓰던 글");
  });

  it("직접 연 상세(푸시·목록)의 확인했어요 → 닫기(그대로)", async () => {
    route = (url, init) =>
      url.startsWith("/api/support/cases/c1")
        ? init?.method === "POST"
          ? { ok: true }
          : { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-confirm="1"]'));
    await flush();
    expect(getSupportModalState().phase).toBe("closed");
  });
});

/* ───────────── M3·U1 사장님 주 버튼 갈색 ───────────── */

describe("M3·U1 사장님 주 버튼 = 갈색(전송 중 포함) · 비활성만 회색 (동작)", () => {
  it("색 판정 하나", () => {
    expect(supportPrimaryCtaToneClass(false)).toBe("");
    expect(supportPrimaryCtaToneClass(true)).toContain(BROWN);
    expect(supportPrimaryCtaToneClass(true, { disabled: true })).toBe("");
    expect(supportPrimaryCtaToneClass(true, { disabled: true, loading: true })).toContain(BROWN);
  });

  it("문의 접수: 비활성 = 갈색 아님 → 쓸 수 있음 = 갈색 → 전송 중 = 갈색 + 이름 유지", async () => {
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [] };
      if (url.startsWith("/api/support/cases/open")) return new Promise(() => undefined);
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    openCompose(ownerCtx());
    await flush();
    const submit = () => q<HTMLButtonElement>('[data-support-ticket-submit="1"]')!;
    expect(submit().disabled).toBe(true);
    expect(submit().className).not.toContain(BROWN);

    click(q('[data-testid="support-ticket-field-category"]'));
    click(q('[data-testid^="support-ticket-cat-"]'));
    click(q('[data-testid^="support-ticket-issue-"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "매장 문의 내용");
    expect(submit().disabled).toBe(false);
    expect(submit().className).toContain(BROWN);

    click(submit());
    await flush(2);
    expect(submit().getAttribute("aria-busy")).toBe("true");
    expect(submit().className).toContain(BROWN);
    // U9: 스피너만 보여도 버튼 이름이 있다
    expect(submit().getAttribute("aria-label")).toBe("support_ticket_submit");
  });

  it("사장님 상세 「확인했어요」·「보내기」 = 갈색 · 회원은 기본", async () => {
    const owner = caseRow({ audience: "OWNER", owner_store_id: "s1" });
    route = (url) => (url.startsWith("/api/support/cases/c1") ? { ok: true, case: owner, messages: [answerMsg()] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(q('[data-support-ticket-confirm="1"]')!.className).toContain(BROWN);
    click(q('[data-support-ticket-followup-open="1"]'));
    expect(q('[data-support-ticket-followup-send="1"]')!.className).not.toContain(BROWN); // 빈 글 = 비활성
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "추가");
    expect(q('[data-support-ticket-followup-send="1"]')!.className).toContain(BROWN);
  });

  it("(구조 확인) 갈색 정의는 support-owner-cta.ts 한 곳 — 문의 화면에 따로 쓴 갈색 없음 (U14)", () => {
    for (const f of [
      "components/support/SupportTicketViews.tsx",
      "components/support/SupportModalHost.tsx",
      "components/business/owner/OwnerCustomerCenterView.tsx",
    ]) {
      expect(src(f), f).not.toContain("dibay-brown");
    }
    expect(src("components/support/SupportTicketViews.tsx")).not.toContain("OWNER_TONE_BG");
  });
});

/* ───────────── M4 ───────────── */

describe("M4 광고 요청 「관리자에게 문의」 44px · 4px", () => {
  it("(구조 확인) min-h-11 · rounded-ui-rect", () => {
    const page = src("app/(main)/mypage/ads/feed-request/page.tsx");
    const m = page.match(/className="([^"]*)"\s+data-testid="feed-ad-inquiry-cta"/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("min-h-11");
    expect(m![1]).toContain("rounded-ui-rect");
  });
});

/* ───────────── U2 300ms 안 닫기 ───────────── */

describe("U2 입력 직후 닫아도 저장 (동작)", () => {
  it("300ms 전에 닫기 → 저장본 있음", async () => {
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    const ctx = memberCtx();
    openCompose(ctx);
    await flush();
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!, "급하게 쓴 글");
    // 타이머가 돌기 전에 바로 닫는다
    click(q('[data-support-modal-close="1"]'));
    expect(getSupportModalState().phase).toBe("closed");
    expect(readSupportTicketDraft(supportTicketDraftKey(ctx))?.body).toBe("급하게 쓴 글");
  });
});

/* ───────────── U3 닫는 「확인」 한 모양 · 새 문의 라벨 하나 ───────────── */

describe("U3 닫는 「확인」 = 보조 모양 · 새 문의 = 「문의하기」 (동작)", () => {
  it("대기 중 상세 「확인」·종료+안 읽음 「확인」 = secondary", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases/c1")
        ? { ok: true, case: caseRow({ status: "WAITING_ADMIN", requester_unread_count: 0 }), messages: [questionMsg] }
        : url.startsWith("/api/support/cases/c9")
          ? { ok: true, closed: true, case: caseRow({ id: "c9", status: "RESOLVED" }), messages: [answerMsg()] }
          : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(q('[data-support-ticket-ok="waiting"]')!.className).toContain("dibay-overlay-btn--secondary");
    act(() => closeSupportModal());
    act(() => {
      openSupportModal({ caseId: "c9" });
    });
    await flush();
    expect(q('[data-support-ticket-ok="closed_unread"]')!.className).toContain("dibay-overlay-btn--secondary");
  });

  it("종료 문의(내용 없음) = 「문의하기」(허브와 같은 키)", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases/c8")
        ? { ok: true, closed: true, case: caseRow({ id: "c8", status: "RESOLVED", requester_unread_count: 0 }), messages: [] }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c8" });
    });
    await flush();
    expect(q('[data-support-ticket-new="1"]')!.textContent).toBe("support_enter_cta");
    expect(ko.support_ticket_new_cta).toBeUndefined();
  });

  it("(구조 확인) 접수 완료 「확인」 = secondary", () => {
    expect(src("components/support/SupportTicketViews.tsx")).toContain(
      '<DibayOverlayButton roleTone="secondary" className={SUPPORT_BTN} onClick={onClose} data-support-ticket-ok="submitted">'
    );
  });
});

/* ───────────── U4 안내 문구 ───────────── */

describe("U4 안내 = 사장님에게도 맞음(고객센터 버튼 대신 알림) (동작)", () => {
  it("ko·en", () => {
    for (const k of ["support_ticket_help", "support_ticket_waiting_hint"]) {
      expect(ko[k], k).not.toContain("고객센터 버튼");
      expect(en[k], k).not.toContain("Support button");
      expect(ko[k], k).toContain("알림");
      expect(en[k], k).toContain("notify");
    }
  });
});

/* ───────────── U5 확인했어요 전 안내 ───────────── */

describe("U5 「확인했어요」 위 한 줄 안내 (동작)", () => {
  it("답변 완료 상세 = 안내 줄 · ko·en", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases/c1") ? { ok: true, case: caseRow(), messages: [answerMsg()] } : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(q('[data-support-ticket-confirm-note="1"]')!.textContent).toBe("support_ticket_confirm_note");
    expect(ko.support_ticket_confirm_note).toContain("종료");
    expect(en.support_ticket_confirm_note).toBeTruthy();
  });
});

/* ───────────── U7 매장 없는 사장님 「내 문의」 ───────────── */

describe("U7 매장 없는 사장님 「내 문의」 탭 = 매장 안내 (동작)", () => {
  it("탭 내용 자리에 안내 · 화면 전체 안내는 1번", async () => {
    await act(async () => root.render(<OwnerCustomerCenterView />));
    const inTab = q('[data-owner-support-history-store-required="1"]');
    expect(inTab).not.toBeNull();
    expect(inTab!.textContent).toBe("support_owner_store_required");
    expect(container.textContent!.split("support_owner_store_required").length - 1).toBe(1);
  });
});

/* ───────────── U8 추가 문의 뒤 다시 읽기 ───────────── */

describe("U8 추가 문의 보낸 뒤 = 기존 내용 유지(스켈레톤 없음) (동작)", () => {
  it("다시 읽는 동안 질문·답변 그대로 · 로딩 덮개 없음", async () => {
    let posted = false;
    route = (url, init) => {
      if (!url.startsWith("/api/support/cases/c1")) return { ok: false };
      if (init?.method === "POST") {
        posted = true;
        return { ok: true };
      }
      if (posted) return new Promise(() => undefined);
      return { ok: true, case: caseRow(), messages: [questionMsg, answerMsg()] };
    };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-followup-open="1"]'));
    typeInto(q<HTMLTextAreaElement>('[data-support-ticket-followup="1"]')!, "추가");
    click(q('[data-support-ticket-followup-send="1"]'));
    await flush();
    expect(q("[data-support-modal-loading]")).toBeNull();
    expect(container.querySelectorAll("[data-support-ticket-qa]").length).toBe(2);
  });
});

/* ───────────── U9 초점 ───────────── */

describe("U9 숨긴 쓰기 화면 ↔ 상세 초점 이동·복원 (동작)", () => {
  it("상세 열면 상세 제목 · ‹ 로 돌아오면 누른 행", async () => {
    await openDetailFromCompose(() => ({ ok: true, case: caseRow(), messages: [answerMsg()] }));
    await flush();
    const heading = document.activeElement as HTMLElement;
    expect(heading.tagName).toBe("H2");
    expect(q('[data-support-ticket-view="detail"]')!.contains(heading)).toBe(true);

    click(q('[data-support-ticket-back="1"]'));
    await flush();
    expect((document.activeElement as HTMLElement).getAttribute("data-support-ticket-active-row")).toBe("c1");
  });

  it("「확인했어요」 전송 중에도 이름 유지", async () => {
    route = (url, init) =>
      url.startsWith("/api/support/cases/c1")
        ? init?.method === "POST"
          ? new Promise(() => undefined)
          : { ok: true, case: caseRow(), messages: [answerMsg()] }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    click(q('[data-support-ticket-confirm="1"]'));
    await flush(2);
    const btn = q('[data-support-ticket-confirm="1"]')!;
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe("support_ticket_confirm_cta");
  });
});

/* ───────────── U13 수정됨 ───────────── */

describe("U13 어드민이 고친 답변 = 「수정됨」 (동작)", () => {
  it("edited_at 있음 → 표시 · 없음·삭제됨 → 없음", async () => {
    route = (url) =>
      url.startsWith("/api/support/cases/c1")
        ? {
            ok: true,
            case: caseRow(),
            messages: [
              questionMsg,
              answerMsg({ id: "a1", edited_at: "2026-11-27T02:00:00Z" }),
              answerMsg({ id: "a2" }),
              answerMsg({ id: "a3", edited_at: "2026-11-27T02:00:00Z", deleted_at: "2026-11-27T03:00:00Z", body: "" }),
            ],
          }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    const marks = container.querySelectorAll('[data-support-ticket-edited="1"]');
    expect(marks.length).toBe(1);
    expect(marks[0]!.textContent).toContain("support_message_edited");
  });
});

/* ───────────── U14 다시 시도·로딩 한 모양 ───────────── */

describe("U14 다시 시도 한 모양 · 로딩 = DIBAY 스피너 (동작)", () => {
  it("상세 실패 → 같은 다시 시도 버튼 · 로딩은 스피너(스켈레톤 아님)", async () => {
    route = (url) => (url.startsWith("/api/support/cases/c1") ? new Promise(() => undefined) : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush(2);
    const loadingBox = q("[data-support-modal-loading]")!;
    expect(loadingBox.querySelector("[data-dibay-pending-spinner]")).not.toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    act(() => closeSupportModal());

    route = (url) => (url.startsWith("/api/support/cases/c2") ? new Response("{}", { status: 500 }) : { ok: false });
    act(() => {
      openSupportModal({ caseId: "c2" });
    });
    await flush();
    const detailRetry = q('[data-support-ticket-detail-retry="1"]')!;
    expect(detailRetry).not.toBeNull();
    const retryClass = detailRetry.className;
    act(() => closeSupportModal());

    route = () => new Response("oops", { status: 500 });
    openCompose();
    await flush();
    expect(q('[data-support-ticket-active-retry="1"]')!.className).toContain(retryClass);
  });

  it("(구조 확인) 다시 시도 = SupportRetryButton 만 · 스켈레톤 없음", () => {
    const v = src("components/support/SupportTicketViews.tsx");
    expect(v.match(/<SupportRetryButton/g)?.length).toBe(3);
    expect(v).not.toContain('t("common_retry")}\n            </button>');
    expect(v).not.toContain("animate-pulse");
  });
});
