"use client";

import { useEffect } from "react";
import { enableAndroidHardwareBackOwner } from "@/lib/ui/overlay-back-stack";

/**
 * push-tap-entry P2 — Android 메인 앱의 시스템 뒤로를 웹이 맡는다(오버레이 없을 때도).
 * 알림 이동으로 쌓인 기록에서 뒤로가기가 죽던 결함(실기 2026-11-10) 수정. 처리 규칙은 `overlay-back-stack.ts`.
 * Android 외 플랫폼은 드라이버가 리스너를 설치하지 않는다.
 */
export function AndroidHardwareBackOwner() {
  useEffect(() => enableAndroidHardwareBackOwner(), []);
  return null;
}
