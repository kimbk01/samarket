/**
 * 하단 탭 컨트롤러 — 하단 탭의 「선택 표시 · 화면 교체 시점 · 실패 · 멈춤 대비」 단일 결정권자.
 * 계약: `lib/main-menu/main-bottom-nav-interaction-contract.ts` (v2, Owner 2026-11-15 승인 S1~S3).
 * 설계: `docs/design/bottom-nav-naver-ssot-audit-design-2026-11-15.md` §5.
 *
 * - 손을 뗀 순간(click) `beginBottomNavShowing` → `showing`. 같은 프레임에
 *   하단 탭 `[data-active]`(BottomNav) · 보관 화면 또는 뼈대(HubRetentionStack) · 셸 머리글(ConditionalAppShell)이 이 상태를 읽어 바뀐다.
 * - Next 경로가 목표로 확정되면 `settleBottomNavForLocation` → `idle`. 거부되면 `failBottomNavShowing` → `idle`(원래 탭으로).
 * - `showing` 이 `BOTTOM_NAV_SETTLE_WATCHDOG_MS` 안에 끝나지 않으면 그 이동을 문서 이동으로 1회 전환한다
 *   (Next 16.1.7 이동 요청에는 시간 제한이 없다 — `fetch-server-response.js` `createFetch` 에 signal 없음).
 *
 * 시계는 `Date.now()` — 기기 잠자기 동안에도 흐르므로 복귀 직후 감시가 바로 판정된다(S3 복귀 작업).
 */

export type BottomNavControllerPhase = "idle" | "showing";

export type BottomNavShowingTarget = {
  /** 이동 1회 식별 */
  id: number;
  tabId: string;
  /** 정규화된 목표 주소(경로+검색) */
  href: string;
  /** 목표 경로(검색 제외, 끝 슬래시 제거) */
  path: string;
  /** 목표 검색 문자열(`?` 제외) */
  search: string;
  startedAt: number;
};

export type BottomNavControllerState =
  | { phase: "idle"; lastSettledId: number }
  | ({ phase: "showing" } & BottomNavShowingTarget);

/** 11-10 실측 최장(배포 직후 문서 이동) 2.5초의 3배 이상, 세션 확인 상한 12초보다 짧게 */
export const BOTTOM_NAV_SETTLE_WATCHDOG_MS = 8_000;

/** 감시가 문서 이동으로 전환했을 때 남기는 진단 기록(sessionStorage) */
export const BOTTOM_NAV_WATCHDOG_TRACE_KEY = "dibay:bottom-nav:watchdog-escalated";

const BASE = "https://dibay.local";

function normalizePath(path: string): string {
  const p = path.trim().replace(/\/+$/, "");
  return p || "/";
}

export function parseBottomNavTarget(href: string): { href: string; path: string; search: string } {
  const u = new URL(href, BASE);
  const path = normalizePath(u.pathname);
  const search = u.searchParams.toString();
  return { href: search ? `${path}?${search}` : path, path, search };
}

/** 경로가 목표에 도착했는지 — 경로만 본다(메신저 `?section`·커뮤니티 복원 쿼리는 화면이 정함) */
export function isBottomNavTargetReached(target: Pick<BottomNavShowingTarget, "path">, pathname: string | null): boolean {
  if (!pathname) return false;
  return normalizePath(pathname) === target.path;
}

// ─── 순수 전이 (단위 시험 대상) ─────────────────────────────────────────────

export function reduceBegin(
  prev: BottomNavControllerState,
  input: { tabId: string; href: string; now: number }
): BottomNavControllerState {
  const t = parseBottomNavTarget(input.href);
  const lastId = prev.phase === "showing" ? prev.id : prev.lastSettledId;
  return { phase: "showing", id: lastId + 1, tabId: input.tabId, ...t, startedAt: input.now };
}

export function reduceSettle(prev: BottomNavControllerState, pathname: string | null): BottomNavControllerState {
  if (prev.phase !== "showing") return prev;
  if (!isBottomNavTargetReached(prev, pathname)) return prev;
  return { phase: "idle", lastSettledId: prev.id };
}

