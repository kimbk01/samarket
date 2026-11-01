import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EDGE_SWIPE_BACK_EDGE_PX,
  EDGE_SWIPE_BACK_LOCK_PX,
  EDGE_SWIPE_BACK_MIN_COMMIT_PX,
  EDGE_SWIPE_BACK_THRESHOLD_RATIO,
  edgeSwipeBackCommitPx,
  resolveEdgeSwipeAxis,
} from "@/lib/ui/use-edge-swipe-back";

describe("가장자리 스와이프 뒤로 — 장바구니·메신저 방과 같은 수치", () => {
  it("수치가 기존 장바구니 셸과 같다", () => {
    const cart = readFileSync("components/stores/cart/StoreCartSwipeBackShell.tsx", "utf8");
    expect(cart).toContain(`const EDGE_HIT_PX = ${EDGE_SWIPE_BACK_EDGE_PX};`);
    expect(cart).toContain(`const HORIZONTAL_LOCK_PX = ${EDGE_SWIPE_BACK_LOCK_PX};`);
    expect(cart).toContain(`const THRESHOLD_RATIO = ${EDGE_SWIPE_BACK_THRESHOLD_RATIO};`);
    expect(cart).toContain(`const MIN_COMMIT_PX = ${EDGE_SWIPE_BACK_MIN_COMMIT_PX};`);
  });

  it("확정 기준 = max(56px, 폭 30%)", () => {
    expect(edgeSwipeBackCommitPx(430)).toBe(129);
    expect(edgeSwipeBackCommitPx(150)).toBe(56);
  });

  it("10px 전엔 판단 보류 · 세로가 크거나 같으면 취소 · 가로가 크면 스와이프", () => {
    expect(resolveEdgeSwipeAxis(9, 9)).toBe("undecided");
    expect(resolveEdgeSwipeAxis(10, 12)).toBe("vertical");
    expect(resolveEdgeSwipeAxis(12, 12)).toBe("vertical");
    expect(resolveEdgeSwipeAxis(14, 3)).toBe("horizontal");
  });
});

describe("작성기 스와이프 띠 층 — 작성기 위 시트 위 · 로그인 게이트 아래", () => {
  it("1305 < 띠 < 1310", async () => {
    const { PHILIFE_COMPOSER_EDGE_SWIPE_Z_CLASS } = await import("@/lib/ui/philife-write-composer-ui");
    const { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } = await import("@/lib/main-menu/bottom-nav-config");
    const z = (c: string) => Number(/z-\[(\d+)\]/.exec(c)?.[1]);
    expect(z(PHILIFE_COMPOSER_EDGE_SWIPE_Z_CLASS)).toBeGreaterThan(z(MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS));
    const cfg = readFileSync("lib/main-menu/bottom-nav-config.ts", "utf8");
    expect(cfg).toContain("Auth gate(1310)");
    expect(z(PHILIFE_COMPOSER_EDGE_SWIPE_Z_CLASS)).toBeLessThan(1310);
  });
});
