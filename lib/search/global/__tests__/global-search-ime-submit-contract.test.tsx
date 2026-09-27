// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adapterFns = vi.hoisted(() => ({
  community: vi.fn(async (_query: string) => ({ ok: true as const, posts: [] })),
  trade: vi.fn(async (_query: string) => ({ ok: true as const, products: [] })),
  delivery: vi.fn(async (_query: string) => ({ ok: true as const, stores: [], menus: [] })),
  chat: vi.fn(async (_query: string) => ({ ok: true as const, hits: [] })),
}));

const recentApi = vi.hoisted(() => ({
  add: vi.fn((keyword: string) => [{ keyword, createdAt: "2026-01-01T00:00:00.000Z" }]),
  get: vi.fn((): { keyword: string; createdAt: string }[] => []),
  remove: vi.fn((keyword: string) => [{ keyword, createdAt: "" }]),
}));

const routerApi = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));

const hydrateApi = vi.hoisted(() => {
  const scope = { mode: "all" as const };
  const locGate = {
    canFetch: true,
    locationAll: true,
    lguCityId: null as string | null,
    radiusKm: null as number | null,
  };
  const i18n = {
    t: (key: string) => key,
    safeT: (_key: string, opts?: { fallbackKo?: string; fallbackEn?: string }) =>
      opts?.fallbackKo ?? opts?.fallbackEn ?? _key,
  };
  return { scope, locGate, i18n };
});

vi.mock("next/navigation", () => ({
  useRouter: () => routerApi,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/search",
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => hydrateApi.i18n,
}));
vi.mock("@/lib/search/global/adapters/community-search-adapter", () => ({
  searchCommunityForGlobal: adapterFns.community,
}));
vi.mock("@/lib/search/global/adapters/trade-search-adapter", () => ({
  searchTradeForGlobal: adapterFns.trade,
}));
vi.mock("@/lib/search/global/adapters/delivery-search-adapter", () => ({
  searchDeliveryForGlobal: adapterFns.delivery,
}));
vi.mock("@/lib/search/global/adapters/chat-search-adapter", () => ({
  searchChatForGlobal: adapterFns.chat,
}));
vi.mock("@/lib/search/global/recent-searches", () => ({
  addGlobalRecentSearch: (keyword: string) => recentApi.add(keyword),
  getGlobalRecentSearches: () => recentApi.get(),
  removeGlobalRecentSearch: (keyword: string) => recentApi.remove(keyword),
}));
vi.mock("@/lib/trade/location/use-trade-marketplace-location-hydrate", () => ({
  useTradeMarketplaceLocationHydrate: () => ({ scope: hydrateApi.scope }),
}));
vi.mock("@/lib/trade/marketplace/client-location-fetch", () => ({
  marketplaceLocationFetchGate: () => hydrateApi.locGate,
}));
vi.mock("@/lib/dibay/use-delivery-list-scroll-restore", () => ({
  useDeliveryListScrollRestore: () => {},
}));
vi.mock("@/lib/dibay/delivery-list-scroll-restore", () => ({
  buildDeliveryListScrollRouteKey: () => "search",
  saveDeliveryListScrollBeforeStoreNavigation: () => {},
}));
vi.mock("@/lib/trade/location/trade-list-return-href", () => ({
  rememberTradeListReturnHref: () => {},
}));
vi.mock("@/lib/dibay/store-detail-seed-patch-trace", () => ({
  markStoreDetailListSeedNavigation: () => {},
}));
vi.mock("@/lib/navigation/navigate-to-delivery-store-product", () => ({
  navigateToDeliveryStoreCard: () => {},
  navigateToDeliveryStoreProduct: () => {},
}));
vi.mock("@/lib/stores/presentation/resolve-store-list-card-badges", () => ({
  formatStoreCardOutOfRangeLabel: () => null,
}));
vi.mock("@/lib/community-messenger/community-messenger-room-forward-navigation", () => ({
  runCommunityMessengerRoomForwardNavigation: () => {},
}));
vi.mock("@/lib/community-messenger/cm-home-list-copy", () => ({
  getRoomTypeBadgeLabel: () => "",
}));
vi.mock("@/lib/auth/viewer-user-id", () => ({
  getViewerUserId: () => null,
}));
vi.mock("@/components/community/CommunityPostCard", () => ({
  CommunityPostCard: () => null,
}));
vi.mock("@/components/product/ProductCard", () => ({
  ProductCard: () => null,
}));
vi.mock("@/components/common/SamarketThumbnail", () => ({
  SamarketThumbnail: () => null,
}));
vi.mock("@/lib/layout/main-bottom-nav-hub-clearance", () => ({
  MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS: "",
}));

