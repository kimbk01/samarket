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
/** 뒤로 전환(300ms)·늦게 그려지는 내용(목록·로그인 버튼 등)을 기다리는 최대 시간 */
const RESTORE_WINDOW_MS = 3000;
/** 목표 위치에 닿은 뒤 이만큼 유지되면 종료 (전환 끝의 덮어쓰기까지 지켜봄) */
const RESTORE_SETTLE_MS = 500;

const STACK_KEY = "dibay:mypage-scroll-stack";
const STACK_MAX = 30;

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]): void {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-STACK_MAX)));
  } catch {
    /* quota */
  }
}

export function ensureMypageScrollManualRestoration(): void {
  try {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }
}

/**
 * 이번 화면 진입이 「돌아옴」인지 — 내정보 안에서 지나온 화면 순서로 판정한다.
 * (실측 2026-11-02: 앱 화면 전환이 popstate 를 먼저 처리해 popstate 신호로는 뒤로가기를 알 수 없었다)
 * - 바로 전 화면으로 이동 = 뒤로(헤더 ‹ · 기기 뒤로 · 브라우저 뒤로) → 그 화면 위치 복원
 * - 다른 도메인에 갔다가 같은 내정보 화면으로 돌아옴 = 복원
 * - 그 외 = 새 진입 → 맨 위
 */
export function noteMypageScrollVisit(pathname: string): "return" | "new" {
  const stack = readStack();
  const top = stack[stack.length - 1];
  const prev = stack[stack.length - 2];
  if (top === pathname) return "return";
  if (prev === pathname) {
    stack.pop();
    writeStack(stack);
    return "return";
  }
  stack.push(pathname);
  writeStack(stack);
  return "new";
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

/**
 * 저장 위치로 — 화면 전환(뒤로 300ms 애니메이션)·늦게 커지는 내용이 위치를 덮어쓰므로
 * 목표 위치에 닿아 0.5초 유지될 때까지(최대 3초) 매 프레임 확인해 다시 맞춘다. 사용자가 손대면(터치·휠·키) 즉시 멈춘다.
 * 실측 2026-11-02: 저장값은 맞는데 전환 끝에 0 으로 덮여 복원이 안 되던 결함.
 */
export function restoreMypageScrollTo(targetY: number): () => void {
  let raf = 0;
  let cancelled = false;
  const started = performance.now();
  let reachedAt: number | null = null;
  const stop = () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("touchstart", stop, true);
    window.removeEventListener("wheel", stop, true);
    window.removeEventListener("keydown", stop, true);
  };
  window.addEventListener("touchstart", stop, { capture: true, passive: true });
  window.addEventListener("wheel", stop, { capture: true, passive: true });
  window.addEventListener("keydown", stop, true);
  const tick = () => {
    if (cancelled) return;
    const root = getMainAppScrollRoot();
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const want = Math.min(targetY, max);
    if (Math.abs(root.scrollTop - want) > 1) {
      setMainAppScrollTop(want, { behavior: "auto", scrollRoot: root });
    }
    const now = performance.now();
    const atTarget = max + 1 >= targetY && Math.abs(root.scrollTop - targetY) <= 1;
    if (atTarget) reachedAt ??= now;
    else reachedAt = null;
    const settled = reachedAt != null && now - reachedAt >= RESTORE_SETTLE_MS;
    if (!settled && now - started < RESTORE_WINDOW_MS) raf = requestAnimationFrame(tick);
    else stop();
  };
  tick();
  return stop;
}

export function scrollMypageToTop(): void {
  setMainAppScrollTop(0, { behavior: "auto", scrollRoot: getMainAppScrollRoot() });
}

export function currentMypageScrollTop(): number {
  return getMainAppScrollTop();
}
