import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("편집기 사진 높이는 키보드와 무관한 기준 — vh 계열 금지 (Android 설명 저장 뒤 화면 밀림 2026-11-02)", () => {
  it("max-height 는 화면 높이 기준 함수, vh/svh/dvh/lvh 클래스 없음", () => {
    const src = readFileSync("components/philife/write-editor/PhilifeBodyEditor.tsx", "utf8");
    expect(src).toContain("style={{ maxHeight: editorImageMaxHeightPx() }}");
    expect(src).toMatch(/function editorImageMaxHeightPx\(\): number \{[\s\S]*window\.screen\.height/);
    expect(src).not.toMatch(/max-h-\[[^\]]*(?:vh|svh|dvh|lvh)/);
  });
});
