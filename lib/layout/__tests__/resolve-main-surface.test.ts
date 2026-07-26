import { describe, expect, it } from "vitest";
import {
  isCommunityHomeSurfacePath,
  resolveMainSurface,
} from "@/lib/layout/resolve-main-surface";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";

describe("resolveMainSurface", () => {
  it("maps community home hubs to community", () => {
    expect(resolveMainSurface("/")).toBe("community");
    expect(resolveMainSurface("/philife")).toBe("community");
    expect(resolveMainSurface("/community")).toBe("community");
    expect(resolveMainSurface("/philife/post/x")).toBe("community");
  });

  it("does not treat messenger as community prefix", () => {
    expect(resolveMainSurface("/community-messenger")).toBe("chat");
    expect(resolveMainSurface("/community-messenger/rooms/abc")).toBe("chat");
  });

  it("maps trade hubs", () => {
    expect(resolveMainSurface("/market")).toBe("trade");
    expect(resolveMainSurface("/market/jobs")).toBe("trade");
    expect(resolveMainSurface("/post/abc")).toBe("trade");
  });

  it("maps delivery / chat / mypage", () => {
    expect(resolveMainSurface("/stores")).toBe("delivery");
    expect(resolveMainSurface("/mypage")).toBe("mypage");
  });
});

describe("isCommunityHomeSurfacePath", () => {
  it("only home hubs", () => {
    expect(isCommunityHomeSurfacePath("/")).toBe(true);
    expect(isCommunityHomeSurfacePath("/philife")).toBe(true);
    expect(isCommunityHomeSurfacePath("/community")).toBe(true);
    expect(isCommunityHomeSurfacePath("/philife/post/x")).toBe(false);
    expect(isCommunityHomeSurfacePath("/market")).toBe(false);
  });
});

describe("isTradeFloatingMenuSurface — Cold Boot / must not be trade", () => {
  it("`/` is Community, not Trade floating surface", () => {
    expect(isTradeFloatingMenuSurface("/")).toBe(false);
    expect(isTradeFloatingMenuSurface("/philife")).toBe(false);
    expect(isTradeFloatingMenuSurface("/market")).toBe(true);
  });
});
