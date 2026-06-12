"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";

/** localStorage 지역 목록을 계정별로 분리하기 위한 viewer id. */
export function useRegionViewerUserId(): string {
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
