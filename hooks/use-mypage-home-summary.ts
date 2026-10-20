"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import {
  clearMypageHomeSummary,
  getMypageHomeSummaryState,
  loadMypageHomeSummary,
  MYPAGE_SUMMARY_INVALIDATED_EVENT,
  seedMypageHomeSummary,
  subscribeMypageHomeSummary,
  type MypageHomeSummaryState,
} from "@/lib/mypage/mypage-home-summary-client";

/**
 * `/mypage` 홈 오른쪽 값 — `GET /api/me/mypage-summary` 단일 비행(최종 설계 §2.2).
 * 홈 모델(`useMypageHomeModel`)과 **별도 훅** — 홈 모델에서 개수·CMS 조회 금지(루트 네트워크 계약).
 *
 * - 첫 렌더: 세션 스냅샷이 있으면 그 값, 없으면 `loading`(값 자리 미니 스켈레톤).
 * - 마운트 후(첫 페인트 이후) 1회 조회 — 30초 안 재진입이면 생략.
 * - 재조회: 프로필 저장·찜 변경·하위 화면 쓰기(`invalidateMypageSummary`)·홈 복귀(pageshow/visibility).
 */
export function useMypageHomeSummary(enabled: boolean): MypageHomeSummaryState | null {
  const [viewerId] = useState(() => {
    const uid = getCurrentUser()?.id?.trim() ?? "";
    if (enabled && uid) seedMypageHomeSummary(uid);
    return uid;
  });

  const summary = useSyncExternalStore(
    subscribeMypageHomeSummary,
    getMypageHomeSummaryState,
    () => null,
  );

  useEffect(() => {
    if (!enabled) return;
    const uid = getCurrentUser()?.id?.trim() ?? "";
    if (!uid) return;
    const current = getMypageHomeSummaryState();
    if (current && current.viewerId !== uid) clearMypageHomeSummary();
    seedMypageHomeSummary(uid);
    void loadMypageHomeSummary(uid);

    const refetch = (force: boolean) => {
      const id = getCurrentUser()?.id?.trim() ?? "";
      if (!id) return;
      void loadMypageHomeSummary(id, { force });
    };
    const onForce = () => refetch(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch(false);
    };
    const onPageShow = () => refetch(false);
    const onAuthChanged = () => clearMypageHomeSummary();

    window.addEventListener(PROFILE_UPDATED_EVENT, onForce);
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onForce);
    window.addEventListener(MYPAGE_SUMMARY_INVALIDATED_EVENT, onForce);
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribeAuth = subscribeDibayAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearMypageHomeSummary();
        return;
      }
      if (event === "SIGNED_IN") {
        const id = getCurrentUser()?.id?.trim() ?? "";
        const s = getMypageHomeSummaryState();
        if (s && s.viewerId !== id) {
          clearMypageHomeSummary();
          if (id) void loadMypageHomeSummary(id, { force: true });
        }
      }
    });
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, onForce);
      window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onForce);
      window.removeEventListener(MYPAGE_SUMMARY_INVALIDATED_EVENT, onForce);
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribeAuth();
    };
  }, [enabled, viewerId]);

  if (!enabled) return null;
  return summary;
}
