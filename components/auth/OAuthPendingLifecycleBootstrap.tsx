"use client";

import { useEffect } from "react";
import { ensureOAuthPendingLifecycleListeners } from "@/lib/auth/oauth-pending-lifecycle";

/** document visibilitychange — Custom Tab 취소·뒤로가기 복귀 시 pending 해제 */
export function OAuthPendingLifecycleBootstrap() {
  useEffect(() => {
    ensureOAuthPendingLifecycleListeners();
  }, []);

  return null;
}
