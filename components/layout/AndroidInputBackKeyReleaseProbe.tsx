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
 * 메신저·채팅 화면은 컴포저 포커스·뷰포트 계약이 따로 있어 제외한다 (`enabled=false`).
 * 렌더 없음 — visualViewport 변화로 이 leaf 만 다시 렌더된다.
 */
export function AndroidInputBackKeyReleaseProbe({ enabled }: { enabled: boolean }) {
  const active = enabled && resolveCapacitorShellPlatform() === "android";
  const { keyboardOpen } = useFormKeyboardViewport({ enabled: active });
  const prevOpenRef = useRef(keyboardOpen);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = keyboardOpen;
    if (!active || !wasOpen || keyboardOpen) return;
    const el = document.activeElement;
    if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      el.blur();
    }
  }, [active, keyboardOpen]);

  return null;
}
