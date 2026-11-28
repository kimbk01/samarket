"use client";

/**
 * 문의 창 「한 단계 뒤로」 (화면 ‹ = 기기 ◁ · 계약 §5).
 *
 * 맨 위 화면 안의 작은 단계(분야·세부 선택 · 요금표 · 추가 문의 입력칸)가 열려 있는 동안 등록한다.
 * back intent(`dispatchSupportModalIntent({type:"back"})`)는 이것을 먼저 부르고, 없으면 쌓인 화면을 하나 빼고,
 * 첫 화면이면 창을 닫는다. 등록부는 상태 기계 하나(`registerSupportModalBackStep`).
 */

import { useEffect, useRef } from "react";
import { registerSupportModalBackStep } from "@/lib/support/support-modal-machine";

/** 숫자가 클수록 먼저 — 같은 화면에 겹쳐 열린 것이 위 */
export const SUPPORT_BACK_PRIORITY = {
  composeSubView: 1,
  followUpInput: 3,
} as const;

/** `active` 인 동안 이 단계의 「한 단계 뒤로」를 등록한다 (함수는 최신 것을 부른다) */
export function useSupportModalBackStep(active: boolean, priority: number, fn: () => void): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    return registerSupportModalBackStep(priority, () => fnRef.current());
  }, [active, priority]);
}
