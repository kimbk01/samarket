import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/** Owner 2026-11-04 — 사장님 돈 화면 수단 선택은 네이티브 select(Android 라디오 팝업) 대신 화면 안 선택 칩 */
describe("owner money method choice — no native select popup", () => {
  it.each([
    ["components/business/owner/OwnerBusinessCashView.tsx", "data-owner-bc-topup-method"],
    ["components/business/owner/OwnerCoinWithdrawalPanel.tsx", "data-owner-coin-withdraw-method"],
  ])("%s", (file, attr) => {
    const src = read(file);
    expect(src).not.toMatch(/<select\b/);
    expect(src).toContain("<OwnerMethodChoiceChips");
    expect(src).toContain(attr);
  });
  it("칩 = 팝업 SSOT OverlayUi.chip · radiogroup/radio · aria-checked", () => {
    const src = read("components/business/owner/OwnerMethodChoiceChips.tsx");
    expect(src).toContain("OverlayUi.chip");
    expect(src).toContain('role="radiogroup"');
    expect(src).toContain('role="radio"');
    expect(src).toContain("aria-checked={checked}");
  });
});
