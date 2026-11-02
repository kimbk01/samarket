"use client";

/**
 * 내정보 스크롤 규칙 1개 (분류 설계 S4, 2026-11-02 실측 결함 수정).
 * 내정보 화면들은 앱 스크롤 영역 하나를 같이 쓴다. 그래서
 * - 새 화면으로 들어가면(push) 맨 위에서 시작한다 — 이전 화면 위치가 남아 위가 잘린 채 열리던 결함.
 * - 뒤로·앞으로(popstate)는 그 화면에서 마지막으로 본 위치로 돌아간다 — 내용이 늦게 커지면 짧게 다시 시도.
 * 위치는 경로(+쿼리)별 sessionStorage, 30분.
 */
import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import { MYPAGE_SCROLL_RESTORE_TTL_MS } from "@/lib/mypage/mypage-hub-scroll-restore";

const KEY_PREFIX = "dibay:mypage-scroll:";
/** 내용이 늦게 그려질 때 복원 재시도 상한 (약 1.5초) */
const RESTORE_MAX_FRAMES = 90;

/** 뒤로·앞으로로 도착한 경로 — 다른 도메인 안의 뒤로가기가 나중의 새 진입을 「뒤로」로 오인하지 않게 경로로 맞춘다 */
let popstatePath: string | null = null;
let listenerInstalled = false;

/** 앱 전역 1회 — 다른 도메인에서 내정보로 뒤로 올 때도 표시가 남도록 모듈 수준 */
export function ensureMypageScrollPopstateListener(): void {
  if (typeof window === "undefined" || listenerInstalled) return;
  listenerInstalled = true;
  try {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }
  window.addEventListener("popstate", () => {
    popstatePath = window.location.pathname;
  });
}

/** 이번 화면(`pathname`) 진입이 뒤로·앞으로인지 — 한 번 읽으면 지운다 */
export function consumeMypageScrollPopstate(pathname: string): boolean {
  const hit = popstatePath === pathname;
  popstatePath = null;
  return hit;
}

export function mypageScrollKey(pathname: string, search: string): string {
  return `${KEY_PREFIX}${pathname}${search ? `?${search}` : ""}`;
}

export function saveMypageScroll(key: string, y: number): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ y: Math.max(0, Math.round(y)), at: Date.now() }));
  } catch {
    /* quota */
  }
}

export function readMypageScroll(key: string, now = Date.now()): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { y?: number; at?: number };
    if (!v?.at || v.at + MYPAGE_SCROLL_RESTORE_TTL_MS < now) {
      sessionStorage.removeItem(key);
      return null;
    }
    return Math.max(0, Math.round(Number(v.y) || 0));
  } catch {
    return null;
  }
}

/** 저장 위치로 — 내용 높이가 모자라면 다음 프레임에 다시 (최대 약 1.5초) */
export function restoreMypageScrollTo(targetY: number): () => void {
  let frames = 0;
  let raf = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const root = getMainAppScrollRoot();
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    setMainAppScrollTop(Math.min(targetY, max), { behavior: "auto", scrollRoot: root });
    frames += 1;
    if (max + 1 < targetY && frames < RESTORE_MAX_FRAMES) raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

export function scrollMypageToTop(): void {
  setMainAppScrollTop(0, { behavior: "auto", scrollRoot: getMainAppScrollRoot() });
}

export function currentMypageScrollTop(): number {
  return getMainAppScrollTop();
}
