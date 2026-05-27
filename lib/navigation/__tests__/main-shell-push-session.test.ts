import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  armMainShellPushEnterSession,
  consumeMainShellPushEnterSession,
  isCrossMainShellRouteGroup,
  pathFromHref,
} from "@/lib/navigation/main-shell-push-session";

describe("isCrossMainShellRouteGroup", () => {
  it("stores 허브 ↔ main 그룹", () => {
    expect(isCrossMainShellRouteGroup("/stores", "/philife")).toBe(true);
    expect(isCrossMainShellRouteGroup("/market", "/stores")).toBe(true);
    expect(isCrossMainShellRouteGroup("/philife", "/market")).toBe(false);
  });
});

describe("pathFromHref", () => {
  it("쿼리 제거", () => {
    expect(pathFromHref("/community-messenger?section=chats")).toBe("/community-messenger");
  });
});

describe("main shell push session", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
    vi.stubGlobal("window", { sessionStorage: sessionStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arm → consume 일치 경로", () => {
    armMainShellPushEnterSession("ltr", "/stores", "/community-messenger");
    const session = consumeMainShellPushEnterSession("/community-messenger");
    expect(session?.axis).toBe("ltr");
    expect(session?.fromPath).toBe("/stores");
    expect(consumeMainShellPushEnterSession("/community-messenger")).toBe(null);
  });

  it("목적지 불일치 — null", () => {
    armMainShellPushEnterSession("rtl", "/philife", "/community-messenger");
    expect(consumeMainShellPushEnterSession("/market")).toBe(null);
  });
});
