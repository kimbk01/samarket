/**
 * 관심이웃 전체 수정 설계 v2 — 계약 시험 (docs/audit/interest-neighbor-full-fix-design-2026-11-28.md §8)
 * V-C1 커뮤니티·공개 프로필·내정보 관심이웃 화면의 「그릴 때 회원 읽기」 0 · V-D8 토스트가 고정 하단 바를 덮지 않음 · V-R5 옛 주소
 */
// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      out.push(...walk(rel));
    } else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe("V-C1 — 화면이 그릴 때 회원을 한 번만 읽지 않는다 (회원 상태 SSOT `useClientMembershipState`) (구조 확인)", () => {
  /** PR-A 범위. PR-B·PR-C 에서 사용자 화면 전체로 넓힌다(설계 v2 §6·§7). 누른 순간 읽기(들여쓰기가 더 깊은 처리 함수 안)는 허용 */
  const DIRS = ["components/community", "components/users", "components/reports", "components/mypage/community"];
  const RENDER_READ = /^ {2}const \w+ = (?:mounted \? )?getCurrentUser\(\)/m;

  it.each(DIRS)("%s: getHydrationSafeCurrentUser·mounted 한 번 읽기·컴포넌트 본문 getCurrentUser() 0건", (dir) => {
    const bad: string[] = [];
    for (const f of walk(dir)) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      if (/getHydrationSafeCurrentUser\(/.test(src) || RENDER_READ.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it("#696 의 중복 회원 훅은 없다 — 회원 출처는 하나", () => {
    expect(fs.existsSync(path.join(ROOT, "lib/auth/use-client-profile.ts"))).toBe(false);
  });
});

describe("V-D8 — 고정 하단 바 높이 계약", () => {
  it("바가 높이를 알리면 토스트 위치 변수에 들어가고, 자기 값일 때만 지운다", async () => {
    const { setFixedBottomBarOffset, clearFixedBottomBarOffset, FIXED_BOTTOM_BAR_CSS_VAR } = await import(
      "@/lib/ui/fixed-bottom-bar-offset"
    );
    const a = Symbol("a");
    const b = Symbol("b");
    const read = () => document.documentElement.style.getPropertyValue(FIXED_BOTTOM_BAR_CSS_VAR);
    setFixedBottomBarOffset(a, 72.4);
    expect(read()).toBe("72px");
    setFixedBottomBarOffset(b, 60);
    clearFixedBottomBarOffset(a);
    expect(read()).toBe("60px");
    clearFixedBottomBarOffset(b);
    expect(read()).toBe("");
  });

  it("토스트 위치 식이 바 높이를 더한다 · 공용 하단 줄이 높이를 알린다 (구조 확인)", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/dibay-overlay.css"), "utf8");
    const block = css.slice(css.indexOf(".dibay-toast-stack {"));
    expect(block).toMatch(/var\(--dibay-fixed-bottom-bar, 0px\)/);
    const footer = fs.readFileSync(path.join(ROOT, "components/moim/MoimStickyFooter.tsx"), "utf8");
    expect(footer).toContain("setFixedBottomBarOffset");
    expect(footer).toContain("clearFixedBottomBarOffset");
  });
});

describe("V-R5 — 옛 「모아보는 사용자」 주소는 모두 관심이웃으로", () => {
  it.each([
    ["/my/settings/favorite-users", () => import("@/app/(main)/my/settings/favorite-users/page")],
  ])("%s", async (_label, load) => {
    const redirect = vi.fn((to: string) => {
      throw new Error(`REDIRECT:${to}`);
    });
    vi.doMock("next/navigation", () => ({ redirect }));
    const mod = (await load()) as { default: () => unknown };
    expect(() => mod.default()).toThrow("REDIRECT:/mypage/section/community/community-friends");
    vi.doUnmock("next/navigation");
  });

  it("settings/following · account:favorite-users · messenger:friends 도 관심이웃 경로", async () => {
    const { NEIGHBOR_FOLLOW_MYPAGE_HREF } = await import("@/lib/community/neighbor-follow-contract");
    const settings = fs.readFileSync(path.join(ROOT, "app/(main)/mypage/settings/[section]/page.tsx"), "utf8");
    expect(settings).toMatch(/following: NEIGHBOR_FOLLOW_MYPAGE_HREF/);
    const { resolveMypageSectionLegacyHubRedirect } = await import("@/lib/mypage/mypage-section-legacy-redirect");
    expect(resolveMypageSectionLegacyHubRedirect("account", "favorite-users")).toBe(NEIGHBOR_FOLLOW_MYPAGE_HREF);
    expect(resolveMypageSectionLegacyHubRedirect("messenger", "friends")).toBe(NEIGHBOR_FOLLOW_MYPAGE_HREF);
  });
});
