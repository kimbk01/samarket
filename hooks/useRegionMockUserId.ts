"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";

/**
 * 지역 mock 목록을 계정별로 분리하기 위한 id.
 * (기존 고정 "me" 는 여러 로그인 세션이 같은 in-memory 목록을 공유해 섞였음.)
 */
export function useRegionMockUserId(): string {
  const [userId, setUserId] = useState(() =>
    typeof window === "undefined" ? "guest" : getCurrentUser()?.id ?? "guest"
  );

  useEffect(() => {
    const sync = () => {
      setUserId(getCurrentUser()?.id ?? "guest");
    };
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  return userId;
}
