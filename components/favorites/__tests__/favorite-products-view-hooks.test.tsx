// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoritedPostPageItem } from "@/lib/favorites/getFavoritedPosts";

/** D2 — 찜 목록: 로딩 → 데이터 전환·탭 전환·0개 전환 시 React 훅 순서 오류(#310) 없음 + S22 되돌리기 */

let pageResult: {
  items: FavoritedPostPageItem[];
  authenticated: boolean;
  next_cursor: string | null;
  counts?: Record<string, number>;
} | Error;
const toggleFavorite = vi.fn(async (_id: string) => ({ ok: true as const, isFavorite: true }));
const undoToasts: Array<{ message: string; onUndo: () => void }> = [];
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/mypage/trade/favorites",
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/favorites/getFavoritedPosts", () => ({
  getFavoritedPostsPage: async () => {
    if (pageResult instanceof Error) throw pageResult;
    return pageResult;
  },
}));
vi.mock("@/lib/favorites/toggleFavorite", () => ({ toggleFavorite: (id: string) => toggleFavorite(id) }));
vi.mock("@/lib/mypage/mypage-toast", () => ({
  MYPAGE_TOAST_ACTION_MS: 5000,
  showMypageToast: vi.fn(),
  showMypageUndoToast: (message: string, onUndo: () => void) => undoToasts.push({ message, onUndo }),
}));
vi.mock("@/lib/mypage/mypage-home-summary-client", () => ({ invalidateMypageSummary: vi.fn() }));
vi.mock("@/lib/mypage/use-mypage-list-restore", () => ({ useMypageListRestore: () => ({}) }));
vi.mock("@/components/favorites/FavoritePostCard", () => ({
  FavoritePostCard: ({ post, onUnfavorite }: { post: FavoritedPostPageItem; onUnfavorite: () => void }) => (
    <button type="button" data-testid="fav-card" data-id={String(post.id)} onClick={onUnfavorite}>
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

function post(id: string): FavoritedPostPageItem {
  return { id, title: id, price: 100, status: "active", favorited_at: "2026-10-01T00:00:00Z" } as unknown as FavoritedPostPageItem;
}

let container: HTMLDivElement;
let root: Root;
const errors: unknown[] = [];

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container, { onUncaughtError: (e) => errors.push(e), onCaughtError: (e) => errors.push(e) });
  errors.length = 0;
  undoToasts.length = 0;
  toggleFavorite.mockClear();
  replace.mockClear();
  vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args[0]));
  const { forgetMypageListCache } = await import("@/lib/mypage/use-mypage-cursor-list");
  forgetMypageListCache();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderView() {
  const { FavoriteProductsView } = await import("@/components/favorites/FavoriteProductsView");
  await act(async () => {
    root.render(<FavoriteProductsView />);
  });
  await flush();
}

const ids = () => [...container.querySelectorAll("[data-testid=fav-card]")].map((b) => b.getAttribute("data-id"));

describe("FavoriteProductsView hook order (D2)", () => {
  it("찜 2개: 로딩 후 목록 표시, 훅 오류 없음", async () => {
    pageResult = { items: [post("p1"), post("p2")], authenticated: true, next_cursor: null, counts: { all: 2, active: 2, sold: 0, gone: 0 } };
    await renderView();
    expect(ids()).toEqual(["p1", "p2"]);
    expect(errors).toEqual([]);
  });

  it("탭 전환·마지막 찜 해제(0개) 전환도 오류 없음", async () => {
    pageResult = { items: [post("p1")], authenticated: true, next_cursor: null };
    await renderView();
    await act(async () => {
      (container.querySelector("[data-testid=tab-sold]") as HTMLButtonElement | null)?.click();
    });
    await flush();
    expect(errors).toEqual([]);
  });

  it("찜 0개: 빈 안내 + 둘러보기", async () => {
    pageResult = { items: [], authenticated: true, next_cursor: null };
    await renderView();
    expect(container.textContent).toContain("ui_fav_empty_title");
    expect(container.textContent).toContain("mypage_r5_trade_browse");
    expect(errors).toEqual([]);
  });

  it("D10·D11: 조회 오류는 빈 목록·로그인 이동이 아니라 오류 + 다시 시도", async () => {
    pageResult = new Error("500");
    await renderView();
    expect(container.textContent).toContain("ui_fav_load_failed");
    expect(container.textContent).toContain("common_retry");
    expect(container.textContent).not.toContain("ui_fav_empty_title");
    expect(replace).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it("비로그인(authenticated:false)만 로그인 이동", async () => {
    pageResult = { items: [], authenticated: false, next_cursor: null };
    await renderView();
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("/mypage/account"));
  });
});

describe("S22 찜 해제 [되돌리기] (C6)", () => {
  it("해제 → 즉시 제거 + 되돌리기 토스트 → toggleFavorite 재호출 + 원래 위치 복원", async () => {
    pageResult = { items: [post("p1"), post("p2"), post("p3")], authenticated: true, next_cursor: null };
    await renderView();
    await act(async () => {
      (container.querySelector('[data-id="p2"]') as HTMLButtonElement).click();
    });
    expect(ids()).toEqual(["p1", "p3"]);
    expect(undoToasts).toHaveLength(1);
    expect(undoToasts[0]!.message).toBe("mypage_r5_fav_unfavorited");
    await act(async () => {
      undoToasts[0]!.onUndo();
    });
    await flush();
    expect(toggleFavorite).toHaveBeenCalledWith("p2");
    expect(ids()).toEqual(["p1", "p2", "p3"]);
  });
});
