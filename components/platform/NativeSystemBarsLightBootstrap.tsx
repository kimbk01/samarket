"use client";

import { useEffect } from "react";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * 다크 모드 없음 (Owner 2026-11-12·13) — 상태 바·하단 제스처 바 아이콘을 항상 어두운 색(LIGHT 스타일)으로 고정.
 *
 * Capacitor 8 `SystemBars` 기본값 `DEFAULT` 는 앱 테마가 아니라 기기 다크 여부를 직접 본다
 * (Android `SystemBars.getStyleForTheme()` = `uiMode` night, iOS `.default`). 기기 다크면 흰 아이콘이 되어
 * DIBAY 의 밝은 머리글 위에서 보이지 않는다. 설치된 모든 앱에 웹으로 적용하고,
 * 새 빌드는 `capacitor.config.ts` `plugins.SystemBars.style = "LIGHT"` 로 첫 화면부터 적용된다.
 * Android 는 설정 변경 때 마지막 값(LIGHT)을 다시 적용하므로 1회 호출로 유지된다.
 * 설계: docs/design/no-dark-mode-residual-risk-design-2026-11-13.md §2 R1
 */
export function NativeSystemBarsLightBootstrap() {
  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    void SystemBars.setStyle({ style: SystemBarsStyle.Light }).catch(() => {
      /* 플러그인 없는 구 바이너리 — 무시 */
    });
  }, []);

  return null;
}
