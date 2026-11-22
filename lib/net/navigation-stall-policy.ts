/**
 * 화면 이동 멈춤 상한 — 단일 정의 (설계 `docs/audit/idle-menu-freeze-design-2026-11-22.md` §S2·S3).
 *
 * 값 8초 = 하단 탭 계약 v2 승인 값(Owner 2026-11-15, 「11-10 실측 최장 2.5초의 3배 이상」).
 * 하단 탭 감시(`bottom-nav-controller`)와 이동 요청 상한 관문(`rsc-navigation-deadline.client`)이 같은 값을 쓴다.
 * 진입·복귀 하드락 H2-3 「상한 없는 await 금지」를 화면 이동 요청에 적용한 것이다.
 */
import { resolveMainTabKeepAliveHub } from "@/lib/layout/resolve-main-surface";

export const NAVIGATION_STALL_DEADLINE_MS = 8_000;

/** 통화 경로 — 이동 멈춤 처리 대상이 아니다(통화 변경 규정 · 세션 신선도 관문과 같은 판정). */
export function isCallPathForNavigationStall(pathname: string): boolean {
  return /call/i.test(pathname);
}

/** 계측용 목표 종류 — 하단 탭 허브 id 또는 `other`. 주소·쿼리는 보내지 않는다(계측 금지 항목). */
export function navigationStallTarget(pathname: string | null | undefined): string {
  try {
    return resolveMainTabKeepAliveHub(pathname) ?? "other";
  } catch {
    return "other";
  }
}
