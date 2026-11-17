import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 모임 참여 미리보기는 「모임 찾기」 시트(body 포털 · MAIN_BOTTOM_NAV_SHEET_Z_CLASS 1300) 위에서 열린다.
 * 같은 body 포털 + 시트 위 중첩 층(MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS 1305)에 그려야 화면 순서와 ◁ 순서가 같다.
 * 실기 2026-11-18 06:23 PHT: z-[55] 트리 안 렌더 → 시트 아래에 깔려 보이지 않음.
 */
const preview = readFileSync("components/community-messenger/home/OpenGroupJoinPreviewFullScreen.tsx", "utf8");
const sheet = readFileSync("components/community-messenger/MessengerSheetUi.tsx", "utf8");
const layers = readFileSync("lib/main-menu/bottom-nav-config.ts", "utf8");

function zOf(name: string): number {
  const m = layers.match(new RegExp(`export const ${name} = "z-\\[(\\d+)\\]"`));
  expect(m, name).not.toBeNull();
  return Number(m![1]);
}

describe("모임 참여 미리보기 층", () => {
  it("body 포털로 그린다", () => {
    expect(preview).toContain("createPortal(");
    expect(preview).toContain("document.body");
  });

  it("시트 위 중첩 층 상수를 쓰고 낮은 고정 층을 쓰지 않는다", () => {
    expect(preview).toContain("className={`fixed inset-0 ${MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}");
    expect(preview).not.toContain("z-[55]");
  });

  it("「모임 찾기」 시트 층보다 위다", () => {
    expect(sheet).toContain("MAIN_BOTTOM_NAV_SHEET_Z_CLASS");
    expect(zOf("MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS")).toBeGreaterThan(zOf("MAIN_BOTTOM_NAV_SHEET_Z_CLASS"));
  });

  it("◁ 등록은 그대로(떠 있는 동안 이 창만 닫음)", () => {
    expect(preview).toContain("useOverlayHardwareBack(true, onClose)");
  });
});
