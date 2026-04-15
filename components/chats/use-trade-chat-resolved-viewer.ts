"use client";

import { useLayoutEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";

type Resolved = string | null | undefined;

/**
 * 거래 채팅 화면 뷰어 ID — RSC `initialViewerUserId` 1틱 신뢰 후, 로그인/탭 복귀·테스트 세션에서만 재동기화.
 * `onAuthStateChange` 의 `INITIAL_SESSION`·`TOKEN_REFRESHED` 는 건너뜀 — 전역 `SupabaseAuthSync` 와 중복 `getUser` 왕복을 줄임.
 */
export function useTradeChatResolvedViewer(
  initialViewerUserId: string | null | undefined,
  setResolvedUserId: Dispatch<SetStateAction<Resolved>>
): void {
  useLayoutEffect(() => {
    let cancelled = false;

    const resolveViewer = async (mode: "trust_server_hint" | "refresh") => {
      if (mode === "trust_server_hint") {
        if (initialViewerUserId === null) {
          if (!cancelled) setResolvedUserId(null);
          return;
        }
        const trimmed =
          typeof initialViewerUserId === "string" && initialViewerUserId.trim()
            ? initialViewerUserId.trim()
            : "";
        if (trimmed) {
          if (!cancelled) setResolvedUserId(trimmed);
          return;
        }
      }
      const id = (await getCurrentUserIdForDb())?.trim() || null;
      if (!cancelled) setResolvedUserId(id);
    };

    void resolveViewer("trust_server_hint");

    const onTestAuthChange = () => {
      void resolveViewer("refresh");
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChange);

    const serverHintLoggedIn =
      typeof initialViewerUserId === "string" && initialViewerUserId.trim().length > 0;

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      /** RSC 가 viewer ID 를 내렸으면 탭 복귀마다 `getUser` 왕복 생략 — 로그인/로그아웃은 auth 리스너·테스트 이벤트가 처리 */
      if (serverHintLoggedIn) return;
      void resolveViewer("refresh");
    };
    document.addEventListener("visibilitychange", onVisibility);

    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      void resolveViewer("refresh");
    });

    return () => {
      cancelled = true;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChange);
      document.removeEventListener("visibilitychange", onVisibility);
      authSub?.data.subscription.unsubscribe();
    };
  }, [initialViewerUserId, setResolvedUserId]);
}
