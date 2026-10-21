"use client";

import { useEffect } from "react";
import {
  clearPostLogoutBfcacheGuard,
  POST_LOGOUT_BFCACHE_GUARD_KEY,
} from "@/lib/auth/client-session-wipe";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import { getAppBootSnapshot } from "@/lib/app-boot/app-boot-store";

/**
 * P2-10 — 가드는 **인증된** 부팅 완료에서만 해제한다.
 * 익명(anonymous) 부팅 ready 에서 해제하면 로그아웃 직후 bfcache 뒤로가기가 이전 사용자 화면을 보여준다.
 */
export function shouldClearPostLogoutGuardOnBootReady(): boolean {
  const snap = getAppBootSnapshot();
  return snap.status === "ready" && !!snap.profile?.id;
}

/**
 * 로그아웃 직후 bfcache 복원 시 stale 화면 대신 hard reload.
 */
export function PostLogoutBfcacheGuard() {
  useEffect(() => {
    const onPageShow = (event: Event) => {
      const pe = event as PageTransitionEvent;
      if (!pe.persisted) return;
      try {
        if (sessionStorage.getItem(POST_LOGOUT_BFCACHE_GUARD_KEY) === "1") {
          window.location.reload();
        }
      } catch {
        /* ignore */
      }
    };

    const onBootReady = () => {
      if (!shouldClearPostLogoutGuardOnBootReady()) return;
      clearPostLogoutBfcacheGuard();
    };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener(APP_BOOT_READY_EVENT, onBootReady);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(APP_BOOT_READY_EVENT, onBootReady);
    };
  }, []);

  return null;
}
