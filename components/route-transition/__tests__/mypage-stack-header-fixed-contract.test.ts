/**
 * 내정보 스택 전환 — 헤더 고정 + 본문만 슬라이드 (설계서 §12 「전환 중」·§13-4) 소스 계약.
 * 다른 도메인(메인 허브·거래·배달 등)은 헤더+본문 한 surface 계약 그대로.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("mypage stack header-fixed transition contract", () => {
  const art = read("components/route-transition/AppRouteTransition.tsx");
  const css = read("app/globals.css");

  it("header-fixed flag is set only for mypage stack kinds with a hub header slot", () => {
    expect(art).toMatch(
      /headerFixed:\s*Boolean\(hubChromeHeader\)\s*&&\s*isMypageStackHeaderFixedKind\(kind\)/,
    );
    expect(art).toContain("el.dataset.mypageStackHeaderFixed = \"1\"");
    /** null 정리 경로(허브 전환·정리 타이머)에서 플래그 제거 */
    expect(art).toMatch(/delete el\.dataset\.mypageStackHeaderFixed/);
  });

  it("header stays inside the single push surface (no tree change / remount)", () => {
    expect(art).toContain("{hubChromeHeader}");
    expect(art).toContain("{children}");
  });

  it("CSS translates only non-header children while the surface stays put", () => {
    expect(css).toMatch(
      /\[data-mypage-stack-header-fixed="1"\]\.main-shell-push-surface-from-rtl\s*>\s*:not\(\.main-hub-scroll-header\)\s*\{\s*transform:\s*translate3d\(100%, 0, 0\)/,
    );
    expect(css).toMatch(
      /\[data-mypage-stack-header-fixed="1"\]\.main-shell-push-surface-enter-rtl\s*\{\s*transform:\s*translate3d\(0, 0, 0\);\s*transition:\s*none;/,
    );
    expect(css).toMatch(/var\(--main-shell-push-ms, 300ms\)/);
  });
});
