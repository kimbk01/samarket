"use client";

/**
 * 복귀 조정자 — 브라우저·Capacitor 연결 (코어: `app-resume-coordinator.ts`).
 * 문서당 1개. 첫 `registerAppResumeTask` 때 설치된다.
 */

import {
  createAppResumeCoordinator,
  type AppResumeCoordinator,
  type AppResumeTask,
} from "@/lib/app-resume/app-resume-coordinator";
import { waitForSessionFreshnessIfNeeded } from "@/lib/auth/session-freshness-fetch-gate.client";
import { readOwnLiveCall } from "@/lib/call/own-live-call";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { getSupabaseClient } from "@/lib/supabase/client";

/** idle 대기 상한 — 메인 스레드가 계속 바빠도 이 시간 뒤에는 진행 (requestIdleCallback timeout). */
const APP_RESUME_IDLE_TIMEOUT_MS = 2_000;

let coordinator: AppResumeCoordinator | null = null;

function waitForIdle(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish);
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => finish(), { timeout: APP_RESUME_IDLE_TIMEOUT_MS });
    } else {
      window.setTimeout(finish, 0);
    }
  });
}

function waitForOnline(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted || navigator.onLine) return resolve();
    const finish = () => {
      window.removeEventListener("online", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    window.addEventListener("online", finish);
    signal.addEventListener("abort", finish);
  });
}

function hasOwnLiveCall(): boolean {
  try {
    return readOwnLiveCall() != null;
  } catch {
    // 판정 실패 = 통화 중일 수 있음 → background 작업 건너뜀
    return true;
  }
}

function install(): AppResumeCoordinator {
  const c = createAppResumeCoordinator(
    {
      now: () => Date.now(),
      waitForSessionFreshness: () => waitForSessionFreshnessIfNeeded(),
      waitForIdle,
      isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
      waitForOnline,
      hasOwnLiveCall,
    },
    { visible: document.visibilityState === "visible" }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") c.noteHidden("visibility_hidden");
    else c.noteVisible("visibility_visible");
  });
  window.addEventListener("pagehide", () => c.noteHidden("pagehide"));
  window.addEventListener("pageshow", (ev) => {
    if ((ev as PageTransitionEvent).persisted) c.noteVisible("pageshow_persisted");
  });

  if (isCapacitorNativePlatform()) {
    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) c.noteVisible("app_active");
          else c.noteHidden("app_inactive");
        })
      )
      .catch(() => {
        /* 플러그인 없음 → 문서 신호만 */
      });
  }

  // 로그아웃·계정 전환 — 진행 중 복귀 작업 취소 (인증 동작은 바꾸지 않고 구독만 한다).
  try {
    let lastUserId: string | null | undefined;
    getSupabaseClient()?.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null;
      if (event === "SIGNED_OUT" || (lastUserId !== undefined && lastUserId !== userId)) {
        c.abortCurrent(event === "SIGNED_OUT" ? "signed_out" : "account_changed");
      }
      lastUserId = userId;
    });
  } catch {
    /* 인증 클라이언트 없음 → 숨김 취소만 */
  }

  return c;
}

/** 복귀 작업 등록. 반환값으로 해제. 서버에서는 아무것도 하지 않는다. */
export function registerAppResumeTask(task: AppResumeTask): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (!coordinator) coordinator = install();
  return coordinator.register(task);
}
