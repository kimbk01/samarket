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

  it("iOS 스와이프 뒤로가기: 작성기가 열린 동안만 켜고 닫히면 끈다 · 네이티브 기본 꺼짐·문서 로드 때 끔", () => {
    const guard = readFileSync("components/philife/use-philife-write-leave-guard.ts", "utf8");
    expect(guard).toMatch(/void setDibayBackSwipeEnabled\(true\);\s*return \(\) => \{\s*void setDibayBackSwipeEnabled\(false\);/);
    const root = readFileSync("ios/App/App/DibayRootBridgeViewController.swift", "utf8");
    expect(root).toContain("private(set) var backSwipeEnabled = false");
    expect(root).toContain("webView?.allowsBackForwardNavigationGestures = enabled");
    expect(root).toMatch(/self\?\.setAdminLandscape\(false\)\s*self\?\.setBackSwipeEnabled\(false\)/);
    expect(root).toContain("DibayBackSwipePlugin(),");
  });
});
