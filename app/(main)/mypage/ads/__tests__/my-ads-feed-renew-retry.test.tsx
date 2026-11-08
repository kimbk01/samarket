// @vitest-environment jsdom
/**
 * FB-M13 (P0 · 2026-11-04) — 마이 › 광고 › 피드 배너 연장 창을 실제로 그려서 확인한다.
 * 옛 코드는 「결제하고 연장」을 누를 때마다 새 키(crypto.randomUUID)를 만들어,
 * 응답이 끊긴 뒤 다시 누르면 서버가 새 결제로 보고 한 번 더 차감했다.
 * - 끊김 뒤 다시 누름 → 두 요청의 키가 같다
 * - 2xx 뒤 새 연장 → 키가 다르다
 * - 5xx 뒤 다시 누름 → 키가 같다
 * - 끊김 뒤 창을 닫았다 열면 그 상품이 다시 골라져 있다
 * - 409 idempotency_consumed → 「이미 처리된 연장입니다」 + 목록 다시 불러옴
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  /** 언어 SSOT S6: 대체 문구 대신 실제 카탈로그 값(ko)으로 렌더 — 화면과 같은 문구를 확인한다 */
  const { safeTranslate } = await import("@/lib/i18n/safe-translate");
  const value = {
    language: "ko",
    t: (k: string) => k,
    safeT: (k: string, o?: Parameters<typeof safeTranslate>[2]) => safeTranslate("ko", k as never, o),
  };
  return { useI18n: () => value };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/mypage/ds/MyScreen", () => ({
  MyScreen: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/mypage/ds/MyTabs", () => ({ MyTabs: () => null }));
vi.mock("@/components/mypage/ds/MyStateView", () => ({ MyStateView: () => <div data-state-view="1" /> }));
vi.mock("@/components/ui/MobileConfirmBottomSheet", () => ({ MobileConfirmBottomSheet: () => null }));
vi.mock("@/components/currency", () => ({
  CurrencyAmount: ({ amount }: { amount: number }) => <span>{amount}P</span>,
}));
vi.mock("@/lib/mypage/mypage-toast", () => ({ showMypageToast: () => {} }));
vi.mock("@/lib/mypage/mypage-home-summary-client", () => ({ invalidateMypageSummary: () => {} }));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayActionSheet: () => null,
  DibayBottomSheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-sheet="1">{children}</div> : null,
  DibayOverlayButton: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "data-testid"?: string;
  }) => (
    <button type="button" data-testid={rest["data-testid"]} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import MyAdsPageClient from "@/app/(main)/mypage/ads/MyAdsPageClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = [
  { id: "feed_7", domain: "trade", titleKo: "7일", titleEn: "7d", pointCost: 7000, durationDays: 7 },
  { id: "feed_14", domain: "trade", titleKo: "14일", titleEn: "14d", pointCost: 12000, durationDays: 14 },
];
const row = {
  id: "req-1",
  status: "approved",
  displayStatus: "active",
  domain: "trade",
  placement: "TRADE_HOME",
  pointCost: 7000,
  durationDays: 7,
  campaignId: "camp-1",
  createdAt: "2026-11-01T00:00:00Z",
  startAt: "2026-11-01T00:00:00Z",
  endAt: "2026-11-08T00:00:00Z",
  creatives: [],
};

type Reply = "network" | { status: number; body: unknown };
let replies: Reply[] = [];
let posts: Array<{ key: string | null; bodyKey: string; productId: string; expectedCost?: number }> = [];
let listCalls = 0;
let container: HTMLDivElement;
let root: Root;

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  replies = [];
  posts = [];
  listCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/me/post-ads") return json({ ok: true, ads: [], meta: null });
      if (u === "/api/me/feed-ad-requests") {
        listCalls += 1;
        return json({ ok: true, requests: [row], canCreateBanner: false });
      }
      if (u.startsWith("/api/me/feed-ad-requests?domain=")) return json({ ok: true, catalog });
      if (u === "/api/me/points/promotion-orders") return json({ orders: [] });
      if (u.endsWith("/renew") && init?.method === "POST") {
        const headers = new Headers(init.headers);
        const body = JSON.parse(String(init.body)) as { idempotencyKey: string; productId: string; expectedCost?: number };
        posts.push({
          key: headers.get("Idempotency-Key"),
          bodyKey: body.idempotencyKey,
          productId: body.productId,
          expectedCost: body.expectedCost,
        });
        const r = replies.shift() ?? { status: 200, body: { ok: true } };
        if (r === "network") return Promise.reject(new TypeError("network"));
        return json(r.body, r.status);
      }
      return json({});
    })
  );
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
  container.remove();
});

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};
const q = (sel: string) => container.querySelector(sel) as HTMLButtonElement | null;
const buttonWith = (text: string) =>
  [...container.querySelectorAll("[data-sheet] button")].find((b) => (b.textContent ?? "").includes(text)) as
    | HTMLButtonElement
    | undefined;

