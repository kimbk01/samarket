"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { SUPPORT_NOTIFICATION_ARRIVED_EVENT } from "@/lib/support/support-notification-events";
import {
  clearSupportRequesterUnreadCache,
  fetchSupportRequesterUnread,
  SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED,
} from "@/lib/support/support-requester-unread-fetch";
import {
  getSupportModalState,
  subscribeSupportModalState,
} from "@/lib/support/support-modal-controller";

/**
 * Phase 3 B5/B6 — requester-side support unread SSOT for entry badges.
 * 숫자 = `support_cases.requester_unread_count` 합 — 상담 목록과 같은 범위(본인 · audience · 사장님은 그 매장).
 *
 * 고객 문의 최종 감사 L10 (2026-11-28):
 * - 목록 전체(최대 50행) 대신 숫자 전용 응답 `GET /api/support/cases?summary=unread` → `{ ok, unread }`.
 * - 같은 (사용자 · audience · 매장) 은 화면 여러 곳에서 마운트돼도 **진행 중 요청 1개 공유 + 5초 캐시**
 *   (허브 → 창 열기 → 닫기 = 같은 GET 3번이던 것).
 * - 명시 신호(고객지원 알림 도착 — 재동기화·앱 복귀 포함 · 문의 창 닫힘)는 캐시를 건너뛰고 다시 읽는다.
 * - 로그인 사용자가 바뀌거나(로그아웃·계정 전환) 401 이면 숫자를 0 으로 되돌린다(이전 계정 숫자 유지 방지 · L14).
 * Fail-soft: 그 밖의 오류는 마지막 값 유지(배지는 안내용, 진입을 막지 않음).
 */

function currentUserId(): string {
  if (typeof window === "undefined") return "";
  return getCurrentUser()?.id ?? "";
}

export function useSupportRequesterUnread(input: {
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
  enabled?: boolean;
}): number {
  const { audience, storeId, enabled = true } = input;
  const [count, setCount] = useState(0);
  /** 명시 신호마다 +1 — 캐시를 건너뛴다 */
  const [forceTick, setForceTick] = useState(0);
  const [userId, setUserId] = useState(currentUserId);

  // 로그인·로그아웃·계정 전환 → 사용자 id 다시 읽기(SupabaseAuthSync 가 같은 신호를 보낸다)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setUserId(currentUserId());
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  // 사용자가 바뀌면 이전 계정 숫자를 바로 지운다
  useEffect(() => {
    setCount(0);
  }, [userId]);

  // 고객 문의 SSOT §4 (F11): 고객지원 알림(답변·종료·재오픈)이 왔을 때만 다시 읽는다 — 다른 알림마다 읽지 않는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let t: number | null = null;
    const onUpdated = () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => setForceTick((n) => n + 1), 500);
    };
    window.addEventListener(SUPPORT_NOTIFICATION_ARRIVED_EVENT, onUpdated);
    return () => {
      if (t != null) window.clearTimeout(t);
      window.removeEventListener(SUPPORT_NOTIFICATION_ARRIVED_EVENT, onUpdated);
    };
  }, []);

  useEffect(() => {
    let wasOpen = getSupportModalState().phase === "open";
    return subscribeSupportModalState(() => {
      const open = getSupportModalState().phase === "open";
      if (wasOpen && !open) setForceTick((n) => n + 1);
      wasOpen = open;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // 프로필 캐시가 아직 없어도 읽는다(비로그인이면 서버가 401 → 0). 키는 사용자별이라 계정끼리 섞이지 않는다.
    if (audience === "OWNER" && !storeId) return;
    let cancelled = false;
    const qs = new URLSearchParams({ summary: "unread", audience });
    if (audience === "OWNER" && storeId) qs.set("storeId", storeId);
    const key = `${userId || "?"}|${audience}|${audience === "OWNER" ? storeId : ""}`;
    void fetchSupportRequesterUnread(key, qs.toString(), forceTick > 0).then((n) => {
      if (cancelled || n == null) return;
      if (n === SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED) {
        clearSupportRequesterUnreadCache(key);
        setCount(0);
        return;
      }
      setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [audience, storeId, enabled, userId, forceTick]);

  return count;
}
