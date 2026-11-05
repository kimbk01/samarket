// @vitest-environment jsdom
/**
 * 사장님 문의·리뷰 목록 · 거래 광고 시트 · 게시글 상위노출 시트 — 공유 조회 마감.
 * 대상 요청이 멈춰도 마감 뒤 로딩을 벗어나고(기존 오류 처리), 재진입은 새 요청을 보낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STABLE_T = (k: string) => `T:${k}`;
const STABLE_I18N = { t: STABLE_T, tt: STABLE_T, safeT: STABLE_T, language: "ko" };
const STABLE_PARAMS = new URLSearchParams("storeId=st-1");
const STABLE_ROUTER = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} };
const STABLE_TOAST = { show: () => {}, success: () => {}, error: () => {}, info: () => {} };

const st = { stall: null as RegExp | null, calls: [] as string[] };

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() {
      return okJson(body);
    },
  } as unknown as Response;
}

function bodyFor(url: string): unknown {
  if (url.includes("/api/me/stores") && !/\/api\/me\/stores\/[^/?]+/.test(url)) {
    return { ok: true, stores: [{ id: "st-1", store_name: "S", approval_status: "approved" }] };
  }
  if (url.includes("/api/me/points")) return { ok: true, balance: 10 };
  return { ok: true, reviews: [], inquiries: [] };
}

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  st.stall = null;
  st.calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      st.calls.push(String(url));
      if (st.stall?.test(String(url))) {
        return new Promise((_, rej) =>
          init.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")))
        );
      }
      return Promise.resolve(okJson(bodyFor(String(url))));
    })
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.doMock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => STABLE_I18N }));
  vi.doMock("next/navigation", () => ({
    usePathname: () => "/my/business",
    useSearchParams: () => STABLE_PARAMS,
    useRouter: () => STABLE_ROUTER,
  }));
  vi.doMock("next/link", () => ({
    default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
  }));
  vi.doMock("@/components/business/owner/OwnerToastHost", () => ({ useOwnerToast: () => STABLE_TOAST }));
  vi.doMock("@/components/ui/dibay-overlay", () => ({
    DibayBottomSheet: ({ children, footer }: { children: unknown; footer?: unknown }) =>
      createElement("div", null, children as never, footer as never),
    DibayOverlayButton: ({ children }: { children: unknown }) => createElement("button", null, children as never),
    DibayDialog: () => null,
  }));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const m of [
    "@/components/i18n/AppLanguageProvider",
    "next/navigation",
    "next/link",
    "@/components/business/owner/OwnerToastHost",
    "@/components/ui/dibay-overlay",
  ])
    vi.doUnmock(m);
});

async function mount(el: ReactElement) {
  root = createRoot(host);
  await act(async () => root!.render(el));
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function remount(el: ReactElement) {
  act(() => root?.unmount());
  await mount(el);
}
const showsLoading = () =>
  /T:common_loading|animate-pulse|data-kind="loading"/.test(host.innerHTML) || host.innerHTML.includes("loading");
const hits = (re: RegExp) => st.calls.filter((u) => re.test(u)).length;

const CASES = [
  ["OwnerStoreInquiriesView", "@/components/business/owner/OwnerStoreInquiriesView", /\/inquiries/, {}],
  ["OwnerStoreReviewsView", "@/components/business/owner/OwnerStoreReviewsView", /\/reviews/, {}],
  [
    "TradeAdQuickSheet",
    "@/components/trade/seller-ad/TradeAdQuickSheet",
    /feed-ad-requests/,
    { open: true, onClose: () => {}, postId: "post-1" },
  ],
  [
    "MemberPostPromoteSheet",
    "@/components/post/MemberPostPromoteSheet",
    /\/api\/me\/points$/,
    { open: true, onClose: () => {}, postId: "post-1", domain: "community" },
  ],
] as const;

async function element(path: string, name: string, props: object): Promise<ReactElement> {
  const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
  return createElement(mod[name] as never, props as never);
}

describe.each(CASES)("%s", (name, path, target, props) => {
  it("대상 요청 멈춤: 마감 뒤 로딩 해제 · 재진입은 새 요청으로 정상 표시", async () => {
    st.stall = target;
    const el = await element(path, name, props);
    await mount(el);
    expect(showsLoading()).toBe(true);
    await advance(12_050);
    expect(showsLoading()).toBe(false);
    const before = hits(target);
    st.stall = null;
    await remount(el);
    await advance(100);
    expect(hits(target)).toBe(before + 1);
    expect(showsLoading()).toBe(false);
  });

  it("정상 응답: 로딩을 벗어난다", async () => {
    await mount(await element(path, name, props));
    await advance(100);
    expect(showsLoading()).toBe(false);
    expect(hits(target)).toBe(1);
  });
});
