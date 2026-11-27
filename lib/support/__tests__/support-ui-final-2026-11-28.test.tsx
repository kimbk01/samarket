// @vitest-environment jsdom
/**
 * 고객 문의 최종 감사 화면 수정 (docs/audit/customer-support-inquiry-final-2026-11-28/final-audit.md §2 화면 ·
 * 시안 ui-mockup.html 5절) 회귀 잠금 — 고객 화면 쪽 U-2·U-3·U-4·U-5·U-7·U-8·U-9·U-10·U-12·U-14·U-15 · 오류 문구.
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
import {
  SupportCasesHistoryList,
  supportHistoryActiveUrl,
  supportHistoryCacheKey,
} from "@/components/support/SupportCasesHistoryList";
import { OwnerCustomerCenterView } from "@/components/business/owner/OwnerCustomerCenterView";
import { closeSupportModal, openSupportModal } from "@/lib/support/support-modal-controller";
import { buildGenericSupportTriageContext } from "@/lib/support/support-context";
import { supportCaseStatusLabelMeta, supportRequesterStatusPill } from "@/lib/support/support-status-label";
import { supportErrorLabel, supportErrorNeedsReload } from "@/lib/support/support-display-labels";
import { isSupportHubInquireDisabled, OWNER_SUPPORT_TAB_SELECTED_CLASS } from "@/lib/support/support-owner-cta";
import { forgetMypageListCache } from "@/lib/mypage/use-mypage-cursor-list";
import { CUSTOMER_CENTER_BOARD_LABEL_KEYS } from "@/components/mypage/cs/CustomerCenterHubClient";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ko = MESSAGES.ko as Record<string, string>;
const en = MESSAGES.en as Record<string, string>;

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

type Route = (url: string, init?: RequestInit) => unknown | Promise<unknown>;
let route: Route = () => ({ ok: false });
const fetchCalls: string[] = [];
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const url = String(input);
  fetchCalls.push(url);
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
  forgetMypageListCache();
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

/* ───────────── 순수 함수 ───────────── */

describe("U-15 상태 문구 — 모르면 「답변 대기」 (동작)", () => {
  it("null·모르는 값 = 답변 대기(노랑), WAITING_USER 만 답변 완료", () => {
    expect(supportCaseStatusLabelMeta(null).key).toBe("support_status_waiting_admin");
    expect(supportCaseStatusLabelMeta("BOGUS" as never).key).toBe("support_status_waiting_admin");
    expect(supportCaseStatusLabelMeta("OPEN").key).toBe("support_status_waiting_admin");
    expect(supportCaseStatusLabelMeta("WAITING_USER").key).toBe("support_status_active");
    expect(supportCaseStatusLabelMeta("RESOLVED").key).toBe("support_status_resolved");
    expect(supportRequesterStatusPill(null, 0).tone).toBe("waiting");
    expect(supportRequesterStatusPill(null, 3).tone).toBe("waiting");
  });

  it("(구조 확인) 낡은 주석(상담 중·상담 종료) 없음", () => {
    const s = src("lib/support/support-status-label.ts");
    expect(s).not.toContain("상담 중");
    expect(s).not.toContain("→ 상담 종료");
  });
});

