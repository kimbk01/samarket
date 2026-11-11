/** @vitest-environment jsdom */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 4단계 P-2·P-5 (설계 docs/audit/currency-remaining-defects-design-2026-11-04.md §4) — 요청 수.
 * P-2: 사장님 재무 미납 쪽 이동 1번 = `/finance`·`/commission-ledger` 각 1번.
 * P-5: 관리자 신청 목록 3개 — 기간 합계(`summary=1`)는 처음·기간 변경·새로고침 때만, 쪽·상태만 바뀌면 목록만.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------- 공용 mock ----------
let currentSearch = new URLSearchParams();
const stableRouter = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => currentSearch,
  usePathname: () => "/x",
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children?: React.ReactNode }) => React.createElement("a", null, children),
}));
// 실제 Provider 처럼 같은 `t` 를 돌려준다 (매 렌더 새 함수면 `load` 가 매번 바뀌어 무한 조회)
const stableI18n = vi.hoisted(() => ({
  t: (k: string) => k,
  safeT: (_k: string, o?: { fallbackKo?: string }) => o?.fallbackKo ?? "",
  language: "ko",
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => stableI18n }));
vi.mock("@/lib/ui/use-refetch-on-page-show", () => ({ useRefetchOnPageShowRestore: () => {} }));
vi.mock("@/lib/ui/use-refetch-on-notification-arrival", () => ({ useRefetchOnNotificationArrival: () => {} }));

// P-2 화면 자식 — 요청 수만 보려고 비운다
let pagerOnChange: ((offset: number) => void) | null = null;
vi.mock("@/components/stores/commission/StoreCommissionLedgerParts", () => ({
  LedgerPager: (p: { onChange: (offset: number) => void }) => {
    pagerOnChange = p.onChange;
    return null;
  },
}));
vi.mock("@/components/currency", () => ({ CurrencyBalanceCard: () => null }));
vi.mock("@/components/business/owner/OwnerWalletHistory", () => ({ OwnerWalletHistory: () => null }));
vi.mock("@/components/business/owner/OwnerBusinessCashView", () => ({ OwnerBusinessCashView: () => null }));
vi.mock("@/components/business/owner/OwnerCoinWithdrawalPanel", () => ({ OwnerCoinWithdrawalPanel: () => null }));
vi.mock("@/components/finance/OwnerFinanceNav", () => ({ OwnerFinanceNav: () => null }));
vi.mock("@/components/finance/OwnerFinanceStoreSwitcher", () => ({ OwnerFinanceStoreSwitcher: () => null }));

// P-5 관리자 화면 자식
type LqState = { page: number; status: string; from: string; to: string; storeId: string; nonce: number };
let lqState: LqState;
vi.mock("@/lib/admin/list-query/use-admin-list-query", () => ({
  useAdminListQuery: () => {
    const s = lqState;
    const qs = new URLSearchParams({ limit: "50", offset: String((s.page - 1) * 50) });
    if (s.status) qs.set("status", s.status);
    if (s.from) qs.set("from", s.from);
    if (s.to) qs.set("to", s.to);
    if (s.storeId) qs.set("store_id", s.storeId);
    const api = qs.toString();
    return {
      query: { page: s.page, size: 50, status: s.status, q: "", from: s.from, to: s.to, sort: "", extras: { store_id: s.storeId } },
      draft: { q: "", from: s.from, to: s.to },
      setDraft: () => {},
      submit: () => {},
      setStatus: () => {},
      setSort: () => {},
      setSize: () => {},
      setPage: () => {},
      setExtra: () => {},
      patch: () => {},
      reset: () => {},
      refresh: () => {},
      refreshKey: `${api}#${s.nonce}`,
      apiQueryString: api,
      isFiltered: false,
    };
  },
}));
vi.mock("@/components/admin/AdminPageHeader", () => ({ AdminPageHeader: () => null }));
vi.mock("@/components/admin/ui/AdminFilterBar", () => ({ AdminFilterBar: () => null }));
vi.mock("@/components/admin/ui/AdminPagination", () => ({ AdminPagination: () => null }));
let retry: (() => void) | null = null;
vi.mock("@/components/admin/ui/AdminStateViews", () => ({
  AdminEmptyState: () => null,
  AdminLoadingState: () => null,
  AdminTechDetails: () => null,
  AdminErrorState: (p: { onRetry?: () => void }) => {
    retry = p.onRetry ?? null;
    return null;
  },
}));
vi.mock("@/components/admin/AdminCard", () => ({
  AdminCard: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
}));
vi.mock("@/components/admin/access/use-admin-route-access", () => ({ useAdminRouteAction: () => ({ allowed: true }) }));
vi.mock("@/components/admin/points/AdminPointChargeInlineActions", () => ({ AdminPointChargeInlineActions: () => null }));
vi.mock("@/components/admin/finance/AdminRequestPeriodSummaryLine", () => ({
  AdminRequestPeriodSummaryLine: (p: { summary: { requested: { count: number } } | null | undefined }) =>
    React.createElement("div", { "data-summary": p.summary ? String(p.summary.requested.count) : "none" }),
}));

