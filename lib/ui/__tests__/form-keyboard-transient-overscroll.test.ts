import { describe, expect, it } from "vitest";
import { restoreFormFocusOverscrollInScrollRoot } from "@/lib/ui/form-keyboard-viewport-contract";
import { correctFocusInScrollRoot, type OverscrollDebt } from "@/lib/ui/use-form-keyboard-focus-visibility";

/**
 * 실측 2026-11-02 SM-M156S 디버그 앱(커뮤니티 작성기): 제목 [145,204] · 키보드가 올라오는 중 visualViewport 높이 115px(순간)
 * → 포커스 보정이 스크롤 영역을 내림 → 정상 높이(474)로 돌아와도 남아 주제 줄이 가려졌다.
 */
function fixture(top0: number, bottom0: number) {
  const root = { scrollTop: 0 } as HTMLElement;
  const focused = {
    isContentEditable: false,
    tagName: "INPUT",
    getBoundingClientRect: () => {
      const top = top0 - root.scrollTop;
      const bottom = bottom0 - root.scrollTop;
      return { top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) };
    },
  } as unknown as HTMLElement;
  return { root, focused };
}

const freshDebt = (): OverscrollDebt => ({ root: null, focused: null, debtPx: 0, expectedTop: 0 });

describe("포커스 보정 — 키보드 순간 높이로 내린 스크롤 되돌림", () => {
  it("순간 높이(하단 162) → 내림 · 정상 높이(하단 474) → 원래 자리(0)로", () => {
    const { root, focused } = fixture(145, 204);
    const debt = freshDebt();
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 162, viewportTop: 0, gap: 8 });
    expect(root.scrollTop).toBe(50);
    expect(debt.debtPx).toBe(50);
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 474, viewportTop: 0, gap: 8 });
    expect(root.scrollTop).toBe(0);
    expect(debt.debtPx).toBe(0);
  });

  it("정상 높이에서도 입력칸이 가려지면 필요한 만큼만 남긴다(일부만 되돌림)", () => {
    const { root, focused } = fixture(400, 460);
    const debt = freshDebt();
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 300, viewportTop: 0, gap: 8 });
    expect(root.scrollTop).toBe(168);
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 420, viewportTop: 0, gap: 8 });
    expect(root.scrollTop).toBe(48);
    expect(400 - root.scrollTop + 60).toBeLessThanOrEqual(420 - 8);
  });

  it("사용자가 아래로 더 스크롤한 양은 되돌리지 않는다", () => {
    const { root, focused } = fixture(145, 204);
    const debt = freshDebt();
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 162, viewportTop: 0, gap: 8 });
    root.scrollTop = 80;
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 474, viewportTop: 0, gap: 8 });
    expect(root.scrollTop).toBe(80);
    expect(debt.debtPx).toBe(0);
  });

  it("스크롤 영역이 커져 브라우저가 위치를 줄여도(실측 60→31) 남은 만큼 되돌린다", () => {
    const { root, focused } = fixture(149 + 35, 208 + 35);
    const debt = freshDebt();
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 162, viewportTop: 0, gap: 8 });
    expect(debt.debtPx).toBe(89);
    root.scrollTop = 31;
    correctFocusInScrollRoot(debt, { focused, root, bandBottom: 474, viewportTop: 0, gap: 8 });
    expect(root.scrollTop).toBe(0);
    expect(debt.debtPx).toBe(0);
  });

  it("다른 입력칸으로 옮기면 이전 칸의 빚은 버린다 · 이미 보이면 스크롤 없음", () => {
    const a = fixture(145, 204);
    const debt = freshDebt();
    correctFocusInScrollRoot(debt, { focused: a.focused, root: a.root, bandBottom: 162, viewportTop: 0, gap: 8 });
    const other = { ...a.focused, getBoundingClientRect: a.focused.getBoundingClientRect } as HTMLElement;
    correctFocusInScrollRoot(debt, { focused: other, root: a.root, bandBottom: 474, viewportTop: 0, gap: 8 });
    expect(a.root.scrollTop).toBe(50);
  });

  it("되돌림 함수 — 빚·현재 스크롤·여유 중 가장 작은 만큼 · 키보드보다 큰 칸은 0", () => {
    const { root, focused } = fixture(145, 204);
    root.scrollTop = 25;
    expect(
      restoreFormFocusOverscrollInScrollRoot({ focused, scrollRoot: root, effectiveViewportBottom: 474, debtPx: 25 })
    ).toBe(25);
    expect(root.scrollTop).toBe(0);
    root.scrollTop = 25;
    expect(
      restoreFormFocusOverscrollInScrollRoot({ focused, scrollRoot: root, effectiveViewportBottom: 474, debtPx: 10 })
    ).toBe(10);
    expect(root.scrollTop).toBe(15);
    const tall = fixture(100, 900);
    tall.root.scrollTop = 40;
    expect(
      restoreFormFocusOverscrollInScrollRoot({ focused: tall.focused, scrollRoot: tall.root, effectiveViewportBottom: 474, debtPx: 40 })
    ).toBe(0);
  });
});
