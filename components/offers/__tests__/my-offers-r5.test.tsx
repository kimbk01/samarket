// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PriceOfferListItem } from "@/lib/offers/types";

/** S23 — 받은/보낸 탭, 거절은 확인 후에만 API, 기존 경로 리다이렉트 */
const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/mypage/offers",
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/mypage/mypage-home-summary-client", () => ({
  invalidateMypageSummary: vi.fn(),
  getMypageHomeSummaryState: () => null,
}));
vi.mock("@/lib/mypage/mypage-toast", () => ({ showMypageToast: vi.fn(), showMypageUndoToast: vi.fn() }));
vi.mock("@/components/common/SamarketThumbnail", () => ({ SamarketThumbnail: () => null }));
let confirmOpenProps: { open: boolean; onConfirm: () => void; title: string }[] = [];
vi.mock("@/components/ui/MobileConfirmBottomSheet", () => ({
  MobileConfirmBottomSheet: (p: { open: boolean; onConfirm: () => void; title: string }) => {
    confirmOpenProps.push(p);
    return p.open ? (
      <button type="button" data-testid={`confirm-${p.title}`} onClick={p.onConfirm}>
        confirm
      </button>
    ) : null;
  },
}));

function offer(id: string, status: PriceOfferListItem["status"] = "pending"): PriceOfferListItem {
  return {
    id,
    productId: `prod-${id}`,
    buyerId: "b",
    sellerId: "s",
    originalPrice: 1000,
    offeredPrice: 800,
    message: null,
    status,
    createdAt: "2026-10-20T00:00:00Z",
    updatedAt: "2026-10-20T00:00:00Z",
    productTitle: `title-${id}`,
    productThumbnailUrl: null,
    productStatus: "active",
    productHref: `/post/prod-${id}`,
    buyerNickname: null,
    sellerNickname: null,
  };
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/offers/received") return new Response(JSON.stringify({ offers: [offer("o1")] }), { status: 200 });
  if (url === "/api/offers/mine") return new Response(JSON.stringify({ offers: [] }), { status: 200 });
  if (init?.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
  return new Response("{}", { status: 404 });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  confirmOpenProps = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  const { forgetMypageListCache } = await import("@/lib/mypage/use-mypage-cursor-list");
  forgetMypageListCache();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("S23 가격 제안", () => {
  it("기본 탭 규칙: ?tab 없거나 모르는 값 → 받은 제안", async () => {
    const { resolveMyOffersTab } = await import("@/components/offers/MyOffersTabsScreen");
    expect(resolveMyOffersTab(null)).toBe("received");
    expect(resolveMyOffersTab("x")).toBe("received");
    expect(resolveMyOffersTab("sent")).toBe("sent");
  });

  it("기존 경로 리다이렉트 → /mypage/offers?tab=…", async () => {
    (await import("@/app/(main)/mypage/offers/received/page")).default();
    (await import("@/app/(main)/mypage/offers/sent/page")).default();
    (await import("@/app/(main)/my/offers/received/page")).default();
    (await import("@/app/(main)/my/offers/sent/page")).default();
    expect(redirect.mock.calls.map((c) => c[0])).toEqual([
      "/mypage/offers?tab=received",
      "/mypage/offers?tab=sent",
      "/mypage/offers?tab=received",
      "/mypage/offers?tab=sent",
    ]);
  });

  it("거절은 확인 시트 확인 후에만 API 호출", async () => {
    const { MyOffersView } = await import("@/components/offers/MyOffersView");
    await act(async () => {
      root.render(<MyOffersView mode="received" emptyLabel="empty" />);
    });
    await flush();
    expect(container.textContent).toContain("title-o1");
    await act(async () => {
      (container.querySelector("[data-testid=offer-reject]") as HTMLButtonElement).click();
    });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reject"))).toBe(false);
    const confirm = container.querySelector('[data-testid="confirm-mypage_r5_offer_reject_confirm_title"]') as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    await act(async () => {
      confirm.click();
    });
    await flush();
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/offers/o1/reject")).toBe(true);
    expect(container.textContent).toContain("ui_offer_status_rejected");
  });

  it("상태 라벨은 i18n 키(한국어 하드코딩 없음)", () => {
    const src = readFileSync(resolve(process.cwd(), "components/offers/MyOffersView.tsx"), "utf8");
    expect(src).not.toMatch(/판매자 응답 대기|수락됨|거절됨|철회함|네트워크 오류|채팅 이어가기|"상품"|"판매자"/);
    expect(src).not.toMatch(/text-white|amber-|emerald-|red-\d/);
  });
});
