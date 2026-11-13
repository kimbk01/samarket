// @vitest-environment jsdom
/**
 * HOME 「교민 이야기」 글 → 상세 ‹ 는 HOME 으로 (2026-11-14 · docs/audit/community-detail-back-from-home-2026-11-14.md).
 * 2026-11-09 앱 홈 분리로 `/`·`/home` 이 커뮤니티 별칭에서 빠지며 뒤로 목적지가 `/philife` 로 바뀌던 결함.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSafeCommunityReturnHref,
  resolveCommunityDetailBackHref,
  writeCommunityPostEntryOrigin,
} from "@/lib/community/community-post-entry-nav";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";
import {
  COMMUNITY_FIXED_BACK_OPTIONS,
  backAriaKey,
} from "@/components/community/post-detail/CommunityPostDetailHeader";

const postId = "70a5a9a0-4373-4847-8c19-cb57ec56f4e0";

function stubPreviousEntry(prevPath: string) {
  const origin = window.location.origin;
  const entries = [{ url: `${origin}${prevPath}`, index: 0 }, { url: `${origin}/philife/${postId}`, index: 1 }];
  vi.stubGlobal("navigation", { currentEntry: entries[1], entries: () => entries });
  (window as unknown as { navigation: unknown }).navigation = (globalThis as unknown as { navigation: unknown }).navigation;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe("상세 ‹ 목적지 — HOME 진입", () => {
  it("HOME(`/home`·`/`)은 돌아갈 수 있는 화면이다", () => {
    expect(isSafeCommunityReturnHref("/home")).toBe(true);
    expect(isSafeCommunityReturnHref("/")).toBe(true);
    expect(isSafeCommunityReturnHref("/admin")).toBe(false);
  });

  it("HOME 에서 연 글의 ‹ 목적지는 HOME", () => {
    writeCommunityPostEntryOrigin({ postId, originHref: "/home", scrollY: 0 });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/home");
    writeCommunityPostEntryOrigin({ postId, originHref: "/", scrollY: 0 });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/");
  });

  it("LOUNGE·검색·직접 진입은 그대로", () => {
    writeCommunityPostEntryOrigin({ postId, originHref: "/philife?category=phlifee", scrollY: 0 });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/philife?category=phlifee");
    writeCommunityPostEntryOrigin({ postId, originHref: "/search?q=a", scrollY: 0 });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/search?q=a");
    sessionStorage.clear();
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/philife");
  });

  it("바로 전 기록이 HOME 이면 상세를 바꾸지 않고 뒤로(pop) — 기록 중복 없음", () => {
    stubPreviousEntry("/home");
    const router = { back: vi.fn(), replace: vi.fn() };
    expect(runFixedDestinationBack(router, "/home", COMMUNITY_FIXED_BACK_OPTIONS)).toBe("back");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("HOME 별칭 `/` ↔ `/home` 은 같은 화면", () => {
    expect(COMMUNITY_FIXED_BACK_OPTIONS.isSameDestination?.("/", "/home")).toBe(true);
    expect(COMMUNITY_FIXED_BACK_OPTIONS.isSameDestination?.("/home", "/philife")).toBe(false);
    expect(COMMUNITY_FIXED_BACK_OPTIONS.isSameDestination?.("/community", "/philife")).toBe(true);
    expect(COMMUNITY_FIXED_BACK_OPTIONS.isSameDestination?.("/philife?category=a", "/philife")).toBe(false);
  });

  it("‹ 읽기 이름 — HOME 이면 「뒤로가기」, 피드면 「피드로」", () => {
    expect(backAriaKey("/home")).toBe("nav_back");
    expect(backAriaKey("/")).toBe("nav_back");
    expect(backAriaKey("/philife?category=a")).toBe("community_feed_back_aria");
    expect(backAriaKey("/search?q=a")).toBe("community_feed_back_aria");
  });
});