// ---------- fetch ----------
type Call = { url: string };
let calls: Call[] = [];
let summarySeq = 0;
/** URL 조각 → 응답을 늦추는 대기 (숨김 확인용) */
let hold: { match: string; release: () => void; promise: Promise<void> } | null = null;
function holdNext(match: string) {
  let release = () => {};
  const promise = new Promise<void>((r) => (release = r));
  hold = { match, release, promise };
}
let failNext = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  calls.push({ url });
  if (hold && url.includes(hold.match)) {
    const h = hold;
    hold = null;
    await h.promise;
  }
  if (failNext) {
    failNext = false;
    return json({ ok: false, error: "db_error" }, 500);
  }
  if (url.includes("/commission-ledger")) return json({ ok: true, summary: { x: 1 } });
  if (url.includes("/finance")) {
    return json({
      ok: true,
      assets: { storePoints: { balance: 1 }, businessCash: { balanceMinor: 2 } },
      saleFeeObligations: { outstandingMinor: 0, totalsComplete: true, rows: [], listTotal: 45 },
    });
  }
  const withSummary = new URL(url, "http://x").searchParams.get("summary") === "1";
  return json({
    ok: true,
    requests: [],
    total: 0,
    statusCounts: {},
    ...(withSummary ? { periodSummary: { requested: { count: ++summarySeq } } } : {}),
  });
}

vi.mock("@/lib/admin/admin-fetch-client", () => ({
  adminFetch: (url: string) => fakeFetch(url as unknown as RequestInfo),
}));

let host: HTMLDivElement;
let root: Root;
async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
const count = (frag: string) => calls.filter((c) => c.url.includes(frag)).length;
const summaryCalls = () => calls.filter((c) => new URL(c.url, "http://x").searchParams.get("summary") === "1").length;
const shownSummary = () => host.querySelector("[data-summary]")?.getAttribute("data-summary");

