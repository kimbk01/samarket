"use client";

import { useEffect } from "react";
import {
  clearPostLogoutBfcacheGuard,
  POST_LOGOUT_BFCACHE_GUARD_KEY,
} from "@/lib/auth/client-session-wipe";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";

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
