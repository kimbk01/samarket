"use client";

import { useEffect } from "react";
import { scheduleStartupConfigRefresh } from "@/lib/startup/startup-config-client";

/**
 * 첫 진입 화면 설정(어드민)을 첫 그림 뒤에 받아 기기에 저장한다 — 다음 실행부터 쓰인다.
 *
 * 앱 진입 v3 ① (Owner 2026-11-17): 예전에는 여기서 홈을 그린 뒤 `router.replace` 로 옮겨 홈이 먼저 보였다(깜빡임).
 * 이제 첫 화면은 시작 판정(`lib/lifecycle/app-entry-kind.ts` · `safeEntryPath`)이 정하고, 생명주기 이동이
 * 시작 화면(또는 인트로)이 덮은 채 옮긴다. 이 컴포넌트는 저장만 한다.
 */
export function InitialSurfaceBootstrap(): null {
  useEffect(() => {
    scheduleStartupConfigRefresh();
  }, []);
  return null;
}
