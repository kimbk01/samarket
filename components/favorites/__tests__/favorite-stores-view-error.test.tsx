// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** S22 매장 탭 — 조회 실패 = 오류 + 다시 시도, 로그인 이동 없음 */
let result: { items: unknown[]; authenticated: boolean; error?: boolean };
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/stores/get-favorited-stores-client", () => ({ getFavoritedStores: async () => result }));
vi.mock("@/components/favorites/FavoriteStoreRow", () => ({ FavoriteStoreRow: () => <div data-testid="store-row" /> }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  replace.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  const { FavoriteStoresView } = await import("@/components/favorites/FavoriteStoresView");
  await act(async () => {
    root.render(<FavoriteStoresView embedded />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("FavoriteStoresView", () => {
  it("500 → 오류 상태, 로그인 이동 안 함", async () => {
    result = { items: [], authenticated: true, error: true };
    await render();
    expect(container.querySelector("[data-testid=my-state-error]")).not.toBeNull();
    expect(container.textContent).toContain("ui_fav_load_failed");
    expect(replace).not.toHaveBeenCalled();
  });
  it("비로그인 → 로그인 이동", async () => {
    result = { items: [], authenticated: false };
    await render();
    expect(replace).toHaveBeenCalled();
  });
  it("빈 목록 → 빈 안내 + 매장 둘러보기 CTA(임베드에서도 표시)", async () => {
    result = { items: [], authenticated: true };
    await render();
    expect(container.textContent).toContain("ui_fav_store_empty_title");
    expect(container.textContent).toContain("ui_fav_store_go_stores");
  });
});
