"use client";

import { useSyncExternalStore } from "react";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { philifeFeedViewerSig } from "@/lib/community/philife-feed-session-cache";
import { getSupabaseClient } from "@/lib/supabase/client";

let lastAuthViewerSig = "_anon";

function readPhilifeFeedViewerSigSnapshot(): string {
  const fromProfileCache = philifeFeedViewerSig();
  if (fromProfileCache !== "_anon") {
    lastAuthViewerSig = fromProfileCache;
    return fromProfileCache;
  }
  return lastAuthViewerSig;
}

/**
 * 피드 세션 캐시 키·재요청 트리거용 — 로그인/로그아웃·테스트 로그인 시 갱신
 */
export function usePhilifeFeedViewerSig(): string {
  return useSyncExternalStore(
    (onStoreChange) => {
      const sb = getSupabaseClient();
      const authSub = sb?.auth.onAuthStateChange((_event, session) => {
        const nextSig = session?.user?.id?.trim() || "_anon";
        if (nextSig !== lastAuthViewerSig) {
          lastAuthViewerSig = nextSig;
          onStoreChange();
        }
      });
      const onTestAuth = () => onStoreChange();
      if (typeof window !== "undefined") {
        window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
      }
      return () => {
        authSub?.data.subscription.unsubscribe();
        if (typeof window !== "undefined") {
          window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
        }
      };
    },
    readPhilifeFeedViewerSigSnapshot,
    () => "_anon"
  );
}
