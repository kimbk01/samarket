// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  collectBottomNavResumeRewarmHrefs,
  runBottomNavResumeRewarm,
} from "@/lib/main-menu/bottom-nav-resume-rewarm";
import { shouldPrefetchMainBottomNavHref } from "@/lib/main-menu/main-bottom-nav-link-prefetch-eligibility";

const currentUser = vi.hoisted(() => ({ value: null as { id: string } | null }));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(() => currentUser.value),
}));

function pathOf(href: string): string {
  return (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}

describe("bottom-nav resume rewarm", () => {
  it("대상 = Link 프리페치 규칙과 같은 탭, 현재 탭 제외, 중복 없음", () => {
    currentUser.value = { id: "u1" };
    const hrefs = collectBottomNavResumeRewarmHrefs({ pathname: "/stores", tabs: BOTTOM_NAV_ITEMS });
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) {
      expect(shouldPrefetchMainBottomNavHref(h, false)).toBe(true);
      expect(pathOf(h)).not.toBe("/stores");
    }
  });

  it("비회원은 회원 전용 탭(내정보·메신저)을 다시 받지 않는다", () => {
    currentUser.value = null;
    const hrefs = collectBottomNavResumeRewarmHrefs({ pathname: "/stores", tabs: BOTTOM_NAV_ITEMS });
    for (const h of hrefs) {
      expect(pathOf(h)).not.toBe("/mypage");
      expect(pathOf(h).startsWith("/community-messenger")).toBe(false);
    }
  });

  it("취소되면 남은 탭은 요청하지 않는다", () => {
    currentUser.value = { id: "u1" };
    const ctrl = new AbortController();
    const calls: string[] = [];
    runBottomNavResumeRewarm(
      { pathname: "/stores", tabs: BOTTOM_NAV_ITEMS },
      (href) => {
        calls.push(href);
        ctrl.abort();
      },
      ctrl.signal
    );
    expect(calls.length).toBe(1);
  });
});