beforeEach(() => {
  calls = [];
  summarySeq = 0;
  hold = null;
  failNext = false;
  retry = null;
  pagerOnChange = null;
  lqState = { page: 1, status: "", from: "", to: "", storeId: "", nonce: 0 };
  globalThis.fetch = vi.fn(fakeFetch) as unknown as typeof fetch;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("P-2 사장님 재무 — 미납 쪽 이동 1번 = 요청 각 1번", () => {
  it("쪽 이동은 /finance·/commission-ledger 를 1번씩만, 탭 이동도 1번씩", { timeout: 120000 }, async () => {
    const { OwnerStoreFinanceView } = await import("@/components/business/owner/OwnerStoreFinanceView");
    currentSearch = new URLSearchParams("section=outstanding");
    await act(async () => root.render(<OwnerStoreFinanceView storeId="s1" />));
    await flush();
    expect(count("/finance?")).toBe(1);
    expect(count("/commission-ledger")).toBe(1);

    expect(pagerOnChange).not.toBeNull();
    await act(async () => pagerOnChange?.(20));
    await flush();
    expect(count("/finance?")).toBe(2);
    expect(count("/commission-ledger")).toBe(2);
    expect(calls.filter((c) => c.url.includes("obligation_offset=20")).length).toBe(1);

    // 탭(section) 이 실제로 바뀌면 잔액 재조회 1번
    currentSearch = new URLSearchParams("section=coin");
    await act(async () => root.render(<OwnerStoreFinanceView storeId="s1" />));
    await flush();
    expect(count("/finance?")).toBe(3);
    expect(count("/commission-ledger")).toBe(3);
  });
});

describe("P-5 포인트 충전 목록 — 기간 합계는 기간 변경·새로고침 때만", () => {
  it("쪽·상태 이동은 summary 없이, 기간 변경 중에는 이전 합계를 숨기고, 새로고침은 다시 받는다", async () => {
    const { AdminPointChargeListPage } = await import("@/components/admin/points/AdminPointChargeListPage");
    const render = () => act(async () => root.render(<AdminPointChargeListPage />));
    await render();
    await flush();
    expect(calls.length).toBe(1);
    expect(summaryCalls()).toBe(1);
    expect(shownSummary()).toBe("1");

    lqState = { ...lqState, page: 2 };
    await render();
    await flush();
    lqState = { ...lqState, status: "pending" };
    await render();
    await flush();
    expect(calls.length).toBe(3);
    expect(summaryCalls()).toBe(1);
    expect(shownSummary()).toBe("1");

    holdNext("from=2026-10-01");
    const held = hold!;
    lqState = { ...lqState, page: 1, from: "2026-10-01", to: "2026-10-31" };
    await render();
    await flush();
    expect(summaryCalls()).toBe(2);
    expect(shownSummary()).toBe("none");
    held.release();
    await flush();
    expect(shownSummary()).toBe("2");

    lqState = { ...lqState, nonce: 1 };
    await render();
    await flush();
    expect(summaryCalls()).toBe(3);
    expect(shownSummary()).toBe("3");
  });
});

describe("P-5 Cash 충전 목록 — 기간 합계는 기간·매장 조건 변경·다시 시도 때만", () => {
  it("쪽·상태 이동은 summary 없이, 기간 변경은 다시 받고, 실패 후 다시 시도도 다시 받는다", async () => {
    const { AdminDeliveryAdCashChargeQueuePage } = await import(
      "@/components/admin/stores/AdminDeliveryAdCashChargeQueuePage"
    );
    currentSearch = new URLSearchParams();
    const render = () => act(async () => root.render(<AdminDeliveryAdCashChargeQueuePage />));
    lqState = { ...lqState, status: "PENDING" };
    await render();
    await flush();
    expect(calls.length).toBe(1);
    expect(summaryCalls()).toBe(1);
    expect(shownSummary()).toBe("1");

    lqState = { ...lqState, page: 2 };
    await render();
    await flush();
    lqState = { ...lqState, status: "APPROVED" };
    await render();
    await flush();
    expect(calls.length).toBe(3);
    expect(summaryCalls()).toBe(1);
    expect(shownSummary()).toBe("1");

    holdNext("from=2026-10-01");
    const held = hold!;
    lqState = { ...lqState, from: "2026-10-01", to: "2026-10-31" };
    await render();
    await flush();
    expect(summaryCalls()).toBe(2);
    expect(shownSummary()).toBe("none");
    held.release();
    await flush();
    expect(shownSummary()).toBe("2");

    // 쪽 이동 실패 → 합계 숨김 → 다시 시도는 합계도 다시 받는다
    failNext = true;
    lqState = { ...lqState, page: 3 };
    await render();
    await flush();
    expect(shownSummary()).toBe("none");
    expect(retry).not.toBeNull();
    await act(async () => retry?.());
    await flush();
    expect(summaryCalls()).toBe(3);
    expect(shownSummary()).toBe("3");
  });
});

describe("P-5 Coin 출금 목록 (useMemberOpsPagedFetch once) — 기간 합계는 기간 변경·새로고침 때만", () => {
  it("쪽 이동은 목록만, 기간 변경 중 이전 합계 숨김, reload·refreshKey 재조회는 다시 받는다", async () => {
    const { useMemberOpsPagedFetch } = await import("@/lib/admin/member-ops-list/use-member-ops-paged-fetch");
    const latest: { current: ReturnType<typeof useMemberOpsPagedFetch> | null } = { current: null };
    function Probe({ url, refreshKey, onceKey }: { url: string; refreshKey: string; onceKey: string }) {
      const r = useMemberOpsPagedFetch(url, "requests", refreshKey, { once: { key: onceKey, query: "summary=1" } });
      useEffect(() => {
        latest.current = r;
      });
      const s = r.oncePending || r.error ? null : (r.onceJson?.periodSummary as { requested: { count: number } } | undefined);
      return React.createElement("div", { "data-summary": s ? String(s.requested.count) : "none" });
    }
    const render = (url: string, refreshKey: string, onceKey: string) =>
      act(async () => root.render(<Probe url={url} refreshKey={refreshKey} onceKey={onceKey} />));

    await render("/api/admin/coin-withdrawals?offset=0", "a", "|");
    await flush();
    expect(calls.length).toBe(1);
    expect(summaryCalls()).toBe(1);
    expect(shownSummary()).toBe("1");

    await render("/api/admin/coin-withdrawals?offset=50", "b", "|");
    await flush();
    await render("/api/admin/coin-withdrawals?offset=50&status=PAID", "c", "|");
    await flush();
    expect(calls.length).toBe(3);
    expect(summaryCalls()).toBe(1);
    expect(shownSummary()).toBe("1");

    holdNext("from=2026-10-01");
    const held = hold!;
    await render("/api/admin/coin-withdrawals?offset=0&from=2026-10-01", "d", "2026-10-01|");
    await flush();
    expect(summaryCalls()).toBe(2);
    expect(shownSummary()).toBe("none");
    held.release();
    await flush();
    expect(shownSummary()).toBe("2");

    // 처리 후 재조회(reload) — 같은 주소 → 합계도 다시
    await act(async () => latest.current?.reload());
    await flush();
    expect(summaryCalls()).toBe(3);
    // 다시 시도(refreshKey 만 바뀜) — 같은 주소 → 합계도 다시
    await render("/api/admin/coin-withdrawals?offset=0&from=2026-10-01", "d#1", "2026-10-01|");
    await flush();
    expect(summaryCalls()).toBe(4);
    expect(shownSummary()).toBe("4");
    expect(calls.length).toBe(6);
  });

  it("once 를 넘기지 않는 기존 호출처는 주소 그대로 (summary 를 붙이지 않음)", async () => {
    const { useMemberOpsPagedFetch } = await import("@/lib/admin/member-ops-list/use-member-ops-paged-fetch");
    function Plain() {
      useMemberOpsPagedFetch("/api/admin/x?offset=0", "requests", 0);
      return null;
    }
    await act(async () => root.render(<Plain />));
    await flush();
    expect(calls.map((c) => c.url)).toEqual(["/api/admin/x?offset=0"]);
  });
});
