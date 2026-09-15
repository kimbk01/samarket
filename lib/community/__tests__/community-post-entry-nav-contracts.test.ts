import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_POST_SOURCE_FADE_MS,
  beginCommunityPostEntryFromCard,
  clearCommunityPostEntryNavigating,
  parseCommunityPostIdFromHref,
  prefersCommunityReducedMotion,
  resolveCommunityDetailBackHref,
  writeCommunityPostEntryOrigin,
} from "@/lib/community/community-post-entry-nav";

const root = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("community post-entry navigation contracts", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    clearCommunityPostEntryNavigating();
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
      ...globalThis.window,
      matchMedia: (q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
      location: { pathname: "/philife", search: "?category=question", origin: "https://samarket.local" },
    });
  });

  afterEach(() => {
    clearCommunityPostEntryNavigating();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("canonical CardShell owns post-entry transition authority", () => {
    const layouts = read("components/community/feed-list-layouts.tsx");
    expect(layouts).toContain("beginCommunityPostEntryFromCard");
    expect(layouts).toContain('data-community-nav="card-shell"');
    expect(layouts).toContain("router.push");
  });

  it("parseCommunityPostIdFromHref accepts post detail only", () => {
    expect(parseCommunityPostIdFromHref("/philife/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
    expect(parseCommunityPostIdFromHref("/philife/write")).toBeNull();
    expect(parseCommunityPostIdFromHref("/community-messenger/rooms/x")).toBeNull();
  });

  it("one effective navigation; rapid second tap does not navigate again", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const href = "/philife/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const first = beginCommunityPostEntryFromCard({
      href,
      event: { button: 0 },
      cardEl: null,
      navigate,
    });
    const second = beginCommunityPostEntryFromCard({
      href,
      event: { button: 0 },
      cardEl: null,
      navigate,
    });
    expect(first).toBe(true);
    expect(second).toBe(true);
    vi.advanceTimersByTime(COMMUNITY_POST_SOURCE_FADE_MS + 5);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(href);
  });

  it("reduced-motion navigates immediately with no artificial delay", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      location: { pathname: "/philife", search: "", origin: "https://samarket.local" },
    });
    expect(prefersCommunityReducedMotion()).toBe(true);
    const navigate = vi.fn();
    beginCommunityPostEntryFromCard({
      href: "/philife/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      event: { button: 0 },
      cardEl: null,
      navigate,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("Community-origin detail back resolves to exact origin; direct falls back to /philife", () => {
    const postId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    writeCommunityPostEntryOrigin({
      postId,
      originHref: "/philife?category=question",
      scrollY: 420,
    });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/philife?category=question");
    expect(resolveCommunityDetailBackHref({ postId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee" })).toBe(
      "/philife"
    );
    store.clear();
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/philife");
  });

  it("topic origin is preserved via origin href (not category rewrite)", () => {
    const postId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    writeCommunityPostEntryOrigin({
      postId,
      originHref: "/philife?nav=all&sort=popular",
      scrollY: 10,
    });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/philife?nav=all&sort=popular");
  });

  it("existing detail fade-in and topic R→L CSS remain", () => {
    const css = read("lib/community/community-design-tokens.css");
    expect(css).toContain("community-post-detail-fade-in");
    expect(css).toContain("community-topic-panel-slide-in");
    expect(css).toContain("community-post-source-fade-out");
    expect(css).toMatch(/community-post-source-fade-out[\s\S]*140ms/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*community-post-source-fade-out/);
    const detail = read("components/community/CommunityDetail.tsx");
    expect(detail).toContain("community-post-detail-fade-in");
    expect(detail).toContain("resolveCommunityDetailBackHref");
    expect(detail).not.toContain("CommunityPostDetailClient");
  });

  it("feed/cache authority files are not rewritten for navigation", () => {
    const nav = read("lib/community/community-post-entry-nav.ts");
    expect(nav).not.toContain("clearAllPhilifeFeedPersistentCaches");
    expect(nav).not.toContain("writePhilifeFeedCache");
    expect(nav).toContain("tryRestoreCommunityFeedScroll");
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain("tryRestoreCommunityFeedScroll");
  });
});
