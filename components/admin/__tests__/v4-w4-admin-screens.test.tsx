// @vitest-environment jsdom
/**
 * v4 W4 관리자 화면 — 허브 홈 탭 GET 수(PERF-18)·실패 상태(UI-06·07)·오너 노출 잠금(UI-03)·
 * 기간 연장 견적 초기화/확인(UI-08)·성과/결제 실패 상태(UI-09·12)·통계 예외(UI-13·14).
 */
import { act, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/delivery-screens",
  useSearchParams: () => new URLSearchParams("tab=home"),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (k: string) => k,
    safeT: (k: string, o?: { fallbackKo?: string }) => o?.fallbackKo ?? k,
    language: "ko",
  }),
}));
/** 선반 편집기 = 자체 GET 1회만 하고 결과를 onLoaded 로 공유한다고 가정한 대역 */
const shelvesEditorLoads = vi.fn();
vi.mock("@/components/admin/stores/AdminStoresHomeShelvesPage", async () => {
  const React = await import("react");
  return {
    AdminStoresHomeShelvesEditor: (p: {
      onLoaded?: (r: { ok: true; shelves: unknown[] } | { ok: false; code: string; status?: number }) => void;
    }) => {
      React.useEffect(() => {
        shelvesEditorLoads();
        void fetch("/api/admin/stores-home-shelves").then(() =>
          p.onLoaded?.({ ok: true, shelves: [{ shelfId: "rest_stores", adIntegration: "native" }] })
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="shelves-editor" />;
    },
  };
});
vi.mock("@/components/stores/advertising/DeliveryAdPolicySlotPreview", () => ({
  DeliveryAdPolicySlotPreview: () => null,
}));
vi.mock("@/lib/stores/product/stores-home-shelf-admin-tabs", () => ({
  isHomeRestShelf: (s: { shelfId?: string }) => s.shelfId === "rest_stores",
  isHomeRestPaidInsertionOn: (v: string | null) => v === "native",
}));
vi.mock("@/components/business/admin/StoreOpsOnOffSwitch", () => ({
  StoreOpsOnOffSwitch: (p: { checked: boolean; disabled?: boolean; onCheckedChange: (n: boolean) => unknown }) => (
    <button
      type="button"
      role="switch"
      data-testid="ops-switch"
      aria-checked={p.checked}
      disabled={p.disabled}
      onClick={() => void p.onCheckedChange(!p.checked)}
    />
  ),
}));
vi.mock("@/components/business/owner/OwnerStoreAdminConfirmModal", () => ({
  OwnerStoreAdminConfirmModal: () => null,
}));
vi.mock("@/components/business/owner/OwnerToastHost", () => ({
  useOwnerToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/lib/me/fetch-me-stores-deduped", () => ({ invalidateMeStoresListDedupedCache: vi.fn() }));

import { DeliveryScreensHomeTab } from "@/components/admin/stores/delivery-screens/DeliveryScreensHomeTab";
import { AdminDeliveryAdHomePolicyPanel } from "@/components/admin/stores/AdminDeliveryAdPlacementPolicyPanel";
import { deliveryAdPolicyCountsQuery } from "@/components/admin/stores/delivery-screens/delivery-screens-status";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";
import { readDeliveryOperationsIncludeTest } from "@/components/admin/delivery-operations/DeliveryOperationsDashboardPage";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<>{node}</>));
  await flush();
}

const q = (sel: string) => host!.querySelector(sel);
const getUrls = () =>
  fetchMock.mock.calls
    .filter(([, init]) => !(init as RequestInit | undefined)?.method || (init as RequestInit).method === "GET")
    .map(([u]) => String(u));

const COUNTS = { linked: 3, exposable_now: 2, under_review: 1 };

beforeEach(() => {
  fetchMock.mockReset();
  shelvesEditorLoads.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

function hubOk(url: string) {
  if (url.includes("placement-inventory")) return json(200, { ok: true, inventory: { hero: { capacity: 5, slots: [] } } });
  if (url.includes("/api/admin/delivery-ads?")) return json(200, { ok: true, policyCounts: COUNTS });
  if (url.includes("stores-home-shelves")) return json(200, { ok: true, shelves: [] });
  if (url.includes("stores-composition-policy")) return json(200, { ok: true, rows: [] });
  if (url.includes("stores-home-before-rest-banner")) return json(200, { ok: true, enabled: true, revision: 1 });
  return json(404, { ok: false, error: "not_found" });
}

describe("v4 PERF-18 허브 홈 탭 GET", () => {
  it("집행 수 = 서버 페이지 limit=1 (목록 500건 아님)", () => {
    const qs = new URLSearchParams(deliveryAdPolicyCountsQuery({ inventory: "STORES_HOME_FEED", product: "store_sponsored" }));
    expect(qs.get("view")).toBe("all");
    expect(qs.get("limit")).toBe("1");
    expect(qs.get("offset")).toBe("0");
    expect(qs.get("product")).toBe("store_sponsored");
    expect(qs.has("bucket")).toBe(false);
  });

  it("홈 탭 전체 GET: 홈 선반 1회 · STORES_HOME_FEED 1회 · 합계 6회 (이전 9~10회)", async () => {
    fetchMock.mockImplementation((u: string) => hubOk(String(u)));
    await mount(<DeliveryScreensHomeTab />);
    await flush();
    const urls = getUrls();
    expect(urls.filter((u) => u.includes("stores-home-shelves"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("STORES_HOME_FEED"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("STORES_HOME_INLINE_1"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("limit=500"))).toHaveLength(0);
    // hero · INLINE_1 · FEED · 선반(편집기) · 구성 정책 · 앞 배너
    expect(urls).toHaveLength(6);
  });

  it("UI-06: 현황 조회 실패는 오류 상태 + [새로고침] (값 없음과 구분)", async () => {
    fetchMock.mockImplementation((u: string) =>
      String(u).includes("placement-inventory") ? json(500, { ok: false, error: "db_error" }) : hubOk(String(u))
    );
    await mount(<DeliveryScreensHomeTab />);
    await flush();
    const errorBox = q('[data-admin-state="error"]');
    expect(errorBox).not.toBeNull();
    const before = getUrls().filter((u) => u.includes("placement-inventory")).length;
    const retry = errorBox!.querySelector("button");
    await act(async () => (retry as HTMLButtonElement).click());
    await flush();
    expect(getUrls().filter((u) => u.includes("placement-inventory")).length).toBe(before + 1);
  });
});

describe("v4 UI-07 홈 광고 정책 패널", () => {
  it("feedCounts 를 받으면 delivery-ads 를 다시 부르지 않는다", async () => {
    fetchMock.mockImplementation((u: string) => hubOk(String(u)));
    await mount(<AdminDeliveryAdHomePolicyPanel restShelfAdIntegration="native" feedCounts={COUNTS} />);
    const urls = getUrls();
    expect(urls.some((u) => u.includes("/api/admin/delivery-ads"))).toBe(false);
    expect(urls).toHaveLength(2);
  });

  it("조회 실패 = 오류 배너 + 재시도, 저장 실패 = 문구", async () => {
    fetchMock.mockImplementation((u: string, init?: RequestInit) => {
      const url = String(u);
      if (init?.method === "PUT") return json(409, { ok: false, error: "stale_revision" });
      if (url.includes("stores-composition-policy")) return json(500, { ok: false, error: "db_error" });
      return hubOk(url);
    });
    await mount(<AdminDeliveryAdHomePolicyPanel restShelfAdIntegration="native" feedCounts={COUNTS} />);
    expect(q("[data-admin-home-policy-load-error]")).not.toBeNull();
    const toggle = q("[data-admin-home-before-rest-banner-toggle]") as HTMLInputElement;
    await act(async () => toggle.click());
    await flush();
    expect(q("[data-admin-home-before-rest-banner-save-error]")?.textContent).toContain("다른 관리자가 먼저 저장");
  });
});

describe("v4 UI-03 오너 노출 토글 — 관리자 숨김 잠금", () => {
  const ROW = { id: "store-1", approval_status: "approved", is_visible: false } as unknown as StoreRow;

  it("매장 행에 잠금 값이 있으면 토글 비활성 + 고정 안내", async () => {
    await mount(<BusinessAdminVisibleToggle row={{ ...ROW, admin_visibility_locked: true } as StoreRow} onUpdated={() => {}} />);
    expect((q('[data-testid="ops-switch"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q("[data-owner-store-visibility-admin-locked]")?.textContent).toBe("business_ops4_err_admin_visibility_locked");
  });

  it("잠금 값이 없을 때 켜기 409 admin_visibility_locked → 이후 토글 고정 비활성 + 안내", async () => {
    fetchMock.mockImplementation(() => json(409, { ok: false, error: "admin_visibility_locked" }));
    await mount(<BusinessAdminVisibleToggle row={ROW} onUpdated={() => {}} />);
    expect(q("[data-owner-store-visibility-admin-locked]")).toBeNull();
    await act(async () => (q('[data-testid="ops-switch"]') as HTMLButtonElement).click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((q('[data-testid="ops-switch"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q("[data-owner-store-visibility-admin-locked]")).not.toBeNull();
  });
});

describe("v4 UI-13·14 배달 통계", () => {
  it("범위 문구는 응답 query.include_test 기준", () => {
    expect(readDeliveryOperationsIncludeTest({ query: { days: 14, include_test: true } })).toBe(true);
    expect(readDeliveryOperationsIncludeTest({ query: { days: 14, include_test: false } })).toBe(false);
    expect(readDeliveryOperationsIncludeTest({ query: { days: 14 } })).toBeNull();
    expect(readDeliveryOperationsIncludeTest(null)).toBeNull();
    const src = read("components/admin/delivery-operations/DeliveryOperationsDashboardPage.tsx");
    expect(src).toContain("(payloadIncludeTest ?? includeTest)");
    expect(src).toMatch(/\.catch\(\(\) => \{\s*setLoadState\("error"\);/);
  });
});

describe("v4 UI-08·09·12 광고 상세", () => {
  const src = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");

  it("UI-08: 일수·종류를 바꾸면 견적 초기화, 실행 전 확인 + 견적 일치 검사", () => {
    expect(src).toMatch(/setExtendKind\("PAID"\);\s*setExtendQuote\(null\);/);
    expect(src).toMatch(/setExtendKind\("ADMIN_FREE_COMPENSATION"\);\s*setExtendQuote\(null\);/);
    expect(src).toMatch(/setExtendDays\(Number\(e\.target\.value\) \|\| 1\);[\s\S]{0,120}setExtendQuote\(null\);/);
    const submit = src.slice(src.indexOf("async function submitExtend"), src.indexOf("async function saveInventory"));
    expect(submit).toContain("quote.daysAdded !== extendDays");
    expect(submit.indexOf("confirmAdminAction")).toBeGreaterThan(-1);
    expect(submit.indexOf("confirmAdminAction")).toBeLessThan(submit.indexOf("/extend`"));
  });

  it("UI-09: 결제 조회 실패를 「미결제」로 바꾸지 않는다", () => {
    expect(src).toContain("setFundingLoadError({ code: \"network_error\" })");
    expect(src).not.toMatch(/catch \{\s*setFundingStatus\("UNFUNDED"\)/);
    expect(src).toContain("data-admin-delivery-ads-funding-error");
  });

  it("UI-12: 성과 조회 실패 = 오류 상태 (광고 상세·목록)", () => {
    expect(src).toContain("setPerfError({ code: \"network_error\" })");
    const plane = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(plane).toContain("setPerfError({ code: json.error || \"load_failed\", status: res.status })");
    expect(plane).toContain("perfError && !perfLoading");
  });
});

describe("v4 UI-10·11·15 확인 단계·오류 문구", () => {
  it("배너 스튜디오: 삭제 확인 · 오류 문구 매핑 · catch", () => {
    const s = read("components/admin/stores/AdminDeliveryAdBannerStudioView.tsx");
    const remove = s.slice(s.indexOf("async function removeCreative"), s.indexOf("async function saveDestination"));
    expect(remove).toContain("confirmAdminAction");
    expect(remove).toContain("setError(null)");
    expect(s).toContain("adminOperatorErrorMessage(error, lang !== \"en\")");
    expect((s.match(/setError\("network_error"\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("Partner: 승인·반려·종료·설정 저장 확인, 목록 오류 상태", () => {
    const v = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
    expect(v.slice(v.indexOf("const act = async"), v.indexOf("const filters = ["))).toContain("confirmAdminAction");
    expect(v).toContain("data-admin-partner-loading");
    expect(v).toContain("adminOperatorErrorMessage(error, lang !== \"en\")");
    const f = read("components/admin/stores/AdminDeliveryAdPartnerConfigForm.tsx");
    expect(f).toContain("confirmAdminAction");
    expect(f).toContain('setError("network_error")');
  });

  it("광고 만들기·노출 위치: detail 원문 미노출 · 네트워크 예외 처리", () => {
    const c = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(c).not.toContain("`${j.error}: ${j.detail}`");
    expect(c).toContain('showCodeError("network_error")');
    const p = read("components/admin/ads/AdminAdsPlacementManagementView.tsx");
    expect(p).toContain('setErr("network_error")');
  });
});
