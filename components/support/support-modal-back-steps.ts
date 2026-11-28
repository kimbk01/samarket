"use client";

/**
 * 문의 창 기기 뒤로(◁ · popstate) = 화면 ‹ 와 같은 「한 단계 뒤로」 (최종 점검 M1 · 2026-11-28).
 *
 * 각 화면 단계(분야·세부 선택 · 요금표 · 진행 중 상세 · 추가 문의 입력)가 열려 있는 동안 「한 단계 뒤로」 함수를 등록한다.
 * 호스트는 popstate 때 우선순위가 가장 높은 등록 함수를 부르고 기록 항목을 다시 넣는다(창이 가진 기록 항목은 항상 1개).
 * 등록된 단계가 없으면(첫 단계) ◁ = 창 닫기.
 */

import { createContext, useContext, useEffect, useRef } from "react";

/** 숫자가 클수록 먼저 — 같은 화면에 겹쳐 열린 것이 위 */
export const SUPPORT_BACK_PRIORITY = {
  composeSubView: 1,
  detailToCompose: 2,
  followUpInput: 3,
} as const;

export type SupportModalBackRegistry = {
  register: (priority: number, fn: () => void) => () => void;
  /** 가장 높은 단계를 뒤로 — 처리했으면 true(첫 단계면 false) */
  stepBack: () => boolean;
};

export function createSupportModalBackRegistry(): SupportModalBackRegistry {
  let seq = 0;
  const entries = new Map<number, { priority: number; order: number; fn: () => void }>();
  return {
    register(priority, fn) {
      const id = ++seq;
      entries.set(id, { priority, order: id, fn });
      return () => {
        entries.delete(id);
      };
    },
    stepBack() {
      let top: { priority: number; order: number; fn: () => void } | null = null;
      for (const e of entries.values()) {
        if (!top || e.priority > top.priority || (e.priority === top.priority && e.order > top.order)) top = e;
      }
      if (!top) return false;
      top.fn();
      return true;
    },
  };
}

export const SupportModalBackContext = createContext<SupportModalBackRegistry | null>(null);

/** `active` 인 동안 이 단계의 「한 단계 뒤로」를 등록한다 (함수는 최신 것을 부른다) */
export function useSupportModalBackStep(active: boolean, priority: number, fn: () => void): void {
  const registry = useContext(SupportModalBackContext);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!active || !registry) return;
    return registry.register(priority, () => fnRef.current());
  }, [active, priority, registry]);
}
