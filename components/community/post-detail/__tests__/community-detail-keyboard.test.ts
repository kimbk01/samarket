import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  COMMUNITY_DETAIL_KB_ARTICLE_CLASS,
  COMMUNITY_DETAIL_KB_ROOT_CLASS,
} from "@/components/community/post-detail/community-detail-keyboard";

/** 2026-11-28 Xiaomi 실기: 키보드 열림 때 댓글 입력칸과 키보드 사이 빈 띠 132px (셸 탭 여백 92 + 상세 여백 40) */
describe("라운지 글 상세 — 키보드 열림 하단 여백 보정", () => {
  it("상쇄값 = 셸 스크롤 본문 하단 여백(탭 clearance + 16px)의 음수", () => {
    const shell = MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS.match(/^pb-\[(.+)\]$/)?.[1];
    expect(shell).toBe("calc(var(--app-bottom-nav-clearance)+16px)");
    const inner = shell!.replace(/^calc\((.+)\)$/, "$1");
    expect(COMMUNITY_DETAIL_KB_ROOT_CLASS.split(" ")).toEqual([
      `[html[data-kb-open=true]_&]:mb-[calc(-1*(${inner}))]`,
      "[html[data-kb-open=true]_&]:pb-0",
    ]);
    expect(COMMUNITY_DETAIL_KB_ARTICLE_CLASS).toBe("[html[data-kb-open=true]_&]:pb-0");
  });

  it("상세 바깥 틀·글 영역이 보정 클래스를 쓰고, 글 영역 뒤에 키보드 가림 칸을 둔다", () => {
    const src = readFileSync(join(process.cwd(), "components/community/CommunityDetail.tsx"), "utf8");
    expect(src).toContain(
      "community-post-detail-fade-in pb-[max(1rem,var(--safe-bottom))] ${COMMUNITY_DETAIL_KB_ROOT_CLASS}"
    );
    expect(src).toContain("w-full min-w-0 px-4 pb-6 ${COMMUNITY_DETAIL_KB_ARTICLE_CLASS}");
    expect(src).toMatch(/<\/article>\s*<CommunityDetailKeyboardSpacer \/>/);
  });
});