async function mount() {
  root = createRoot(container);
  await act(async () => root.render(<MyAdsPageClient />));
  await flush();
}
async function openSheet() {
  const btn = q('[data-testid="feed-ad-renew-req-1"]');
  expect(btn).toBeTruthy();
  await act(async () => btn!.click());
  await flush();
  expect(q('[data-testid="feed-ad-renew-sheet"]')).toBeTruthy();
}
async function confirm() {
  await act(async () => q('[data-testid="feed-ad-renew-confirm"]')!.click());
  await flush();
}

describe("FB-M13 피드 배너 연장 — 같은 결제 시도는 같은 키", () => {
  it("응답이 끊긴 뒤 다시 누르면 같은 키(서버가 처음 결과를 돌려준다)", async () => {
    replies = ["network", { status: 200, body: { ok: true, idempotentReplay: true } }];
    await mount();
    await openSheet();
    await confirm();
    expect(container.textContent).toContain("연장 결과를 확인하지 못했습니다");
    await confirm();
    expect(posts).toHaveLength(2);
    expect(posts[0]!.key).toBeTruthy();
    expect(posts[1]!.key).toBe(posts[0]!.key);
    expect(posts[0]!.bodyKey).toBe(posts[0]!.key);
  });

  it("2xx 로 끝난 뒤 새 연장은 다른 키", async () => {
    replies = [{ status: 200, body: { ok: true } }, { status: 200, body: { ok: true } }];
    await mount();
    await openSheet();
    await confirm();
    expect(q('[data-testid="feed-ad-renew-sheet"]')).toBeNull();
    await openSheet();
    await confirm();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });

  it("5xx 뒤 다시 누르면 같은 키", async () => {
    replies = [{ status: 502, body: { ok: false, error: "refund_pending" } }, { status: 200, body: { ok: true } }];
    await mount();
    await openSheet();
    await confirm();
    await confirm();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).toBe(posts[0]!.key);
  });

  it("4xx(잔액 부족) 로 확정되면 다음 시도는 새 키", async () => {
    replies = [{ status: 402, body: { ok: false, error: "insufficient_balance" } }, { status: 200, body: { ok: true } }];
    await mount();
    await openSheet();
    await confirm();
    await confirm();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });

  it("끊김 뒤 창을 닫았다 다시 열면 그 상품(14일)이 골라져 있고 같은 키·같은 상품으로 보낸다", async () => {
    replies = ["network", { status: 200, body: { ok: true } }];
    await mount();
    await openSheet();
    await act(async () => buttonWith("14일")!.click());
    await confirm();
    await act(async () => buttonWith("common_cancel")!.click());
    await flush();
    await openSheet();
    expect(buttonWith("14일")!.getAttribute("data-selected")).toBe("true");
    await confirm();
    expect(posts.map((p) => p.productId)).toEqual(["feed_14", "feed_14"]);
    expect(posts[1]!.key).toBe(posts[0]!.key);
  });

  it("409 idempotency_consumed → 「이미 처리된 연장입니다」 + 목록 다시 불러옴", async () => {
    replies = [{ status: 409, body: { ok: false, error: "idempotency_consumed" } }];
    await mount();
    const before = listCalls;
    await openSheet();
    await confirm();
    expect(container.textContent).toContain("이미 처리된 연장입니다");
    expect(listCalls).toBeGreaterThan(before);
    expect(q('[data-testid="feed-ad-renew-sheet"]')).toBeNull();
  });
});

describe("D-01 (2026-11-07) 연장 가격 확인", () => {
  it("화면에 보인 선택 상품 가격을 expectedCost 로 보낸다", async () => {
    await mount();
    await openSheet();
    await act(async () => buttonWith("14일")!.click());
    await confirm();
    expect(posts[0]).toMatchObject({ productId: "feed_14", expectedCost: 12000 });
  });

  it("409 price_changed → 「가격이 바뀌었습니다」 · 창에 새 가격 · 다시 누르면 새 키·새 가격", async () => {
    replies = [
      { status: 409, body: { ok: false, error: "price_changed", pointCost: 9000, durationDays: 7 } },
      { status: 200, body: { ok: true } },
    ];
    await mount();
    await openSheet();
    await confirm();
    expect(q('[data-testid="feed-ad-renew-error"]')?.textContent).toContain("가격이 바뀌었습니다");
    expect(q('[data-testid="feed-ad-renew-sheet"]')?.textContent).toContain("9000P");
    await confirm();
    expect(posts).toHaveLength(2);
    expect(posts[0]!.expectedCost).toBe(7000);
    expect(posts[1]!.expectedCost).toBe(9000);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });
});
