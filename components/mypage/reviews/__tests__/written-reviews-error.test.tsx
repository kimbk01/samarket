// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** S24 — 보낸 후기 500 = 오류 상태(빈 목록 아님), 페이지 모드 호출 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/mypage/trade/reviews",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/lib/mypage/use-mypage-list-restore", () => ({ useMypageListRestore: () => ({}) }));
vi.mock("@/components/common/SamarketThumbnail", () => ({ SamarketThumbnail: () => null }));

let status = 500;
const fetchMock = vi.fn(async (url: string) => {
  if (status !== 200) return new Response("{}", { status });
  return new Response(
    JSON.stringify({
      items: [
        {
          id: "w1",
          roomId: "",
          productId: "p1",
          title: "item-w1",
          thumbnail: "",
          price: 1500,
          revieweeId: "x",
          revieweeNickname: "nick",
          roleType: "buyer_to_seller",
          publicReviewType: "good",
          positiveTagKeys: [],
          negativeTagKeys: [],
          comment: "",
          isAnonymousNegative: false,
          createdAt: "2026-10-20T00:00:00Z",
        },
      ],
      next_cursor: null,
      total: url.includes("cursor") ? undefined : 1,
    }),
    { status: 200 }
  );
});

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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

async function render(onTotal?: (n: number) => void) {
  const { MyWrittenReviewsView } = await import("@/components/mypage/reviews/MyWrittenReviewsView");
  await act(async () => {
    root.render(<MyWrittenReviewsView variant="tabPanel" onTotal={onTotal} />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("S24 보낸 후기", () => {
  it("500 → 오류 + 다시 시도 (빈 문구 아님)", async () => {
    status = 500;
    await render();
    expect(container.querySelector("[data-testid=my-state-error]")).not.toBeNull();
    expect(container.textContent).not.toContain("mypage_comp_review_written_empty");
  });

  it("정상 → 페이지 모드(limit=20) 호출 + total 전달 + 페소 금액", async () => {
    status = 200;
    const onTotal = vi.fn();
    await render(onTotal);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/my/written-reviews?limit=20");
    expect(onTotal).toHaveBeenCalledWith(1);
    expect(container.textContent).toContain("item-w1");
    expect(container.textContent).not.toContain("KRW");
  });
});
