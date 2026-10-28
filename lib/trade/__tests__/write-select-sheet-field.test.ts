/**
 * Owner 2026-10-28 승인 — 글쓰기 선택 칸 바텀시트 통일.
 * 브라우저 기본 `<select>` 는 Android 기기마다 창이 달라(삼성 라디오 창 · 샤오미 드롭다운) 글쓰기에서 쓰지 않는다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WRITE_FILES = [
  "components/write/WriteSheetFlowInner.tsx",
  "components/write/trade/generic/UsedCarBuyFields.tsx",
  "components/write/trade/generic/UsedCarSellFields.tsx",
  "components/write/trade/generic/GenericTradeWriteFields.tsx",
  "components/write/trade/generic/JobsExtendedWriteFields.tsx",
];

describe("글쓰기 선택 칸 = WriteSelectSheetField", () => {
  it.each(WRITE_FILES)("%s 에 기본 <select> 없음", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/<select\b/);
    expect(src).toContain("<WriteSelectSheetField");
  });
  it("선택 칸 11곳", () => {
    const n = WRITE_FILES.map((f) => readFileSync(f, "utf8").split("<WriteSelectSheetField").length - 1).reduce(
      (a, b) => a + b,
      0
    );
    expect(n).toBe(11);
  });
  it("시트: 글쓰기 시트 위(중첩 z), 고른 항목 ✓, 누르면 닫힘, 고를 수 없는 항목 흐림", () => {
    const src = readFileSync("components/write/shared/WriteSelectSheetField.tsx", "utf8");
    expect(src).toContain("zIndexClass={MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}");
    expect(src).toContain('role="option"');
    expect(src).toContain("setOpen(false);");
    expect(src).toContain("disabled={o.disabled}");
  });
});
