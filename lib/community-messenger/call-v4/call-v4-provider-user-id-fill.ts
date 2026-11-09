"use client";

/**
 * D3 (Owner 승인 2026-11-09 · docs/audit/call-incoming-defects-d3-d4-plan-2026-11-09.md) —
 * 로그인 후 새로고침 없이(router.replace) 화면이 바뀌어도 V4 Provider 의 사용자 ID 를 채운다.
 *
 * 계약 (진행 중 통화 보호):
 * - **비어 있을 때만 채운다.** 이미 ID 가 있으면 절대 바꾸거나 비우지 않는다.
 *   · 계정 A→B 전환은 기존 경로가 전체 새로고침으로 처리한다(`SupabaseAuthSync` → hardReload / `navigateAfterAuthExit`).
 *   · 명시 로그아웃도 전체 새로고침 + 통화 정리(`client-session-wipe`). 비명시 SIGNED_OUT 은 복구 경로라
 *     여기서 비우면 복구 때 다시 채워져 Provider 의 재로드 복구(미응답 발신 취소)가 다시 돌 수 있다 → SIGNED_OUT 무시.
 * - 같은 ID 의 토큰 갱신은 상태를 바꾸지 않는다(구독·조회 재시작 없음).
 * - 인증 이벤트는 앱 공용 통로(`subscribeDibayAuthStateChange`)만 쓴다 — onAuthStateChange 직접 구독 금지.
 */
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";

const FILL_EVENTS: ReadonlySet<AuthChangeEvent> = new Set<AuthChangeEvent>([
  "SIGNED_IN",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
  "INITIAL_SESSION",
]);

export function subscribeCallV4ProviderUserIdFill(opts: {
  /** 현재 Provider 의 사용자 ID (비어 있으면 null) */
  readCurrent: () => string | null;
  /** 실제 사용자 ID 다시 읽기 — Provider 마운트 때와 같은 함수 */
  resolveUserId: () => Promise<string | null>;
  /** 비어 있을 때 1회 채움 */
  apply: (userId: string) => void;
}): () => void {
  let disposed = false;
  let inFlight = false;
  const unsubscribe = subscribeDibayAuthStateChange((event, session) => {
    if (disposed || !FILL_EVENTS.has(event)) return;
    if (!session?.user?.id) return;
    if (opts.readCurrent()) return;
    if (inFlight) return;
    inFlight = true;
    void opts
      .resolveUserId()
      .then((id) => {
        if (disposed || !id) return;
        if (opts.readCurrent()) return;
        opts.apply(id);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  });
  return () => {
    disposed = true;
    unsubscribe();
  };
}
