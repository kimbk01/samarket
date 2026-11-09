"use client";

/**
 * 하단 탭 복귀 재준비 (장시간 실행·앱 복귀 개선 2026-11-09 A).
 *
 * 원인(코드 확인): 하단 탭 Link 프리페치는 앱 시작 때 1회 받고, 캐시가 5~10분 뒤 만료돼도 화면에 계속 보이는 Link 라
 * Next 가 다시 받지 않는다 → 오래 쉬었다 돌아오면 탭마다 첫 이동이 서버 왕복(콜드), 한 번 다녀오면 다시 빠름.
 *
 * 계약:
 * - 복귀 조정자 `background` 레인 — 세션 신선도 확보(프록시 서버 갱신 방지) + idle 뒤, 통화 중이면 건너뜀.
 * - 숨김 ≥ `ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS`(라우터 캐시 dynamic 만료)일 때만.
 * - 대상 = Link 가 앱 시작 때 프리페치하는 탭과 같은 집합(`shouldPrefetchMainBottomNavHref`) — 새 부하를 만들지 않고
 *   시작 직후 상태로 되돌린다. 현재 탭·비회원의 회원 전용 탭 제외. 같은 href 중복 제거.
 * - 전략 = Link `prefetch={true}` 와 같은 `full` — 같은 캐시 항목을 채운다.
 * - 간격 값은 두지 않는다: Next 스케줄러가 기본 우선순위 동시 4개로 제한하고, 사용자가 누르는 탭(Intent)은 그보다 먼저
 *   간다. 아직 신선한 항목은 스케줄러가 캐시에서 끝낸다(무한·중복 요청 없음).
 */

import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { collectBottomNavBootPrewarmHrefs } from "@/lib/main-menu/bottom-nav-boot-idle-prewarm";
import { shouldPrefetchMainBottomNavHref } from "@/lib/main-menu/main-bottom-nav-link-prefetch-eligibility";
import type { MainBottomNavPickContext } from "@/lib/main-menu/main-bottom-nav-pick-context";
import type { AppResumeTask } from "@/lib/app-resume/app-resume-coordinator";
import { ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS } from "@/lib/performance/router-cache-policy";

export type BottomNavResumeRewarmInput = {
  pathname: string | null;
  tabs: readonly BottomNavItemConfig[];
  ctx?: MainBottomNavPickContext;
};

/** 복귀 때 다시 준비할 탭 href (순수 함수 — 테스트 대상). */
export function collectBottomNavResumeRewarmHrefs(input: BottomNavResumeRewarmInput): string[] {
  return collectBottomNavBootPrewarmHrefs(input.pathname, input.tabs, input.ctx).filter((href) =>
    shouldPrefetchMainBottomNavHref(href, false)
  );
}

/**
 * 대상 탭을 한 번씩 요청한다. 취소 판정은 복귀 조정자가 실행 **전에** 한다(다시 숨김·로그아웃·계정 전환 →
 * epoch abort → `runOne` 이 실행하지 않음, background 레인은 idle 대기 뒤에도 다시 확인). 이 반복은 동기라
 * 도중에 abort 가 끼어들 수 없어 반복문 안 검사는 두지 않는다.
 */
export function runBottomNavResumeRewarm(
  input: BottomNavResumeRewarmInput,
  prefetchFull: (href: string) => void
): string[] {
  const hrefs = collectBottomNavResumeRewarmHrefs(input);
  const issued: string[] = [];
  for (const href of hrefs) {
    try {
      prefetchFull(href);
      issued.push(href);
    } catch {
      /* 개별 실패 무시 — 사용자가 누르면 그때 받는다 */
    }
  }
  return issued;
}

/**
 * 복귀 조정자에 등록하는 작업(단일 정의 — `BottomNavBootIdlePrewarmHost` 가 등록, 테스트가 같은 작업으로 취소 경로 검증).
 * - `background` 레인(idle 뒤·통화 중 생략) · `auth: "optional"`(회원 탭 RSC 는 로그인 쿠키로 나간다 → 세션 미확정이면
 *   보류, 무효면 취소, 비회원은 공개 탭만) · 숨김 ≥ 라우터 캐시 dynamic 만료일 때만.
 */
export function createBottomNavResumeRewarmTask(
  readLatest: () => BottomNavResumeRewarmInput,
  prefetchFull: (href: string) => void
): AppResumeTask {
  return {
    id: "bottom-nav-resume-rewarm",
    lane: "background",
    auth: "optional",
    minHiddenMs: ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS,
    run: () => {
      runBottomNavResumeRewarm(readLatest(), prefetchFull);
    },
  };
}
