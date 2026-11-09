/**
 * 기본 안정화 FAIL① (2026-11-09) — 거래 글쓰기 「작성 중이던 글을 이어서 쓸까요?」 확인 창이 보이지 않던 결함.
 *
 * 원인: 확인 창을 `z-[72]` 로 고정 → 「판매하기」 글쓰기 시트(`MAIN_BOTTOM_NAV_SHEET_Z_CLASS` = z-[1300]) 아래에 그려져 가려짐.
 * 초안은 저장소에 남아 있으나 사용자는 빈 양식만 보고, 선택 대기(pending_choice) 동안 새 입력도 저장되지 않았다.
 * 계약: 시트 위 확인 창 = `OVERLAY_Z_CLASS.nested` (lib/ui/dibay-overlay-contract.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

const zNum = (cls: string) => Number(/z-\[(\d+)\]/.exec(cls)?.[1] ?? NaN);

const FORMS = [
  "components/write/trade/TradeWriteForm.tsx",
  "components/write/trade/generic/ExchangeExtendedWriteFields.tsx",
  "components/write/trade/generic/JobsExtendedWriteFields.tsx",
];

describe("거래 글쓰기 이어쓰기 확인 창 층", () => {
  it("nested 층은 글쓰기 시트 층보다 위", () => {
    expect(zNum(OVERLAY_Z_CLASS.nested)).toBeGreaterThan(zNum(MAIN_BOTTOM_NAV_SHEET_Z_CLASS));
  });

  it.each(FORMS)("%s — 이어쓰기 확인 창은 nested 층(계약)을 쓰고 z-[72] 고정이 없다", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const i = src.indexOf('t("popup_q_resume_draft")');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(src.lastIndexOf("<", i), src.indexOf("/>", i));
    expect(block).toContain("zIndexClass={OVERLAY_Z_CLASS.nested}");
    expect(block).not.toContain('"z-[72]"');
  });
});