describe("오류 문구 — 서버 새 오류 코드 (동작)", () => {
  const safeT = (k: string) => k;
  it("rate_limited·http_429·invalid_transition·case_closed·case_updated·모르는 코드", () => {
    expect(supportErrorLabel(safeT as never, "rate_limited")).toBe("support_error_rate_limited");
    expect(supportErrorLabel(safeT as never, "http_429")).toBe("support_error_rate_limited");
    expect(supportErrorLabel(safeT as never, "invalid_transition")).toBe("support_error_invalid_transition");
    expect(supportErrorLabel(safeT as never, "case_closed")).toBe("support_error_case_closed");
    expect(supportErrorLabel(safeT as never, "case_updated")).toBe("support_error_case_updated");
    expect(supportErrorLabel(safeT as never, "something_new")).toBe("common_error");
    expect(supportErrorLabel(safeT as never, null)).toBe("common_error");
  });
  it("다시 읽는 코드 = case_closed·case_updated·invalid_transition 만", () => {
    expect(["case_closed", "case_updated", "invalid_transition"].every(supportErrorNeedsReload)).toBe(true);
    expect(supportErrorNeedsReload("rate_limited")).toBe(false);
    expect(supportErrorNeedsReload(undefined)).toBe(false);
  });
  it("카탈로그 ko·en", () => {
    expect(ko.support_error_rate_limited).toBe("잠시 후 다시 보내 주세요.");
    expect(en.support_error_rate_limited).toBe("Please wait a moment and try again.");
    expect(ko.support_error_invalid_transition).toBeTruthy();
    expect(en.support_error_invalid_transition).toBeTruthy();
    expect(ko.support_ticket_active_load_failed).toBeTruthy();
    expect(en.support_ticket_active_load_failed).toBeTruthy();
  });
});

describe("U-8 목록 안내 = 동작과 같음 (동작)", () => {
  it("종료 문의는 답변을 확인하면 사라진다", () => {
    expect(ko.support_ticket_list_hint).toBe("종료된 문의는 답변을 확인하면 목록에서 사라져요.");
    expect(en.support_ticket_list_hint).toBe("Closed inquiries leave this list after you read the reply.");
  });
});

