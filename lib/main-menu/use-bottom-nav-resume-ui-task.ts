"use client";

import { useEffect } from "react";
import { registerAppResumeTask } from "@/lib/app-resume/app-resume-coordinator.client";
import { checkBottomNavWatchdog } from "@/lib/main-menu/bottom-nav-controller";
import { emitBottomNavResume } from "@/lib/main-menu/bottom-nav-resume-signal";

/**
 * 하단 탭 복귀 작업 1개 (계약 v2 · 설계서 §5-5 B2·B4) — 메인 하단 탭과 매장 사장님 하단 탭이 같은 작업을 쓴다.
 * 복귀 조정자 `ui` 레인(보이는 즉시, 인증·idle 대기 없음): 이동 멈춤 감시 재판정 + 키보드·스크롤 숨김 다시 맞춤.
 * 같은 id 로 등록하므로 두 하단 탭이 동시에 있어도 작업은 1개다(나중 등록이 덮고, 해제는 자기 등록일 때만).
 */
export function useBottomNavResumeUiTask(): void {
  useEffect(
    () =>
      registerAppResumeTask({
        id: "bottom-nav-resume-ui",
        lane: "ui",
        auth: "none",
        run: () => {
          checkBottomNavWatchdog();
          emitBottomNavResume();
        },
      }),
    []
  );
}
