/** 사장님 하단 탭 계약 v2 S5 — 하단 탭 이동만 슬라이드 없음(1회 소비), 그 밖의 스택 이동은 기존 슬라이드 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetOwnerBottomNavTabIntentForTest,
  consumeOwnerBottomNavTabIntent,
  markOwnerBottomNavTabIntent,
} from "@/lib/business/owner-bottom-nav-tab-intent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

afterEach(() => __resetOwnerBottomNavTabIntentForTest());

describe("owner bottom nav tab intent", () => {
  it("같은 경로 도착 때 1회만 소비", () => {
    markOwnerBottomNavTabIntent("/stores/owner/products?storeId=s1", 1000);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/orders", 1100)).toBe(false);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/products/", 1200)).toBe(true);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/products", 1300)).toBe(false);
  });
  it("8초 지나면 무효", () => {
    markOwnerBottomNavTabIntent("/stores/owner/products", 0);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/products", 8_001)).toBe(false);
  });
  it("사장님 하단 탭: pointerdown 피드백 없음 · click 에서 햅틱·표식 · 슬라이드 셸이 표식을 소비", () => {
    const nav = readFileSync(join(process.cwd(), "components/stores/owner/OwnerMobileBottomNav.tsx"), "utf8");
    expect(nav).not.toContain("onPointerDown");
    expect(nav).not.toContain("triggerLightTapFeedback");
    expect(nav).toContain("triggerBottomNavSelectionFeedback()");
    expect(nav).toContain("markOwnerBottomNavTabIntent(href)");
    expect(nav).toContain("useBottomNavResumeUiTask()");
    const shell = readFileSync(join(process.cwd(), "components/business/owner/OwnerStackPageSlideShell.tsx"), "utf8");
    expect(shell).toContain("consumeOwnerBottomNavTabIntent(pathKey)");
  });
});