describe("U-9 허브 게시판 이름 = 카탈로그 키", () => {
  it("모든 게시판 키에 ko·en 문구 (동작)", () => {
    for (const key of Object.values(CUSTOMER_CENTER_BOARD_LABEL_KEYS)) {
      expect(ko[key], key).toBeTruthy();
      expect(en[key], key).toBeTruthy();
    }
  });
  it("(구조 확인) 언어 삼항·BOARD_LABEL[ko/en] 없음", () => {
    const s = src("components/mypage/cs/CustomerCenterHubClient.tsx");
    expect(s).not.toContain('language === "en"');
    expect(s).not.toMatch(/BOARD_LABEL\[/);
  });
});

describe("U-12 매장 없는 사장님 「문의하기」 = 비활성 (동작)", () => {
  it("판정", () => {
    expect(isSupportHubInquireDisabled("OWNER", null)).toBe(true);
    expect(isSupportHubInquireDisabled("OWNER", "  ")).toBe(true);
    expect(isSupportHubInquireDisabled("OWNER", "s1")).toBe(false);
    expect(isSupportHubInquireDisabled("MEMBER", null)).toBe(false);
  });

  it("매장 없음 → 버튼은 보이되 비활성 · 안내 1번", async () => {
    await act(async () => root.render(<OwnerCustomerCenterView />));
    const btn = q<HTMLButtonElement>("[data-owner-support-inquire]");
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
    expect(container.textContent!.split("support_owner_store_required").length - 1).toBe(1);
  });

  it("U-7 매장 있음 → 버튼 활성 · 선택 탭 = 갈색(초록 아님)", async () => {
    searchParams = new URLSearchParams({ storeId: "s1" });
    route = () => ({ ok: true, cases: [], nextCursor: null });
    await act(async () => root.render(<OwnerCustomerCenterView />));
    await flush();
    expect(q<HTMLButtonElement>("[data-owner-support-inquire]")!.disabled).toBe(false);
    const selected = q('[data-owner-care-tab="history"]')!;
    expect(selected.className).toContain(OWNER_SUPPORT_TAB_SELECTED_CLASS);
    expect(selected.className).not.toContain("bg-signature");
  });
});

/* ───────────── 목록 (U-5·U-10) ───────────── */

describe("U-5 사장님·회원 목록 한 구현 (동작)", () => {
  it("요청 주소·캐시 키 — 사장님은 그 매장 · 같은 커서 목록", () => {
    expect(supportHistoryActiveUrl(null)).toBe("/api/support/cases?audience=MEMBER&status=active&limit=20");
    expect(supportHistoryActiveUrl("cur", { audience: "OWNER", storeId: "s1" })).toBe(
      "/api/support/cases?audience=OWNER&status=active&limit=20&storeId=s1&cursor=cur"
    );
    expect(supportHistoryCacheKey({ audience: "MEMBER" })).toBe("me:support:cases:active");
    expect(supportHistoryCacheKey({ audience: "OWNER", storeId: "s1" })).toBe("me:support:cases:owner:s1");
    expect(supportHistoryCacheKey({ audience: "OWNER", storeId: null })).toBeNull();
  });

  it("사장님 오류 → 같은 오류 화면 · 다시 시도 누르면 다시 읽음", async () => {
    route = () => new Response("{}", { status: 500 });
    await act(async () => root.render(<SupportCasesHistoryList audience="OWNER" storeId="s1" />));
    await flush();
    expect(q('[data-testid="my-state-error"]')).not.toBeNull();
    const before = fetchCalls.length;
    route = () => ({ ok: true, cases: [caseRow({ audience: "OWNER", owner_store_id: "s1" })], nextCursor: "n1" });
    click(q('[data-testid="my-state-retry"]'));
    await flush();
    const listCalls = fetchCalls.slice(before).filter((u) => u.startsWith("/api/support/cases?"));
    expect(listCalls.length).toBe(1);
    expect(listCalls[0]).toContain("audience=OWNER");
    expect(listCalls[0]).toContain("storeId=s1");
    // 더 보기 = 회원과 같은 MyListPager
    expect(q('[data-testid="my-list-pager-more"]')).not.toBeNull();
    // U-10: 행 = 공용 행 + ›
    const row = q('[data-support-history-row="c1"]')!;
    expect(row.getAttribute("data-support-case-row")).toBe("1");
    expect(row.querySelector("svg")).not.toBeNull();
  });

  it("사장님 빈 목록 = 안내만(버튼 없음) · 회원 빈 목록 = 안내 + 문의하기", async () => {
    route = () => ({ ok: true, cases: [], nextCursor: null });
    await act(async () => root.render(<SupportCasesHistoryList audience="OWNER" storeId="s1" />));
    await flush();
    const empty = q('[data-support-cases-history-empty="1"]');
    expect(empty).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();

    await act(async () => root.render(<SupportCasesHistoryList audience="MEMBER" />));
    await flush();
    expect(q("[data-support-hub-inquire]")).not.toBeNull();
  });

  it("로딩 = 스켈레톤(회원과 같음)", async () => {
    route = () => new Promise(() => undefined);
    await act(async () => root.render(<SupportCasesHistoryList audience="OWNER" storeId="s2" />));
    expect(q('[data-testid="my-state-loading"]')).not.toBeNull();
  });
});

/* ───────────── 문의 창 (U-2·U-3·U-4·U-14) ───────────── */

function openCompose() {
  act(() => {
    openSupportModal({
      context: buildGenericSupportTriageContext({ audience: "MEMBER", sourceSurface: "mypage_customer_center" }),
    });
  });
}

describe("U-3 쓰기 → 진행 중 문의 → ‹ = 쓰던 글 그대로 (동작)", () => {
  it("입력 직후(300ms 저장 전) 상세를 열고 돌아와도 같은 글 · 이어 쓰기 카드 없음", async () => {
    route = (url) => {
      if (url.startsWith("/api/support/cases?")) return { ok: true, cases: [caseRow()] };
      if (url.startsWith("/api/support/cases/c1")) return { ok: true, case: caseRow(), messages: [] };
      return { ok: false };
    };
    await act(async () => root.render(<SupportModalHost />));
    openCompose();
    await flush();
    const body = q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!;
    typeInto(body, "결제가 두 번 됐어요");
    const casesCallsBefore = fetchCalls.filter((u) => u.startsWith("/api/support/cases?")).length;

    click(q('[data-support-ticket-active-row="c1"]'));
    await flush();
    expect(q('[data-support-ticket-view="detail"]')).not.toBeNull();
    // 쓰기 화면은 숨긴 채 유지
    const kept = q('[data-support-compose-kept="1"]');
    expect(kept).not.toBeNull();
    expect(kept!.hasAttribute("inert")).toBe(true);

    click(q('[data-support-ticket-back="1"]'));
    await flush();
    expect(q('[data-support-ticket-view="detail"]')).toBeNull();
    const after = q<HTMLTextAreaElement>('[data-support-ticket-body="1"]')!;
    expect(after.value).toBe("결제가 두 번 됐어요");
    expect(q('[data-support-ticket-draft="1"]')).toBeNull();
    // 돌아오면 진행 중 목록만 다시 읽는다(상태가 바뀌었을 수 있음)
    expect(fetchCalls.filter((u) => u.startsWith("/api/support/cases?")).length).toBe(casesCallsBefore + 1);
  });

  it("쓰기를 거치지 않고 연 상세(푸시·목록)는 쓰기 화면을 만들지 않는다(추가 요청 없음)", async () => {
    route = (url) => (url.startsWith("/api/support/cases/c1") ? { ok: true, case: caseRow(), messages: [] } : { ok: false });
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c1" });
    });
    await flush();
    expect(q('[data-support-ticket-view="detail"]')).not.toBeNull();
    expect(q('[data-support-compose-kept="1"]')).toBeNull();
    expect(fetchCalls.some((u) => u.startsWith("/api/support/cases?"))).toBe(false);
  });
});