export function reduceFail(prev: BottomNavControllerState, id?: number): BottomNavControllerState {
  if (prev.phase !== "showing") return prev;
  if (id != null && prev.id !== id) return prev;
  return { phase: "idle", lastSettledId: prev.id };
}

/** 감시 판정 — 시간이 지났고 아직 같은 이동이면 문서 이동 대상 */
export function shouldEscalateToDocumentNavigation(
  state: BottomNavControllerState,
  now: number,
  limitMs = BOTTOM_NAV_SETTLE_WATCHDOG_MS
): boolean {
  return state.phase === "showing" && now - state.startedAt >= limitMs;
}

// ─── 저장소 ────────────────────────────────────────────────────────────────

let state: BottomNavControllerState = { phase: "idle", lastSettledId: 0 };
const listeners = new Set<() => void>();
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
/** 문서 이동 전환 — 시험에서 바꿔 끼운다 */
let documentNavigate: (href: string) => void = (href) => {
  if (typeof window !== "undefined") window.location.replace(href);
};

function emit(next: BottomNavControllerState): void {
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
}

function clearWatchdog(): void {
  if (watchdogTimer != null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function armWatchdog(): void {
  clearWatchdog();
  if (state.phase !== "showing") return;
  const remaining = Math.max(0, state.startedAt + BOTTOM_NAV_SETTLE_WATCHDOG_MS - Date.now());
  const id = state.id;
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    checkBottomNavWatchdog(id);
  }, remaining);
}

/** 감시 판정 실행 — 타이머·복귀 작업(S3)이 부른다 */
export function checkBottomNavWatchdog(expectedId?: number): void {
  if (state.phase !== "showing") return;
  if (expectedId != null && state.id !== expectedId) return;
  if (!shouldEscalateToDocumentNavigation(state, Date.now())) {
    armWatchdog();
    return;
  }
  const href = state.href;
  const waitedMs = Date.now() - state.startedAt;
  emit({ phase: "idle", lastSettledId: state.id });
  clearWatchdog();
  /** 진단 — 감시 전환이 일어났는지 다음 문서에서 확인할 수 있게 (세션 안에서만) */
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(BOTTOM_NAV_WATCHDOG_TRACE_KEY, JSON.stringify({ href, waitedMs, at: Date.now() }));
    }
  } catch {
    /* 저장 불가 — 무시 */
  }
  documentNavigate(href);
}

export function getBottomNavControllerState(): BottomNavControllerState {
  return state;
}

export function subscribeBottomNavController(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const IDLE_SERVER_SNAPSHOT: BottomNavControllerState = { phase: "idle", lastSettledId: 0 };
export function getBottomNavControllerServerState(): BottomNavControllerState {
  return IDLE_SERVER_SNAPSHOT;
}

/** 손을 뗀 순간 1회 — 선택 표시·화면 교체를 시작한다. 반환값 = 이동 id */
export function beginBottomNavShowing(input: { tabId: string; href: string }): number {
  const next = reduceBegin(state, { ...input, now: Date.now() });
  emit(next);
  armWatchdog();
  return (next as BottomNavShowingTarget).id;
}

/** Next 경로 확정 때 — 목표 경로면 끝 */
export function settleBottomNavForLocation(pathname: string | null): void {
  const next = reduceSettle(state, pathname);
  if (next !== state) {
    emit(next);
    clearWatchdog();
  }
}

/** 이동이 나가지 못함(잠금·로그인 거부 등) — 원래 탭으로 */
export function failBottomNavShowing(id?: number): void {
  const next = reduceFail(state, id);
  if (next !== state) {
    emit(next);
    clearWatchdog();
  }
}

export function isBottomNavShowing(): boolean {
  return state.phase === "showing";
}

/** 시험 전용 */
export function __resetBottomNavControllerForTest(opts?: { documentNavigate?: (href: string) => void }): void {
  clearWatchdog();
  state = { phase: "idle", lastSettledId: 0 };
  listeners.clear();
  documentNavigate =
    opts?.documentNavigate ??
    ((href) => {
      if (typeof window !== "undefined") window.location.replace(href);
    });
}
