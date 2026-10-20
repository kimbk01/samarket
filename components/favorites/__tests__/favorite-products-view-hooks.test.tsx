// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";

/** D2 — 찜 목록: 로딩 → 데이터 전환·탭 전환·0개 전환 시 React 훅 순서 오류(#310) 없음 */

let favoritesResult: { items: FavoritedPost[]; authenticated: boolean; error?: boolean };

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/favorites/getFavoritedPosts", () => ({
  getFavoritedPosts: async () => favoritesResult,
}));
vi.mock("@/components/favorites/FavoritePostCard", () => ({
  FavoritePostCard: ({ post, onUnfavorite }: { post: FavoritedPost; onUnfavorite: () => void }) => (
    <button type="button" data-testid="fav-card" onClick={onUnfavorite}>
      {String(post.id)}
    </button>
  ),
}));
vi.mock("@/components/mypage/TradeManagementTabBar", () => ({
  TradeManagementTabBar: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" data-testid="tab-sold" onClick={() => onChange("sold")}>
      sold
    </button>
  ),
}));

function post(id: string): FavoritedPost {
  return { id, title: id, price: 100, status: "active" } as unknown as FavoritedPost;
}

let container: HTMLDivElement;
let root: Root;
const errors: unknown[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container, { onUncaughtError: (e) => errors.push(e), onCaughtError: (e) => errors.push(e) });
  errors.length = 0;
  vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args[0]));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderView() {
  const { FavoriteProductsView } = await import("@/components/favorites/FavoriteProductsView");
  await act(async () => {
    root.render(<FavoriteProductsView />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("FavoriteProductsView hook order (D2)", () => {
  it("찜 2개: 로딩 후 목록 표시, 훅 오류 없음", async () => {
    favoritesResult = { items: [post("p1"), post("p2")], authenticated: true };
    await renderView();
    expect(container.querySelectorAll("[data-testid=fav-card]").length).toBe(2);
    expect(errors).toEqual([]);
  });

  it("탭 전환·마지막 찜 해제(0개) 전환도 오류 없음", async () => {
    favoritesResult = { items: [post("p1")], authenticated: true };
    await renderView();
    await act(async () => {
      (container.querySelector("[data-testid=tab-sold]") as HTMLButtonElement | null)?.click();
    });
    expect(errors).toEqual([]);
  });

  it("찜 0개: 빈 안내", async () => {
    favoritesResult = { items: [], authenticated: true };
    await renderView();
    expect(container.textContent).toContain("ui_fav_empty_title");
    expect(errors).toEqual([]);
  });

  it("D10·D11: 조회 오류는 빈 목록·로그인 이동이 아니라 오류 + 다시 시도", async () => {
    favoritesResult = { items: [], authenticated: true, error: true };
    await renderView();
    expect(container.textContent).toContain("ui_fav_load_failed");
    expect(container.textContent).toContain("common_retry");
    expect(container.textContent).not.toContain("ui_fav_empty_title");
    expect(errors).toEqual([]);
  });
});