describe("U-2 종료 문의 상세에도 상태 줄 (동작)", () => {
  async function openClosed(unread: number) {
    route = (url) =>
      url.startsWith("/api/support/cases/c9")
        ? {
            ok: true,
            closed: true,
            case: caseRow({ id: "c9", status: "RESOLVED", requester_unread_count: unread }),
            messages: unread
              ? [{ id: "m1", sender_type: "ADMIN", body: "답변", created_at: "2026-11-27T01:00:00Z", deleted_at: null }]
              : [],
          }
        : { ok: false };
    await act(async () => root.render(<SupportModalHost />));
    act(() => {
      openSupportModal({ caseId: "c9" });
    });
    await flush();
    return q("[data-support-ticket-who]");
  }

  it("종료 + 안 읽은 답변 = 「새 답변」", async () => {
    const row = await openClosed(1);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("support_ticket_status_label");
    expect(row!.textContent).toContain("support_status_new_reply");
  });

  it("종료 = 「종료」", async () => {
    const row = await openClosed(0);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("support_status_resolved");
  });
});

describe("U-14 진행 중 문의 불러오기 실패 = 오류 줄 + 다시 시도 (동작)", () => {
  it("실패 → 오류 줄 → 다시 시도 → 목록", async () => {
    route = () => new Response("oops", { status: 500 });
    await act(async () => root.render(<SupportModalHost />));
    openCompose();
    await flush();
    expect(q('[data-support-ticket-active-error="1"]')).not.toBeNull();
    route = (url) => (url.startsWith("/api/support/cases?") ? { ok: true, cases: [caseRow()] } : { ok: false });
    click(q('[data-support-ticket-active-retry="1"]'));
    await flush();
    expect(q('[data-support-ticket-active-error="1"]')).toBeNull();
    expect(q('[data-support-ticket-active-row="c1"]')).not.toBeNull();
  });

  it("(구조 확인) 다시 시도 버튼 44px", () => {
    expect(src("components/support/SupportTicketViews.tsx")).toMatch(
      /data-support-ticket-active-retry="1"\s+className="min-h-11/
    );
  });
});

describe("U-4 회원/매장 전환 버튼 누르는 영역 44px", () => {
  it("(구조 확인) 두 버튼 모두 SWITCH_HIT(min-h-11) · 보이는 칸은 작게", () => {
    const v = src("components/support/SupportTicketViews.tsx");
    expect(v).toContain('const SWITCH_HIT = "touch-manipulation flex min-h-11 items-center";');
    const buttons = v.match(/data-support-ticket-switch="(MEMBER|OWNER)"[\s\S]*?className=\{`\$\{SWITCH_HIT\}/g) ?? [];
    expect(buttons.length).toBe(2);
    expect(v).not.toMatch(/data-support-ticket-switch="(MEMBER|OWNER)"\s+className=\{`px-2 py-1/);
  });
});
