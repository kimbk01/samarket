"use client";

/**
 * X-1: 메신저 허브 목록(`[data-messenger-hub-list-scroll]`) 섹션별 scrollTop 저장·복원.
 *
 * - 저장: 스크롤 시 throttle 로 sessionStorage 에 기록(+ 언마운트 시 대기 중 값 즉시 기록).
 * - 복원: 마운트(= 방에서 돌아와 Home 재마운트, 목록 데이터가 있을 때만 렌더됨) 시 1회.
 *   콘텐츠가 아직 짧으면 몇 프레임 동안 재시도한다. 사용자가 먼저 만지면 즉시 중단.
 * - 탭 전환: 같은 컨테이너가 유지되므로 복원하지 않는다(기존 탭 전환 동작 그대로).
 * - sessionStorage 접근은 모두 try/catch — 실패해도 화면은 정상 동작.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export const MESSENGER_HUB_LIST_SCROLL_STORAGE_PREFIX = "cm:hub-list-scroll:v1:";
export const MESSENGER_HUB_LIST_SCROLL_SAVE_THROTTLE_MS = 150;
/** 콘텐츠 높이가 늦게 채워질 때 복원 재시도 최대 프레임 수(≈1초) */
export const MESSENGER_HUB_LIST_SCROLL_RESTORE_MAX_FRAMES = 60;

export function messengerHubListScrollStorageKey(scope: string, section: string): string {
  return `${MESSENGER_HUB_LIST_SCROLL_STORAGE_PREFIX}${scope}:${section}`;
}

export function readMessengerHubListScrollTop(key: string): number | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  } catch {
    return null;
  }
}

export function writeMessengerHubListScrollTop(key: string, top: number): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const v = Math.max(0, Math.round(top));
    if (v <= 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(v));
  } catch {
    /* storage blocked — ignore */
  }
}

type RafLike = {
  request: (cb: () => void) => number;
  cancel: (id: number) => void;
};

const defaultRaf: RafLike = {
  request: (cb) =>
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number),
  cancel: (id) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else clearTimeout(id);
  },
};

export function useMessengerHubListScrollMemory(
  scrollRef: RefObject<HTMLElement | null>,
  scope: string,
  section: string,
  raf: RafLike = defaultRaf
): void {
  const key = messengerHubListScrollStorageKey(scope, section);
  const keyRef = useRef(key);
  keyRef.current = key;
  /** 복원 진행 중에는 저장하지 않는다(짧은 콘텐츠에서 clamp 된 값이 목표를 덮어쓰지 않게) */
  const restoringRef = useRef(false);

  // 복원 — 마운트 1회(현재 섹션 기준)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = readMessengerHubListScrollTop(keyRef.current);
    if (target == null) return;
    restoringRef.current = true;
    let frames = 0;
    let rafId = 0;
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      restoringRef.current = false;
      if (rafId) raf.cancel(rafId);
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("wheel", stop);
    };
    const attempt = () => {
      if (done) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max >= target) {
        el.scrollTop = target;
        stop();
        return;
      }
      if (frames >= MESSENGER_HUB_LIST_SCROLL_RESTORE_MAX_FRAMES) {
        if (max > 0) el.scrollTop = max;
        stop();
        return;
      }
      frames += 1;
      rafId = raf.request(attempt);
    };
    el.addEventListener("pointerdown", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    attempt();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore (탭 전환 시 복원 금지)
  }, []);

  // 저장 — throttle
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { key: string; top: number } | null = null;
    const flush = () => {
      timer = null;
      if (!pending) return;
      writeMessengerHubListScrollTop(pending.key, pending.top);
      pending = null;
    };
    const onScroll = () => {
      if (restoringRef.current) return;
      pending = { key: keyRef.current, top: el.scrollTop };
      if (timer == null) timer = setTimeout(flush, MESSENGER_HUB_LIST_SCROLL_SAVE_THROTTLE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timer != null) clearTimeout(timer);
      flush();
    };
  }, [scrollRef]);
}
