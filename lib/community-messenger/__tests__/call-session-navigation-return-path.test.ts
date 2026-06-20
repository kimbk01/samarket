import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidCallNavigationReturnPath,
  rememberCallNavigationReturnPath,
  takeCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";

describe("call-session-navigation-seed return path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects /mypage as call return path", () => {
    expect(isValidCallNavigationReturnPath("/mypage")).toBe(false);
    expect(isValidCallNavigationReturnPath("/login")).toBe(false);
    expect(isValidCallNavigationReturnPath("/")).toBe(false);
  });

  it("allows trade and store return paths", () => {
    expect(isValidCallNavigationReturnPath("/market")).toBe(true);
    expect(isValidCallNavigationReturnPath("/trade/post/abc")).toBe(true);
    expect(isValidCallNavigationReturnPath("/stores")).toBe(true);
    expect(isValidCallNavigationReturnPath("/community-messenger/rooms/abc")).toBe(true);
  });

  it("does not persist or consume stale /mypage return path", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal("window", {
      location: { pathname: "/mypage", search: "" },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    rememberCallNavigationReturnPath();
    expect(store.size).toBe(0);

    store.set("samarket.cm.call_return_path.v1", "/mypage");
    expect(takeCallNavigationReturnPath()).toBeNull();
    expect(store.has("samarket.cm.call_return_path.v1")).toBe(false);
  });
});
