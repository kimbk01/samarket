import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { MOIM_STICKY_FOOTER_KB_OFFSET_CLASS } from "@/components/moim/MoimStickyFooter";

/** 2026-11-12 Samsung 실기: 키보드 열림 시 하단 버튼 줄이 셸 하단 탭 여백만큼 떠서 입력칸을 가림 */
describe("모임 하단 버튼 줄 — 키보드 열림 보정", () => {
  it("열림 보정값 = 셸 스크롤 본문 하단 여백(탭 clearance + 16px)의 음수", () => {
    const shell = MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS.match(/^pb-\[(.+)\]$/)?.[1];
    expect(shell).toBe("calc(var(--app-bottom-nav-clearance)+16px)");
    const inner = shell!.replace(/^calc\((.+)\)$/, "$1");
    expect(MOIM_STICKY_FOOTER_KB_OFFSET_CLASS).toBe(`[html[data-kb-open=true]_&]:bottom-[calc(-1*(${inner}))]`);
  });

  it("모임 화면은 하단 고정 버튼 줄을 공용 부품으로만 쓴다 (sticky bottom-0 직접 사용 금지)", () => {
    const dir = join(process.cwd(), "components/moim");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && f !== "MoimStickyFooter.tsx")
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("sticky bottom-0"));
    expect(offenders).toEqual([]);
  });
});
