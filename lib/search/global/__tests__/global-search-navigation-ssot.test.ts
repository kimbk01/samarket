import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBottomNavEligibleRoute } from "@/lib/navigation/bottom-nav-route-policy";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import {
  GLOBAL_SEARCH_HREF,
  GLOBAL_SEARCH_NO_ORIGIN_FALLBACK,
  captureExactOriginHref,
  clearGlobalSearchEntryOrigin,
  closeGlobalSearch,
  getGlobalSearchEntryOrigin,
  normalizeExactOriginHref,
  openGlobalSearchFromHere,
  resolveGlobalSearchCloseHref,
  setGlobalSearchEntryOrigin,
} from "@/lib/search/global/global-search-navigation-ssot";

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("global search entry / close / return SSOT", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    clearGlobalSearchEntryOrigin();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    clearGlobalSearchEntryOrigin();
    vi.unstubAllGlobals();
  });

  it("E7–E10 — exact origin is pathname + search + hash, never abbreviated", () => {
    expect(normalizeExactOriginHref("/philife?topic=food#feed")).toBe("/philife?topic=food#feed");
    expect(normalizeExactOriginHref("/market?region=qc&category=used#feed")).toBe(
      "/market?region=qc&category=used#feed"
    );
    expect(normalizeExactOriginHref("/stores/browse?sub=chicken&category=food")).toBe(
      "/stores/browse?sub=chicken&category=food"
    );
    expect(normalizeExactOriginHref("/community-messenger?section=chats")).toBe(
      "/community-messenger?section=chats"
    );
  });

  it("E8 — trade query/hash survives open then Header Back / Close X", () => {
    const origin = "/market?region=qc&category=used#feed";
    const router = { push: vi.fn(), replace: vi.fn() };
    openGlobalSearchFromHere(router, origin);
    expect(router.push).toHaveBeenCalledWith(GLOBAL_SEARCH_HREF);
    expect(getGlobalSearchEntryOrigin()).toBe(origin);
    expect(resolveGlobalSearchCloseHref()).toBe(origin);

    closeGlobalSearch(router);
    expect(router.replace).toHaveBeenCalledWith(origin);
    expect(getGlobalSearchEntryOrigin()).toBeNull();
  });

  it("E11 — Header Back and Close X share closeGlobalSearch", () => {
    const view = read("components/search/global/GlobalSearchView.tsx");
    expect(view).toContain("closeGlobalSearch(router)");
    expect(view).toContain('data-global-search-header-back="true"');
    expect(view).toContain('data-global-search-close="true"');
    expect(view).toContain("onClose={closeSearch}");
    expect(view.match(/onClose=\{closeSearch\}/g)?.length).toBe(2);
    expect(view).not.toContain("runHistoryBackWithFallback");
    expect(view).not.toContain('backHref: "/market"');
  });

  it("E12 / E20 — Query Clear X empties query only and is a different CTA", () => {
    const bar = read("components/search/SearchInputBar.tsx");
    expect(bar).toContain('data-global-search-clear-query="true"');
    expect(bar).toContain('onClick={() => onChange("")}');
    expect(bar).toContain("global_search_clear_query");
    expect(bar).not.toContain("closeGlobalSearch");
    expect(bar).not.toContain("router.");
    const view = read("components/search/global/GlobalSearchView.tsx");
    expect(view).toContain("global_search_close");
    expect(view).not.toContain("data-global-search-clear-query");
  });

  it("E13 / E14 — result click keeps destination + /search?q= return SSOT", () => {
    const view = read("components/search/global/GlobalSearchView.tsx");
    expect(view).toContain("originHrefOverride");
    expect(view).toContain("returnHrefOverride");
    expect(view).toContain("globalSearchHref");
    expect(view).not.toContain("closeGlobalSearch(router,");
    expect(view).not.toContain("getGlobalSearchEntryOrigin");
  });

  it("E15 — BottomNav /search stays UNMOUNTED", () => {
    expect(isBottomNavEligibleRoute("/search")).toBe(false);
    expect(isBottomNavEligibleRoute("/search?q=치킨")).toBe(false);
  });

  it("E16 — no-origin deep-link uses /philife, never accidental /market", () => {
    expect(getGlobalSearchEntryOrigin()).toBeNull();
    expect(resolveGlobalSearchCloseHref()).toBe(GLOBAL_SEARCH_NO_ORIGIN_FALLBACK);
    expect(GLOBAL_SEARCH_NO_ORIGIN_FALLBACK).toBe("/philife");
    const router = { replace: vi.fn() };
    closeGlobalSearch(router);
    expect(router.replace).toHaveBeenCalledWith("/philife");
    expect(router.replace).not.toHaveBeenCalledWith("/market");
    expect(resolveMainTier1Subpage("/search")?.backHref).toBe("/philife");
    expect(resolveMainTier1Subpage("/search")?.backHref).not.toBe("/market");
  });

  it("E16b — stored origin is used; fallback never fires on magnifier flow", () => {
    setGlobalSearchEntryOrigin("/stores/browse?sub=chicken");
    expect(resolveGlobalSearchCloseHref()).toBe("/stores/browse?sub=chicken");
    expect(resolveGlobalSearchCloseHref()).not.toBe(GLOBAL_SEARCH_NO_ORIGIN_FALLBACK);
  });

  it("E17 — 4 live entries use OPEN authority, not bare /search navigation", () => {
    const communityTrade = read("components/layout/RegionBarMainHubTier1.tsx");
    const delivery = read("components/stores/home/hub/StoresConsumerHeaderActions.tsx");
    const messenger = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(communityTrade).toContain('openGlobalSearchFromHere(router, { domain: "community" })');
    expect(communityTrade).toContain('openGlobalSearchFromHere(router, { domain: "trade" })');
    expect(communityTrade).not.toContain('href="/search"');
    expect(delivery).toContain('openGlobalSearchFromHere(router, { domain: "delivery" })');
    expect(delivery).not.toContain('href="/search"');
    expect(messenger).toContain('openGlobalSearchFromHere(router, { domain: "chat" })');
    expect(messenger).not.toContain('router.push("/search")');
  });

  it("E1–E6 — open does not focus; field remains user-focusable; IME untouched", () => {
    const view = read("components/search/global/GlobalSearchView.tsx");
    const bar = read("components/search/SearchInputBar.tsx");
    const sticky = view.slice(
      view.indexOf("function GlobalSearchStickyInput"),
      view.indexOf("function ChatKindSection")
    );
    expect(sticky).not.toContain("autoFocus");
    expect(sticky).not.toContain(".focus(");
    expect(bar).toContain("autoFocus = false");
    expect(bar).not.toContain("disabled");
    expect(bar).not.toContain("readOnly");
    expect(bar).not.toContain(".focus(");
    expect(bar).toContain("event.nativeEvent.isComposing");
    expect(bar).not.toContain("onCompositionStart");
    expect(bar).not.toContain("onCompositionEnd");
    expect(bar).not.toContain("onCompositionUpdate");
    expect(bar).not.toContain("composingRef");
    expect(view).not.toContain("composingRef");
  });

  it("E18 — GlobalSearchStickyInput has no hardcoded autoFocus", () => {
    const view = read("components/search/global/GlobalSearchView.tsx");
    const sticky = view.slice(
      view.indexOf("function GlobalSearchStickyInput"),
      view.indexOf("function ChatKindSection")
    );
    expect(sticky).toContain("<SearchInputBar");
    expect(sticky).not.toContain("autoFocus");
    expect(read("components/search/SearchInputBar.tsx")).toContain("autoFocus = false");
  });

  it("E19 — /search chrome is Search Close X, not MyHub quick actions", () => {
    const resolved = resolveMainTier1Subpage("/search");
    expect(resolved?.showHubQuickActions).toBe(false);
    expect(resolved?.preferHistoryBack).toBe(false);
    const view = read("components/search/global/GlobalSearchView.tsx");
    expect(view).toContain("showHubQuickActions: false");
    expect(view).toContain('data-global-search-close="true"');
    expect(view).not.toContain("MyHubHeaderActions");
  });

  it("does not put origin in public /search?from=", () => {
    const ssot = read("lib/search/global/global-search-navigation-ssot.ts");
    expect(ssot).not.toMatch(/\?from=/);
    expect(ssot).not.toContain("searchParams.set(\"from\"");
    expect(ssot).toContain("dibay_global_search_entry_origin_v1");
    expect(ssot).toContain("router.push(GLOBAL_SEARCH_HREF)");
  });

  it("rejects /search itself as origin so result-return SSOT is not overwritten", () => {
    expect(normalizeExactOriginHref("/search")).toBe("");
    expect(normalizeExactOriginHref("/search?q=치킨")).toBe("");
    expect(captureExactOriginHref("/search?q=치킨#hit")).toBe("");
    setGlobalSearchEntryOrigin("/philife");
    openGlobalSearchFromHere({ push: vi.fn() }, "/search?q=치킨");
    expect(getGlobalSearchEntryOrigin()).toBe("/philife");
  });
});
