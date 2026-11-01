import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  confirmLeaveWriteBeforeNavigation,
  hasWriteLeaveNavigationGuard,
  registerWriteLeaveNavigationGuard,
} from "@/lib/philife/write-leave-navigation-guard";

describe("작성 중 글 보호 — 푸시 알림 탭 이동 (Owner 승인 2026-11-02)", () => {
  it("작성기가 없으면 바로 허락 · 있으면 작성기 확인 결과를 따른다 · 해제는 자기 등록만", async () => {
    expect(hasWriteLeaveNavigationGuard()).toBe(false);
    await expect(confirmLeaveWriteBeforeNavigation()).resolves.toBe(true);
    const stay = vi.fn(() => Promise.resolve(false));
    const off = registerWriteLeaveNavigationGuard(stay);
    expect(hasWriteLeaveNavigationGuard()).toBe(true);
    await expect(confirmLeaveWriteBeforeNavigation()).resolves.toBe(false);
    const leave = vi.fn(() => Promise.resolve(true));
    const off2 = registerWriteLeaveNavigationGuard(leave);
    off();
    expect(hasWriteLeaveNavigationGuard()).toBe(true);
    await expect(confirmLeaveWriteBeforeNavigation()).resolves.toBe(true);
    off2();
    expect(hasWriteLeaveNavigationGuard()).toBe(false);
  });

  it("푸시 이동은 통화 경로를 빼고 확인을 거치며, 「계속 쓰기」면 대기 경로를 지운다", () => {
    const src = readFileSync("components/push/PushRouteListener.tsx", "utf8");
    expect(src).toMatch(
      /if \(hasWriteLeaveNavigationGuard\(\) && !isCallRoute\(path\) && !isCallPushRoutePath\(path\)\) \{\s*void confirmLeaveWriteBeforeNavigation\(\)\.then\(\(leave\) => \{\s*if \(leave\) \{\s*deliverRoute\(\);\s*return;\s*\}\s*clearPendingPushRoute\(\);\s*void clearNativePersistedPendingPushRoute\(\);/
    );
    const form = readFileSync("components/philife/PhilifeNeighborhoodWriteForm.tsx", "utf8");
    expect(form).toContain("registerWriteLeaveNavigationGuard(() => navigationLeaveRef.current())");
  });

  it("iOS 가장자리 스와이프: 웹 방식(장바구니와 같은 수치) → Android 뒤로와 같은 처리 · WebKit 내장 스와이프는 켜지 않는다", () => {
    const form = readFileSync("components/philife/PhilifeNeighborhoodWriteForm.tsx", "utf8");
    expect(form).toMatch(/useEdgeSwipeBack\(\{\s*enabled: iosEdgeSwipe,\s*onCommit: \(\) => \{\s*handleOverlayHardwareBack\(\);/);
    expect(form).toContain("setIosEdgeSwipe(isLikelyIosWebKit())");
    expect(form).toContain('data-testid="philife-composer-edge-swipe"');
    // 띠는 body 에 — 작성기 위 시트(1305) 위에서도 스와이프가 맨 위 시트만 닫는다
    expect(form).toMatch(/className=\{`fixed left-0 \$\{PHILIFE_COMPOSER_EDGE_SWIPE_Z_CLASS\} touch-none`\}/);
    expect(form).toMatch(/\{\.\.\.edgeSwipe\.edgeProps\}\s*\/>,\s*document\.body/);
    const guard = readFileSync("components/philife/use-philife-write-leave-guard.ts", "utf8");
    expect(guard).not.toContain("setDibayBackSwipeEnabled");
  });
});
