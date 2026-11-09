/**
 * R-0 (Owner 승인 2026-11-10) — 하단 탭 세그먼트 loading: 탭 첫 화면만 중립 블록, 하위 화면 null, 피드 스켈레톤 금지.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { MainTabSegmentLoading } from "@/components/layout/MainTabSegmentLoading";

afterEach(() => {
  mockPath = "/";
});

const TABS: Array<[string, string]> = [
  ["philife", "/philife"],
  ["stores", "/stores"],
  ["market", "/market"],
  ["community-messenger", "/community-messenger"],
  ["mypage", "/mypage"],
];

describe("MainTabSegmentLoading", () => {
  it.each(["/philife", "/philife/"])("탭 첫 화면(%s)에서 중립 블록", (p) => {
    mockPath = p;
    const html = renderToStaticMarkup(<MainTabSegmentLoading tabRootPath="/philife" />);
    expect(html).toContain("data-main-tab-segment-loading");
  });

  it.each(["/philife/write", "/philife/my", "/philife/abc"])("하위 화면(%s)은 그리지 않음", (p) => {
    mockPath = p;
    expect(renderToStaticMarkup(<MainTabSegmentLoading tabRootPath="/philife" />)).toBe("");
  });
});

describe("탭 세그먼트 loading.tsx 5곳 배선", () => {
  it.each(TABS)("app/(main)/%s/loading.tsx → MainTabSegmentLoading(%s), 빈 null·피드 스켈레톤 없음", (seg, root) => {
    const src = readFileSync(join(process.cwd(), "app", "(main)", seg, "loading.tsx"), "utf8");
    expect(src).toContain(`<MainTabSegmentLoading tabRootPath="${root}" />`);
    expect(src).not.toMatch(/return null;/);
    expect(src).not.toMatch(/MainFeedRouteLoading|CommunityFeedSkeleton/);
  });
});
