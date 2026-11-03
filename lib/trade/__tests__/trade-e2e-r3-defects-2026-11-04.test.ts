import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 3차 실기 결함 F-A·F-C·F-D·F-E (docs/audit/trade-e2e-live-r3-claude-2026-11-04.md §2) */
const read = (f: string) => readFileSync(f, "utf8");

describe("F-A 잠긴 액션시트 항목은 흐린 글자", () => {
  it("공통 `.dibay-overlay-action-item:disabled` 규칙 · 불투명도 금지", () => {
    const css = read("app/dibay-overlay.css");
    const block = css.slice(css.indexOf(".dibay-overlay-action-item:disabled"));
    expect(block).toContain("cursor: not-allowed;");
    expect(block.slice(0, block.indexOf("}"))).not.toMatch(/opacity/);
    expect(css).toContain(".dibay-overlay-action-item--danger:disabled");
  });
});

describe("F-C 신고 창은 카드가 「신고한 글」로 바뀌어도 그대로 (완료 단계 유지)", () => {
  it("두 분기(숨긴 글·카드) 모두 조각 두 번째 자리 · 카드 div 안에 두지 않는다", () => {
    const src = read("components/post/PostCard.tsx");
    /** Owner 2026-11-04: 신고하면 같은 카드가 그 자리에서 흐린 「신고한 글입니다」로 바뀐다 — 분기가 바뀌지 않아 창이 그대로 */
    expect(src).not.toContain("ReportedPostCard");
    expect(src).toContain("<HiddenPostCard postId={post.id} onUndo={() => unhideTradePost(post.id)} />\n        {reportModal}");
    expect(src).toContain("    </div>\n    {reportModal}\n    </>\n  );\n});");
    expect(src.match(/\{reportModal\}/g)?.length).toBe(2);
  });
});

describe("F-D 사진 필수 주제는 「사진 *」", () => {
  it("업로더 required 표시 · 거래 글쓰기 두 곳이 필수 규칙(tradeWriteImagesRequired)과 같은 값", () => {
    const up = read("components/write/shared/ImageUploader.tsx");
    expect(up).toContain('required ? <> <span className="text-sam-danger">*</span></> : null');
    expect(up.match(/\{requiredMark\}/g)?.length).toBe(2);
    const form = read("components/write/trade/TradeWriteForm.tsx");
    expect(form.match(/required=\{tradeWriteImagesRequired\}/g)?.length).toBe(2);
  });
});

describe("F-E 판매완료 노출 기간 변경 내역 「전」 = 실제 적용값", () => {
  it("저장값이 없던 첫 저장도 기본값을 「전」으로 · 예전 기록 표시도 기본값", () => {
    const route = read("app/api/admin/trade/settings/route.ts");
    expect(route).toContain("before: current as unknown as Record<string, unknown>,");
    expect(route).not.toContain("before: stored.raw ?");
    expect(route).toContain("days(v) ?? TRADE_SOLD_VISIBLE_DAYS_DEFAULT");
    expect(route).toContain("beforeDays: beforeDays(r.before_json),");
  });
});
