/** @vitest-environment jsdom */
import { createElement } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/stores/owner/settlements";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import {
  notifyOwnerAdminUrlSearchChanged,
  useOwnerAdminUrlSearchParams,
} from "@/lib/business/use-owner-admin-url-search-params";

function Probe() {
  const storeId = useOwnerAdminUrlSearchParams().get("storeId");
  return createElement("p", null, storeId ? `ledger:${storeId}` : "guide");
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useOwnerAdminUrlSearchParams hydration", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
    mockPathname = "/stores/owner/settlements";
  });

  it("hydrates SSR markup without mismatch, then follows the URL query", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Probe));
    document.body.appendChild(container);
    expect(container.textContent).toBe("guide");

    window.history.replaceState(null, "", "/stores/owner/settlements?storeId=abc");
    const errors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, createElement(Probe), {
        onRecoverableError: (e) => errors.push(e),
      });
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("ledger:abc");

    // replaceState + notify
    window.history.replaceState(null, "", "/stores/owner/settlements?storeId=def");
    await act(async () => notifyOwnerAdminUrlSearchChanged());
    expect(container.textContent).toBe("ledger:def");

    // soft navigation: pathname tick without popstate / notify
    window.history.pushState(null, "", "/stores/owner/orders?storeId=xyz");
    mockPathname = "/stores/owner/orders";
    await act(async () => root.render(createElement(Probe)));
    expect(container.textContent).toBe("ledger:xyz");

    act(() => root.unmount());
  });
});
