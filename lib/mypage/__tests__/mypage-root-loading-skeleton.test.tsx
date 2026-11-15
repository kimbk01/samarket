/**
 * 내정보 첫 화면 로딩 경계 — 하단 탭 이동 뼈대와 같은 그림(경로 확정 뒤 흰 화면 제거, Samsung 실측 2026-11-15 14:02).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockPath = "/mypage";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));
vi.mock("@/components/layout/BottomNavHubSkeleton", () => ({
  BottomNavHubSkeleton: ({ hub }: { hub: string }) => <div data-testid="hub-skeleton" data-hub={hub} />,
}));

import MypageSegmentLoading from "@/app/(main)/mypage/loading";

describe("MypageSegmentLoading", () => {
  it("/mypage = 하단 탭 뼈대(mypage)", () => {
    mockPath = "/mypage";
    expect(renderToStaticMarkup(<MypageSegmentLoading />)).toContain('data-hub="mypage"');
  });
  it("하위 화면 = 아무것도 그리지 않음", () => {
    mockPath = "/mypage/settings";
    expect(renderToStaticMarkup(<MypageSegmentLoading />)).toBe("");
  });
});
