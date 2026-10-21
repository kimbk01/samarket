"use client";

import { useEffect, useRef } from "react";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

/**
 * Android 앱 — 키보드가 닫히면 입력칸 포커스를 해제한다.
 *
 * Android WebView 는 input/textarea 에 포커스가 남아 있는 동안 기기 뒤로 버튼을 앱
 * (Capacitor `backButton` → 오버레이 back stack · 미저장 확인 · history back)에 넘기지 않는다.
 * 그래서 입력 중 뒤로 → 키보드만 닫히고, 이후 뒤로는 무반응이 된다 (SM-M156S 실기기 진단).
 *
 * 메신저·채팅 화면(라우트 `enabled=false`, 헤더 메신저 스택 `[data-messenger-header-stack]`)은
 * 컴포저 포커스·뷰포트 계약이 따로 있어 제외한다. 회전·분할 화면으로 폭이 바뀐 경우도 키보드 닫힘이 아니다.
 * 렌더 없음 — visualViewport 변화로 이 leaf 만 다시 렌더된다.
 */
export function AndroidInputBackKeyReleaseProbe({ enabled }: { enabled: boolean }) {
  const active = enabled && resolveCapacitorShellPlatform() === "android";
  const { keyboardOpen } = useFormKeyboardViewport({ enabled: active });
  const prevOpenRef = useRef(keyboardOpen);
  const prevWidthRef = useRef(typeof window === "undefined" ? 0 : window.innerWidth);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = keyboardOpen;
    const width = window.innerWidth;
    const widthChanged = width !== prevWidthRef.current;
    prevWidthRef.current = width;
    if (!active || !wasOpen || keyboardOpen || widthChanged) return;
    const el = document.activeElement;
    if (
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
      !el.closest("[data-messenger-header-stack]")
    ) {
      el.blur();
    }
  }, [active, keyboardOpen]);

  return null;
}
