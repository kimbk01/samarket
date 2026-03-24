"use client";

import { useEffect } from "react";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";
import { ensureSampleNotificationsSeededOnce } from "@/lib/mock-auth/seed-sample-notifications";

/**
 * 샘플 알림 1회 시드 등 클라이언트 부트스트랩.
 * 실제 AuthProvider 로 교체 시 이 컴포넌트만 갈아끼우면 됩니다.
 */
export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isTestUsersSurfaceEnabled()) return;
    ensureSampleNotificationsSeededOnce();
  }, []);

  return <>{children}</>;
}
