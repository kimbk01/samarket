"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";

const HISTORY_KEY = "__dibayPhilifeWriteGuard";

/**
 * 커뮤니티 글쓰기 이탈 가드 (CM-P2-10).
 * - Android 하드웨어 뒤로가기: overlay back stack (최상위만 처리).
 * - 브라우저 뒤로가기·iOS 스와이프: 가드 history 항목 1개를 쌓고 popstate 에서 확인창.
 *   (이미지 뷰어 `PostImageViewer` 와 같은 pushState 패턴)
 * - 등록 성공 후 이동 전에는 `release()` 로 가드 항목을 먼저 소비해 기록에 남기지 않는다.
 */
export function usePhilifeWriteLeaveGuard(opts: {
  active: boolean;
  /** true 면 뒤로가기를 이 화면 내부 단계(예: 주제 선택 닫기)에서 소비 */
  consumeBackInternally: () => boolean;
  shouldConfirm: () => boolean;
  confirmLeave: () => Promise<boolean>;
  /** 확인 후(또는 확인 불필요 시) 실제 이탈 — 시트 닫기 / 이전 화면으로 */
  onLeave: () => void;
}): { release: () => Promise<void> } {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const pushedRef = useRef(false);
  const ignoreNextPopRef = useRef(false);
  const confirmingRef = useRef(false);
  /** 화면이 사라질 때 가드 항목 소비를 한 박자 미룬 예약 — 같은 화면이 바로 다시 붙으면 취소 */
  const pendingConsumeRef = useRef<number | null>(null);

  const pushGuard = useCallback(() => {
    try {
      window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
      pushedRef.current = true;
    } catch {
      pushedRef.current = false;
    }
  }, []);

  const runLeaveFlow = useCallback(async (): Promise<boolean> => {
    const o = optsRef.current;
    if (o.consumeBackInternally()) return false;
    if (o.shouldConfirm()) {
      if (confirmingRef.current) return false;
      confirmingRef.current = true;
      try {
        if (!(await o.confirmLeave())) return false;
      } finally {
        confirmingRef.current = false;
      }
    }
    return true;
  }, []);

  useOverlayHardwareBack(opts.active, () => {
    void runLeaveFlow().then((leave) => {
      if (leave) optsRef.current.onLeave();
    });
  });

  useEffect(() => {
    if (!opts.active || typeof window === "undefined") return;
    if (pendingConsumeRef.current != null) {
      window.clearTimeout(pendingConsumeRef.current);
      pendingConsumeRef.current = null;
    }
    if (!pushedRef.current) pushGuard();
    const onPop = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }
      if (!pushedRef.current) return;
      pushedRef.current = false;
      // 가드 항목이 빠졌다 — 일단 다시 쌓고 판단한다(취소 시 화면 유지).
      pushGuard();
      void runLeaveFlow().then((leave) => {
        if (!leave) return;
        if (pushedRef.current) {
          pushedRef.current = false;
          ignoreNextPopRef.current = true;
          try {
            window.history.back();
          } catch {
            /* ignore */
          }
        }
        optsRef.current.onLeave();
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [opts.active, pushGuard, runLeaveFlow]);

  /**
   * 화면이 사라질 때(시트 닫힘 등) 남은 가드 항목을 소비 — 기록에 빈 항목을 남기지 않음.
   * 소비는 한 박자 미룬다: 같은 화면이 바로 다시 붙으면(개발 StrictMode 재마운트 · 같은 인스턴스 재연결)
   * 예약을 취소하고 가드를 그대로 쓴다. 바로 back() 하면 다시 붙은 리스너가 그 popstate 를 사용자의 뒤로가기로
   * 받아 나가기 시트가 저절로 뜨거나(2026-11-02 로컬 확인) 가드가 빠졌다.
   */
  useEffect(
    () => () => {
      if (!pushedRef.current || typeof window === "undefined") return;
      pendingConsumeRef.current = window.setTimeout(() => {
        pendingConsumeRef.current = null;
        if (!pushedRef.current) return;
        pushedRef.current = false;
        try {
          if (window.history.state?.[HISTORY_KEY]) window.history.back();
        } catch {
          /* ignore */
        }
      }, 0);
    },
    []
  );

  // 비활성화(닫기 버튼 등)되면 남은 가드 항목을 소비
  useEffect(() => {
    if (opts.active) return;
    if (!pushedRef.current) return;
    pushedRef.current = false;
    try {
      if (window.history.state?.[HISTORY_KEY]) {
        ignoreNextPopRef.current = true;
        window.history.back();
      }
    } catch {
      /* ignore */
    }
  }, [opts.active]);

  const release = useCallback((): Promise<void> => {
    if (!pushedRef.current || typeof window === "undefined") return Promise.resolve();
    pushedRef.current = false;
    if (!window.history.state?.[HISTORY_KEY]) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener("popstate", onPop);
        resolve();
      };
      const onPop = () => finish();
      window.addEventListener("popstate", onPop);
      window.setTimeout(finish, 400);
      ignoreNextPopRef.current = true;
      try {
        window.history.back();
      } catch {
        finish();
      }
    });
  }, []);

  return { release };
}