import {
  MainTier1ExtrasProvider,
  useMainTier1ExtrasOptional,
} from "@/contexts/MainTier1ExtrasContext";

const { GlobalSearchView } = await import("@/components/search/global/GlobalSearchView");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeInputValue(input: HTMLInputElement, value: string, isComposing?: boolean) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(input, value);
  const event = new InputEvent("input", { bubbles: true, data: value });
  if (typeof isComposing === "boolean") {
    Object.defineProperty(event, "isComposing", { value: isComposing });
  }
  input.dispatchEvent(event);
}

function searchInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[type="search"]');
  if (!el) throw new Error("search input missing");
  return el;
}

function StickyHost() {
  const extras = useMainTier1ExtrasOptional()?.extras ?? null;
  return <div data-sticky-host="">{extras?.stickyBelow ?? null}</div>;
}

describe("global search IME / submit contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function renderView() {
    act(() => {
      root.render(
        <MainTier1ExtrasProvider>
          <GlobalSearchView />
          <StickyHost />
        </MainTier1ExtrasProvider>
      );
    });
  }

  function beginDebounceClock() {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  }

  function advanceDebounce(ms = 250) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    adapterFns.community.mockClear();
    adapterFns.trade.mockClear();
    adapterFns.delivery.mockClear();
    adapterFns.chat.mockClear();
    recentApi.add.mockClear();
    recentApi.get.mockReset();
    recentApi.get.mockReturnValue([]);
    recentApi.remove.mockClear();
    routerApi.replace.mockClear();
    routerApi.push.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("T2 — composing intermediate input does not dispatch domain search", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    const input = searchInput(container);
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      setNativeInputValue(input, "ㄷ", true);
    });
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디", true);
      setNativeInputValue(searchInput(container), "딥", true);
      setNativeInputValue(searchInput(container), "디바", true);
    });
    await flush();
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).not.toHaveBeenCalled();
    expect(adapterFns.trade).not.toHaveBeenCalled();
    expect(adapterFns.delivery).not.toHaveBeenCalled();
    expect(adapterFns.chat).not.toHaveBeenCalled();
  });

  it("T3 — submit during composition does not commit URL, recent, or search", async () => {
    renderView();
    await flush();
    const input = searchInput(container);
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      setNativeInputValue(input, "디", true);
    });
    await flush();
    act(() => {
      searchInput(container).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    await flush();
    expect(routerApi.replace).not.toHaveBeenCalled();
    expect(recentApi.add).not.toHaveBeenCalled();
    expect(adapterFns.community).not.toHaveBeenCalled();
  });

  it("T4 — composition end commits 디바이 and allows debounce search", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      searchInput(container).dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이", true);
    });
    await flush();
    act(() => {
      searchInput(container).dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "디바이" }));
    });
    await flush();
    expect(searchInput(container).value).toBe("디바이");
    expect(adapterFns.community).not.toHaveBeenCalled();
    advanceDebounce(250);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
  });

  it("T5 — normal submit cancels pending debounce and runs one search", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    expect(adapterFns.community).not.toHaveBeenCalled();
    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    expect(routerApi.replace).toHaveBeenCalledTimes(1);
    expect(routerApi.replace.mock.calls[0]?.[0]).toBe(`/search?q=${encodeURIComponent("디바이")}`);
    expect(recentApi.add).toHaveBeenCalledTimes(1);
    expect(recentApi.add.mock.calls[0]?.[0]).toBe("디바이");
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.trade).toHaveBeenCalledTimes(1);
    expect(adapterFns.delivery).toHaveBeenCalledTimes(1);
    expect(adapterFns.chat).toHaveBeenCalledTimes(1);
  });

  it("T6 — button submit uses the same one-search contract", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    act(() => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    await flush();
    expect(routerApi.replace).toHaveBeenCalledTimes(1);
    expect(recentApi.add).toHaveBeenCalledTimes(1);
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
  });

  it("T7 — recent click uses canonical submitSearch", async () => {
    recentApi.get.mockReturnValue([{ keyword: "디바이", createdAt: "2026-01-01T00:00:00.000Z" }]);
    beginDebounceClock();
    renderView();
    await flush();
    const recentBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "디바이");
    expect(recentBtn).toBeTruthy();
    act(() => {
      recentBtn?.click();
    });
    await flush();
    expect(routerApi.replace).toHaveBeenCalledTimes(1);
    expect(routerApi.replace.mock.calls[0]?.[0]).toBe(`/search?q=${encodeURIComponent("디바이")}`);
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
  });

  it("T8 — typing then submit within 250ms runs the same query once", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디");
    });
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
  });

  it("S1 — typing 디바이 then submit before 250ms: same query search total = 1", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    expect(adapterFns.community).not.toHaveBeenCalled();
    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.trade).toHaveBeenCalledTimes(1);
    expect(adapterFns.delivery).toHaveBeenCalledTimes(1);
    expect(adapterFns.chat).toHaveBeenCalledTimes(1);
  });

  it("S2 — settled 디바이 submit does not suppress a later explicit 디바이 submit", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);

    adapterFns.community.mockClear();
    adapterFns.trade.mockClear();
    adapterFns.delivery.mockClear();
    adapterFns.chat.mockClear();

    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
    expect(adapterFns.trade).toHaveBeenCalledTimes(1);
    expect(adapterFns.delivery).toHaveBeenCalledTimes(1);
    expect(adapterFns.chat).toHaveBeenCalledTimes(1);
  });

  it("S3 — after 디바이, clear then type 디바이 again still searches", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);

    act(() => {
      setNativeInputValue(searchInput(container), "");
    });
    await flush();
    adapterFns.community.mockClear();
    adapterFns.trade.mockClear();
    adapterFns.delivery.mockClear();
    adapterFns.chat.mockClear();

    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    expect(adapterFns.community).not.toHaveBeenCalled();
    advanceDebounce(250);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
  });

  it("S3b — after 디바이, other query, then 디바이 again still searches", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);

    act(() => {
      setNativeInputValue(searchInput(container), "한인");
    });
    await flush();
    advanceDebounce(250);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(2);
    expect(adapterFns.community.mock.calls[1]?.[0]).toBe("한인");

    adapterFns.community.mockClear();
    adapterFns.trade.mockClear();
    adapterFns.delivery.mockClear();
    adapterFns.chat.mockClear();

    act(() => {
      setNativeInputValue(searchInput(container), "디바이");
    });
    await flush();
    advanceDebounce(250);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
  });

  it("S4 — compositionend 디바이 then immediate submit: cancel pending debounce, search = 1", async () => {
    beginDebounceClock();
    renderView();
    await flush();
    act(() => {
      searchInput(container).dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    await flush();
    act(() => {
      setNativeInputValue(searchInput(container), "디바이", true);
    });
    await flush();
    act(() => {
      searchInput(container).dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "디바이" }));
    });
    await flush();
    expect(searchInput(container).value).toBe("디바이");
    expect(adapterFns.community).not.toHaveBeenCalled();

    act(() => {
      searchInput(container).form?.requestSubmit();
    });
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.community.mock.calls[0]?.[0]).toBe("디바이");
    advanceDebounce(400);
    await flush();
    expect(adapterFns.community).toHaveBeenCalledTimes(1);
    expect(adapterFns.trade).toHaveBeenCalledTimes(1);
    expect(adapterFns.delivery).toHaveBeenCalledTimes(1);
    expect(adapterFns.chat).toHaveBeenCalledTimes(1);
  });
});
