import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAddressFlowExitHref,
  peekAddressFlowExitHref,
  resolveAddressManagementExitHref,
  writeAddressFlowExitHref,
} from "@/lib/addresses/mypage-address-flow-exit";

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

  it("prefers returnTo query over session", () => {
    writeAddressFlowExitHref("/stores");
    expect(resolveAddressManagementExitHref("/market")).toBe("/market");
  });

  it("falls back to session when returnTo is absent", () => {
    writeAddressFlowExitHref("/stores");
    expect(resolveAddressManagementExitHref(null)).toBe("/stores");
    expect(peekAddressFlowExitHref()).toBe("/stores");
  });

  it("ignores unsafe exit href", () => {
    writeAddressFlowExitHref("//evil.example");
    expect(peekAddressFlowExitHref()).toBe("");
  });
});
