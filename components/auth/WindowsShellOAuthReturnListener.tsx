"use client";

import { useEffect } from "react";
import { deliverNativeOAuthReturnUrl } from "@/lib/auth/oauth/native-oauth-return-bridge";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  isDibayWindowsShell,
  requestDibayWindowsShellPendingAuthReturn,
  subscribeDibayWindowsShellAuthReturn,
} from "@/lib/platform/dibay-windows-shell";

/**
 * Windows 셸(W2) 로그인 복귀 — 셸 `auth.return`(dibay://auth/callback…)을 Android `appUrlOpen` 과 같은
 * 단일 복귀 경로(`deliverNativeOAuthReturnUrl` → /auth/callback)로 넘긴다.
 * Windows 셸이 아니면(브라우저·Android·iOS) 아무것도 하지 않는다.
 */
export function WindowsShellOAuthReturnListener() {
  useEffect(() => {
    if (!isDibayWindowsShell()) return;
    const unsubscribe = subscribeDibayWindowsShellAuthReturn((nativeUrl) => {
      deliverNativeOAuthReturnUrl(nativeUrl, "windows_shell");
    });
    logOAuthNativeEvent("windows_shell_callback_listener_attached");
    // 콜드 스타트(앱이 dibay:// 로 새로 켜짐) — 셸이 보관한 복귀 주소 요청
    requestDibayWindowsShellPendingAuthReturn();
    return unsubscribe;
  }, []);

  return null;
}
