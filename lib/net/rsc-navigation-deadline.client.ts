/**
 * 화면 이동 요청(RSC) 상한 관문 — 설계 `docs/audit/idle-menu-freeze-design-2026-11-22.md` §S2.
 *
 * 문제(감사 F1): Next 16.1.7 화면 이동 요청에는 시간 제한·중단 신호가 없다
 * (`next/dist/client/components/router-reducer/fetch-server-response.js:96` — `createFetch` 에 signal 미전달).
 * 요청이 멈추면 경로가 확정되지 않아 누른 메뉴의 화면이 끝없이 바뀌지 않는다.
 *
 * 계약:
 * - 응답 머리가 `NAVIGATION_STALL_DEADLINE_MS`(8초) 안에 오지 않으면 요청을 중단한다. 회복은 Next 가 한다 —
 *   요청 실패 시 「브라우저 이동으로 대체」(`fetch-server-response.js` catch → MPA, `app-router.js` location.assign/replace).
 *   우리가 만드는 회복 경로는 없다.
 * - 대상 (모두 해당할 때만): 같은 출처 · 헤더 `rsc: 1` · `next-router-prefetch` 없음(미리받기 제외) ·
 *   `next-action` 없음(서버 액션 제외) · 호출 쪽 signal 없음 · 목표 경로 ≠ 지금 경로(`router.refresh`·같은 화면 쿼리 변경 제외) ·
 *   통화 경로 아님 · 내 통화 없음(통화 변경 규정 — 통화 동작 무변경).
 * - 머리가 온 뒤 본문 멈춤은 덮지 않는다(새 Response 를 만들면 Next 가 쓰는 res.url·res.redirected 가 사라짐). 하단 탭은 감시가 받친다.
 * - 정상 경로에서 새 요청 0건. 멈춤 때만 계측 1건(`nav_stall`).
 */
import { readOwnLiveCall } from "@/lib/call/own-live-call";
import {
  NAVIGATION_STALL_DEADLINE_MS,
  isCallPathForNavigationStall,
  navigationStallTarget,
} from "@/lib/net/navigation-stall-policy";
import { noteNavigationStall } from "@/lib/telemetry/entry-telemetry.client";

type FetchLike = typeof fetch;

const INSTALLED_MARK = "__dibayRscNavigationDeadline";

export type RscNavigationDeadlineDeps = {
  deadlineMs: number;
  /** 지금 문서 주소 */
  currentHref: () => string;
  /** 내 통화가 있으면 true (판정 실패도 true — 통화 중일 수 있음) */
  hasLiveCall: () => boolean;
  onStall: (info: { waitedMs: number; targetPath: string }) => void;
};

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

function readHeaders(init: RequestInit | undefined): Headers | null {
  try {
    return new Headers(init?.headers);
  } catch {
    return null;
  }
}

/**
 * 대상 판정 — 대상이면 목표 경로, 아니면 null. 순수 함수(시험 대상).
 * `input` 이 Request 면 대상 아님(Next 이동 요청은 URL·문자열로 부른다 · Request 는 자체 signal 을 가진다).
 */
export function resolveRscNavigationDeadlineTarget(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  currentHref: string
): string | null {
  if (typeof input !== "string" && !(input instanceof URL)) return null;
  if (init?.signal) return null;
  const h = readHeaders(init);
  if (!h || h.get("rsc") !== "1") return null;
  if (h.has("next-router-prefetch") || h.has("next-action")) return null;
  let target: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    target = new URL(typeof input === "string" ? input : input.href, current);
  } catch {
    return null;
  }
  if (target.origin !== current.origin) return null;
  const targetPath = normalizePath(target.pathname);
  if (targetPath === normalizePath(current.pathname)) return null;
  if (isCallPathForNavigationStall(targetPath) || isCallPathForNavigationStall(current.pathname)) return null;
  return targetPath;
}

/** 진행 중인 대상 이동 요청 — 하단 탭 감시가 먼저 끝날 때 같은 요청을 중단해 문서 이동이 한 번만 일어나게 한다 */
type Inflight = { controller: AbortController; timer: ReturnType<typeof setTimeout> | null };
const inflight = new Set<Inflight>();

function settle(entry: Inflight): void {
  if (entry.timer != null) clearTimeout(entry.timer);
  entry.timer = null;
  inflight.delete(entry);
}

export function wrapFetchWithRscNavigationDeadline(base: FetchLike, deps: RscNavigationDeadlineDeps): FetchLike {
  const gated = function rscNavigationDeadlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let targetPath: string | null = null;
    try {
      targetPath = resolveRscNavigationDeadlineTarget(input, init, deps.currentHref());
      if (targetPath != null && deps.hasLiveCall()) targetPath = null;
    } catch {
      targetPath = null;
    }
    if (targetPath == null || typeof AbortController !== "function") return base(input, init);

    const controller = new AbortController();
    const startedAt = Date.now();
    const entry: Inflight = { controller, timer: null };
    const path = targetPath;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (!inflight.has(entry)) return;
      inflight.delete(entry);
      try {
        deps.onStall({ waitedMs: Date.now() - startedAt, targetPath: path });
      } catch {
        /* 계측 실패는 무시 */
      }
      controller.abort();
    }, deps.deadlineMs);
    inflight.add(entry);
    let p: Promise<Response>;
    try {
      p = base(input, { ...init, signal: controller.signal });
    } catch (err) {
      settle(entry);
      throw err;
    }
    return p.then(
      (res) => {
        settle(entry);
        return res;
      },
      (err: unknown) => {
        settle(entry);
        throw err;
      }
    );
  } as FetchLike;
  (gated as unknown as Record<string, boolean>)[INSTALLED_MARK] = true;
  return gated;
}

/**
 * 하단 탭 감시가 상한에 닿았을 때 — 진행 중인 대상 이동 요청이 있으면 중단해 Next 의 문서 이동 1회에 맡긴다(true).
 * 없으면 false — 머리는 왔는데 화면이 안 바뀐 경우이므로 감시가 직접 문서 이동한다.
 */
export function expireStalledRscNavigations(): boolean {
  if (inflight.size === 0) return false;
  const entries = [...inflight];
  inflight.clear();
  for (const e of entries) {
    if (e.timer != null) clearTimeout(e.timer);
    e.timer = null;
    try {
      e.controller.abort();
    } catch {
      /* noop */
    }
  }
  return true;
}

function hasLiveCallNow(): boolean {
  try {
    return readOwnLiveCall() != null;
  } catch {
    return true;
  }
}

/** 문서당 1회 — `AppBootProvider` 모듈 로드 때(다른 fetch 관문과 같은 곳). 멱등. 서버에서는 무동작. */
export function installRscNavigationDeadline(): void {
  try {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    if ((window.fetch as unknown as Record<string, boolean>)[INSTALLED_MARK]) return;
    window.fetch = wrapFetchWithRscNavigationDeadline(window.fetch.bind(window), {
      deadlineMs: NAVIGATION_STALL_DEADLINE_MS,
      currentHref: () => window.location.href,
      hasLiveCall: hasLiveCallNow,
      onStall: ({ waitedMs, targetPath }) =>
        noteNavigationStall("nav_stall", { waitedMs, target: navigationStallTarget(targetPath) }, { reloadFollows: true }),
    });
  } catch {
    /* 설치 실패 → 기존 fetch 그대로 */
  }
}

/** 시험 전용 */
export function __resetRscNavigationDeadlineForTest(): void {
  expireStalledRscNavigations();
}
