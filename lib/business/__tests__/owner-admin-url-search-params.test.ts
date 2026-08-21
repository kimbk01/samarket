import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { notifyOwnerAdminUrlSearchChanged } from "@/lib/business/use-owner-admin-url-search-params";
import { replaceOwnerOrdersUrlQuery } from "@/lib/business/owner-orders-url";

describe("owner admin url search (layout Suspense escape)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { search: "?storeId=abc", href: "/stores/owner/orders?storeId=abc" },
      history: { state: null, replaceState: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifyOwnerAdminUrlSearchChanged dispatches owner-admin-url-search", () => {
    notifyOwnerAdminUrlSearchChanged();
    expect(window.dispatchEvent).toHaveBeenCalled();
    const ev = vi.mocked(window.dispatchEvent).mock.calls[0]?.[0] as Event;
    expect(ev.type).toBe("owner-admin-url-search");
  });

  it("replaceOwnerOrdersUrlQuery notifies search listeners after replaceState", () => {
    replaceOwnerOrdersUrlQuery({ storeId: "s1", tab: "new" });
    expect(window.history.replaceState).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});
