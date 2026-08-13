import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAddressFlowExitHref,
  peekAddressFlowExitHref,
  resolveAddressManagementExitHref,
  writeAddressFlowExitHref,
} from "@/lib/addresses/mypage-address-flow-exit";
import { openMemberAddressBook } from "@/lib/addresses/member-address-caller-context";

describe("mypage-address-flow-exit", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    clearAddressFlowExitHref();
    vi.unstubAllGlobals();
  });

  it("CallerContext authority beats returnTo query pathname", () => {
    openMemberAddressBook(
      { push: () => {}, replace: () => {} },
      {
        caller: "delivery_home",
        purpose: "select_delivery",
        apply: { kind: "set_default_delivery" },
        restore: { kind: "href", href: "/stores" },
      },
    );
    expect(resolveAddressManagementExitHref("/market")).toBe("/stores");
  });

  it("legacy writeAddressFlowExitHref becomes unknown caller context on same key", () => {
    writeAddressFlowExitHref("/stores");
    expect(resolveAddressManagementExitHref(null)).toBe("/stores");
    expect(peekAddressFlowExitHref()).toBe("/stores");
  });

  it("ignores unsafe exit href", () => {
    writeAddressFlowExitHref("//evil.example");
    expect(peekAddressFlowExitHref()).toBe("");
  });
});
