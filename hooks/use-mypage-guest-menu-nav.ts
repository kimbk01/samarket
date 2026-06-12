"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";

/** 비로그인 내정보 — 메뉴·통계 탭 시 로그인 모달 후 목적지 이동 */
export function useMypageGuestMenuNav() {
  const router = useRouter();
  const requireAuth = useRequireAuthAction();

  return useCallback(
    (href: string) => {
      void requireAuth(
        "profile_edit",
        () => {
          router.push(href);
        },
        { next: href },
      );
    },
    [requireAuth, router],
  );
}
