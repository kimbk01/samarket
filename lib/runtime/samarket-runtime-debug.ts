/**
 * 프로필링/누수 점검용 런타임 로그 — 기본 꺼짐.
 *
 * 켜기: `sessionStorage.setItem("samarket:debug:runtime", "1")` 후 새로고침.
 * 끄기: `sessionStorage.removeItem("samarket:debug:runtime")`.
 *
 * 메신저 홈 계측 카운터: `getMessengerHomeDebugCounts()` — 디버그 여부와 무관하게 누적(세션 단위).
 */

export function samarketRuntimeDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem("samarket:debug:runtime") === "1";
  } catch {
    return false;
  }
}

export function samarketRuntimeDebugLog(tag: string, message: string, extra?: Record<string, unknown>): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[samarket-debug:${tag}] ${message}`, extra ?? "");
  }
}

export type MessengerHomeDebugEvent =
  | "messenger_home_bootstrap_start"
  | "messenger_home_bootstrap_success"
  | "messenger_home_refresh_start"
  | "messenger_home_refresh_success"
  | "messenger_home_refresh_skip_non_silent_inflight"
  | "messenger_home_warm_start"
  | "messenger_home_warm_skip_cached"
  | "messenger_home_warm_success"
  | "messenger_home_badge_resync"
  | "messenger_home_subscribe_create"
  | "messenger_home_subscribe_cleanup"
  | "messenger_home_visibility_resume";

const messengerHomeDebugCounts: Partial<Record<MessengerHomeDebugEvent, number>> = {};

let messengerHomeDebugCountsExposedToWindow = false;

/** 세션 누적 호출 수(테스트·보고용). 디버그 플래그와 무관. */
export function getMessengerHomeDebugCounts(): Readonly<Record<string, number>> {
  return { ...messengerHomeDebugCounts } as Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// 앱 전역 성능 계측 (sessionStorage 디버그 on 일 때만 카운터·마지막 ms 갱신)
// ---------------------------------------------------------------------------

export type AppWidePerfCounter =
  | "app_bootstrap_start"
  | "app_bootstrap_success"
  | "auth_session_resolve_start"
  | "auth_session_resolve_success"
  | "profile_resolve_start"
  | "profile_resolve_success"
  | "first_menu_list_fetch_start"
  | "first_menu_list_fetch_success"
  | "first_menu_list_render"
  | "trade_list_fetch_start"
  | "trade_list_fetch_success"
  | "community_list_fetch_start"
  | "community_list_fetch_success"
  | "messenger_list_fetch_start"
  | "messenger_list_fetch_success"
  | "trade_list_render"
  | "community_list_render"
  | "realtime_subscribe_create"
  | "realtime_subscribe_cleanup"
  | "visibility_resume"
  | "route_reenter"
  | "list_refetch"
  | "summary_merge"
  | "list_sort"
  | "list_filter"
  | "badge_compute"
  | "chat_input_keydown"
  | "chat_input_state_commit"
  | "chat_input_render"
  | "chat_send_start"
  | "chat_send_success";

const APP_WIDE_PERF_COUNTS_GLOBAL_KEY = "__samarketAppWidePerfCounts" as const;

function appWidePerfCountsStore(): Partial<Record<AppWidePerfCounter, number>> {
  const g = globalThis as unknown as { [APP_WIDE_PERF_COUNTS_GLOBAL_KEY]?: Partial<Record<AppWidePerfCounter, number>> };
  let m = g[APP_WIDE_PERF_COUNTS_GLOBAL_KEY];
  if (!m) {
    m = {};
    g[APP_WIDE_PERF_COUNTS_GLOBAL_KEY] = m;
  }
  return m;
}
/**
 * 마지막으로 측정된 구간 ms (`sessionStorage samarket:debug:runtime=1` 일 때만 갱신).
 * 표준 키: `auth_session_resolve_ms`, `profile_resolve_ms`, `trade_list_fetch_ms`, `community_list_fetch_ms`,
 * `messenger_list_fetch_ms`, `keydown_to_commit_ms`, `keydown_to_paint_ms`,
 * 보조: `trade_list_to_paint_ms`, `community_list_to_paint_ms`, `messenger_list_to_paint_ms`,
 * `login_double_raf_ms`, `login_fetch_auth_session_ms`, `login_until_navigation_ms`, `app_bootstrap_ms`.
 *
 * 화면·구간 고유(덮어쓰기 완화): 거래 `trade_home_posts_fetch_network_ms`, `trade_home_posts_fetch_json_ms`,
 * `trade_home_posts_result_build_ms`, `trade_list_to_paint_wall_ms`; 커뮤니티 `community_list_fetch_network_ms`,
 * `community_list_fetch_json_ms`, `community_list_merge_ms`, `community_list_render_prepare_ms`,
 * `community_list_paint_raf_ms`, `community_list_to_paint_ms`(기존); 메신저 `messenger_bootstrap_fetch_network_ms`,
 * `messenger_bootstrap_fetch_wall_ms`, `messenger_bootstrap_to_paint_ms`.
 *
 * `globalThis` 보관: Turbopack/청크 분할 등으로 동일 모듈이 이중 로드될 때 기록·스냅샷이 서로 다른 맵을 보던 문제 방지.
 */
const APP_WIDE_PHASE_LAST_MS_GLOBAL_KEY = "__samarketAppWidePhaseLastMs" as const;

/**
 * Playwright `page.evaluate` 가 `globalThis.__samarketAppWidePhaseLastMs` 와 다른 타이밍/가시성을 가질 때
 * 동일 origin `sessionStorage` 로 E2E·스냅샷이 확실히 읽도록 한다(값은 `samarket:debug:runtime=1` 일 때만 갱신).
 */
export const SAMARKET_E2E_COMMUNITY_PHASE_SESSION_KEY = "samarket:debug:e2e:communityPhaseLastMs" as const;

function appWidePhaseLastMsStore(): Record<string, number> {
  const g = globalThis as unknown as { [APP_WIDE_PHASE_LAST_MS_GLOBAL_KEY]?: Record<string, number> };
  let m = g[APP_WIDE_PHASE_LAST_MS_GLOBAL_KEY];
  if (!m) {
    m = {};
    g[APP_WIDE_PHASE_LAST_MS_GLOBAL_KEY] = m;
  }
  return m;
}

/** `visibility_resume` 는 `MainAppProviderTree` 의 `document.visibilitychange` 만 집계(메신저 홈과 이중 카운트 방지). */
const MESSENGER_HOME_DEBUG_TO_APP_WIDE: Partial<Record<MessengerHomeDebugEvent, AppWidePerfCounter>> = {
  messenger_home_subscribe_create: "realtime_subscribe_create",
  messenger_home_subscribe_cleanup: "realtime_subscribe_cleanup",
};

let firstMenuListFetchStartDone = false;
let firstMenuListFetchSuccessDone = false;
let firstMenuListRenderDone = false;

export function bumpAppWidePerf(counter: AppWidePerfCounter): void {
  if (!samarketRuntimeDebugEnabled()) return;
  exposeMessengerHomeDebugApiToWindowOnce();
  const c = appWidePerfCountsStore();
  c[counter] = (c[counter] ?? 0) + 1;
}

export function recordAppWidePhaseLastMs(phaseKey: string, ms: number): void {
  /**
   * 필라이프 피드 분해 키는 클라이언트에서 `getAppWidePhaseLastMs` / 스냅샷으로 읽히는 globalThis 맵에
   * 디버그 플래그와 무관하게 먼저 기록한다(146행 이전 return 으로 사라지는 문제 방지).
   * Node SSR 경로에서는 동일 키가 오염되지 않게 window 가 있을 때만 쓴다.
   */
  if (phaseKey.startsWith("community_list_") && typeof window !== "undefined") {
    appWidePhaseLastMsStore()[phaseKey] = ms;
    /** Playwright `page.evaluate` 가 globalThis phase 맵과 어긋날 때 — 동일 `window` 객체에 E2E·수동용 복제 */
    const w = window as unknown as { __samarketCommunityListPhaseProbe?: Record<string, number> };
    w.__samarketCommunityListPhaseProbe = { ...(w.__samarketCommunityListPhaseProbe ?? {}), [phaseKey]: ms };
    try {
      const allowE2eSessionMirror =
        samarketRuntimeDebugEnabled() ||
        (typeof process !== "undefined" && process.env.NODE_ENV === "development");
      if (allowE2eSessionMirror) {
        const prevRaw = sessionStorage.getItem(SAMARKET_E2E_COMMUNITY_PHASE_SESSION_KEY);
        const prev = (prevRaw ? (JSON.parse(prevRaw) as Record<string, number>) : {}) as Record<string, number>;
        sessionStorage.setItem(
          SAMARKET_E2E_COMMUNITY_PHASE_SESSION_KEY,
          JSON.stringify({ ...prev, [phaseKey]: ms })
        );
      }
    } catch {
      /* quota / private mode */
    }
  }
  if (process.env.NODE_ENV === "development" && phaseKey.startsWith("community_list_") && typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[samarket-runtime-debug:phase]", {
      phaseKey,
      ms,
      runtimeDebugOn: samarketRuntimeDebugEnabled(),
      storeKeys: Object.keys(appWidePhaseLastMsStore()),
    });
  }
  if (!samarketRuntimeDebugEnabled()) return;
  exposeMessengerHomeDebugApiToWindowOnce();
  appWidePhaseLastMsStore()[phaseKey] = ms;
}

export function getAppWidePerfCounts(): Readonly<Record<string, number>> {
  return { ...appWidePerfCountsStore() } as Readonly<Record<string, number>>;
}

export function getAppWidePhaseLastMs(): Readonly<Record<string, number>> {
  return { ...appWidePhaseLastMsStore() };
}

/** 첫 메인 메뉴 리스트 fetch 시작(앱당 1회) */
export function tryTrackFirstMenuListFetchStart(): void {
  if (!samarketRuntimeDebugEnabled() || firstMenuListFetchStartDone) return;
  firstMenuListFetchStartDone = true;
  bumpAppWidePerf("first_menu_list_fetch_start");
}

/** 첫 메인 메뉴 리스트 fetch 성공(앱당 1회) */
export function tryTrackFirstMenuListFetchSuccess(): void {
  if (!samarketRuntimeDebugEnabled() || firstMenuListFetchSuccessDone) return;
  firstMenuListFetchSuccessDone = true;
  bumpAppWidePerf("first_menu_list_fetch_success");
}

/** 첫 메인 메뉴 리스트가 실제로 그려질 때(앱당 1회) */
export function tryTrackFirstMenuListRender(): void {
  if (!samarketRuntimeDebugEnabled() || firstMenuListRenderDone) return;
  firstMenuListRenderDone = true;
  bumpAppWidePerf("first_menu_list_render");
}

let chatInputKeydownAt = 0;

export function notifyChatInputKeydownForPerf(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  bumpAppWidePerf("chat_input_keydown");
  chatInputKeydownAt = performance.now();
}

/**
 * textarea onChange 이후(React state 반영 직후) 호출 — keydown 직후면 keydown→commit ms 기록.
 */
export function notifyChatInputCommitForPerf(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  bumpAppWidePerf("chat_input_state_commit");
  if (chatInputKeydownAt > 0) {
    appWidePhaseLastMsStore()["keydown_to_commit_ms"] = Math.round(performance.now() - chatInputKeydownAt);
    const kd = chatInputKeydownAt;
    chatInputKeydownAt = 0;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          appWidePhaseLastMsStore()["keydown_to_paint_ms"] = Math.round(performance.now() - kd);
        });
      });
    }
  }
}

export function notifyChatInputRenderForPerf(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  bumpAppWidePerf("chat_input_render");
}

export function notifyChatSendStartForPerf(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  bumpAppWidePerf("chat_send_start");
}

export function notifyChatSendSuccessForPerf(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  bumpAppWidePerf("chat_send_success");
}

export function samarketMessengerHomeDebugEvent(
  event: MessengerHomeDebugEvent,
  extra?: Record<string, unknown>
): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeDebugCounts[event] = (messengerHomeDebugCounts[event] ?? 0) + 1;
  const appMirror = MESSENGER_HOME_DEBUG_TO_APP_WIDE[event];
  if (appMirror) bumpAppWidePerf(appMirror);
  if (samarketRuntimeDebugEnabled() && typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[samarket-debug:messenger-home] ${event}`, {
      count: messengerHomeDebugCounts[event],
      ...extra,
    });
  }
}

// ---------------------------------------------------------------------------
// 렌더·목록·배지 비용 (sessionStorage 디버그 on 일 때만 카운트 증가)
// ---------------------------------------------------------------------------

export type MessengerRenderPerfEvent =
  | "messenger_home_render"
  | "messenger_home_list_render"
  | "messenger_bottom_nav_render"
  | "messenger_badge_compute"
  | "messenger_room_summary_merge"
  | "messenger_room_list_sort"
  | "messenger_room_list_filter"
  | "messenger_room_row_render";

const messengerRenderPerfCounts: Partial<Record<MessengerRenderPerfEvent, number>> = {};

const MESSENGER_RENDER_TO_APP_WIDE: Partial<Record<MessengerRenderPerfEvent, AppWidePerfCounter>> = {
  messenger_room_summary_merge: "summary_merge",
  messenger_room_list_sort: "list_sort",
  messenger_room_list_filter: "list_filter",
  messenger_badge_compute: "badge_compute",
};

export function bumpMessengerRenderPerf(event: MessengerRenderPerfEvent): void {
  if (!samarketRuntimeDebugEnabled()) return;
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerRenderPerfCounts[event] = (messengerRenderPerfCounts[event] ?? 0) + 1;
  const mirror = MESSENGER_RENDER_TO_APP_WIDE[event];
  if (mirror) bumpAppWidePerf(mirror);
}

export function getMessengerRenderPerfCounts(): Readonly<Record<string, number>> {
  return { ...messengerRenderPerfCounts } as Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// 강제 검증용 — `runSingleFlight` 내부에서 실제로 실행된 네트워크만 집계
// ---------------------------------------------------------------------------

export type MessengerHomeBootstrapNetworkMode = "lite" | "full" | "fresh";

export type RouteEntryPerfScope = "community_detail" | "messenger_room_entry" | "product_detail";

type RouteEntryPerfState = {
  activeCycleId: number;
  startedAt: number;
  targetPath: string;
  fetchNetworkRecordedCycleId: number;
  jsonParseCycleId: number;
  firstContentRenderCycleId: number;
  fullRenderCycleId: number;
  firstInteractiveCycleId: number;
  toPaintCycleId: number;
  customMetricCycleIds: Record<string, number>;
};

const ROUTE_ENTRY_PERF_SESSION_KEY_PREFIX = "samarket:debug:route-entry:" as const;
const ROUTE_ENTRY_PERF_STATE_GLOBAL_KEY = "__samarketRouteEntryPerfState" as const;

function emptyRouteEntryPerfState(): RouteEntryPerfState {
  return {
    activeCycleId: 0,
    startedAt: 0,
    targetPath: "",
    fetchNetworkRecordedCycleId: 0,
    jsonParseCycleId: 0,
    firstContentRenderCycleId: 0,
    fullRenderCycleId: 0,
    firstInteractiveCycleId: 0,
    toPaintCycleId: 0,
    customMetricCycleIds: {},
  };
}

function routeEntryPerfStatesStore(): Record<RouteEntryPerfScope, RouteEntryPerfState> {
  const g = globalThis as unknown as {
    [ROUTE_ENTRY_PERF_STATE_GLOBAL_KEY]?: Record<RouteEntryPerfScope, RouteEntryPerfState>;
  };
  let store = g[ROUTE_ENTRY_PERF_STATE_GLOBAL_KEY];
  if (!store) {
    store = {
      community_detail: emptyRouteEntryPerfState(),
      messenger_room_entry: emptyRouteEntryPerfState(),
      product_detail: emptyRouteEntryPerfState(),
    };
    g[ROUTE_ENTRY_PERF_STATE_GLOBAL_KEY] = store;
  }
  return store;
}

function routeEntryPerfSessionKey(scope: RouteEntryPerfScope): string {
  return `${ROUTE_ENTRY_PERF_SESSION_KEY_PREFIX}${scope}`;
}

function readRouteEntryPerfState(scope: RouteEntryPerfScope): RouteEntryPerfState {
  const store = routeEntryPerfStatesStore();
  const state = store[scope];
  if (state.startedAt > 0) return state;
  if (typeof window === "undefined") return state;
  try {
    const raw = sessionStorage.getItem(routeEntryPerfSessionKey(scope));
    if (!raw) return state;
    const parsed = JSON.parse(raw) as Partial<RouteEntryPerfState>;
    if (typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt) && parsed.startedAt > 0) {
      state.activeCycleId = typeof parsed.activeCycleId === "number" ? parsed.activeCycleId : 1;
      state.startedAt = parsed.startedAt;
      state.targetPath = typeof parsed.targetPath === "string" ? parsed.targetPath : "";
    }
  } catch {
    /* ignore */
  }
  return state;
}

function writeRouteEntryPerfState(scope: RouteEntryPerfScope, state: RouteEntryPerfState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      routeEntryPerfSessionKey(scope),
      JSON.stringify({
        activeCycleId: state.activeCycleId,
        startedAt: state.startedAt,
        targetPath: state.targetPath,
      })
    );
  } catch {
    /* ignore */
  }
}

function recordRouteEntryElapsedPhase(
  scope: RouteEntryPerfScope,
  phaseKey: string,
  field:
    | "fetchNetworkRecordedCycleId"
    | "jsonParseCycleId"
    | "firstContentRenderCycleId"
    | "fullRenderCycleId"
    | "firstInteractiveCycleId"
    | "toPaintCycleId"
): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = readRouteEntryPerfState(scope);
  if (state.startedAt <= 0 || state[field] === state.activeCycleId) return;
  state[field] = state.activeCycleId;
  recordAppWidePhaseLastMs(phaseKey, Math.round(performance.now() - state.startedAt));
}

export function beginRouteEntryPerf(scope: RouteEntryPerfScope, targetPath: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = routeEntryPerfStatesStore()[scope];
  state.activeCycleId += 1;
  state.startedAt = performance.now();
  state.targetPath = targetPath;
  state.fetchNetworkRecordedCycleId = 0;
  state.jsonParseCycleId = 0;
  state.firstContentRenderCycleId = 0;
  state.fullRenderCycleId = 0;
  state.firstInteractiveCycleId = 0;
  state.toPaintCycleId = 0;
  state.customMetricCycleIds = {};
  writeRouteEntryPerfState(scope, state);
  if (scope === "messenger_room_entry") {
    recordAppWidePhaseLastMs(`${scope}_room_route_enter_ms`, 0);
  }
}

export function recordRouteEntryRouteTotalMs(scope: RouteEntryPerfScope, ms: number | null | undefined): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return;
  recordAppWidePhaseLastMs(`${scope}_route_total_ms`, Math.round(ms));
}

export function recordRouteEntryFetchNetworkMs(scope: RouteEntryPerfScope, ms: number | null | undefined): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return;
  const state = readRouteEntryPerfState(scope);
  if (state.fetchNetworkRecordedCycleId === state.activeCycleId) return;
  state.fetchNetworkRecordedCycleId = state.activeCycleId;
  recordAppWidePhaseLastMs(`${scope}_fetch_network_ms`, Math.round(ms));
}

export function recordRouteEntryFetchNetworkFromResources(scope: RouteEntryPerfScope, matchers: string[]): void {
  if (!samarketRuntimeDebugEnabled() || typeof performance === "undefined") return;
  const state = readRouteEntryPerfState(scope);
  if (state.startedAt <= 0 || state.fetchNetworkRecordedCycleId === state.activeCycleId) return;
  const candidates = performance
    .getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .filter((entry) => entry.startTime + entry.duration >= state.startedAt)
    .filter((entry) => {
      const target = entry.name;
      return matchers.some((matcher) => matcher && target.includes(matcher));
    });
  const picked = candidates[candidates.length - 1];
  if (!picked) return;
  recordRouteEntryFetchNetworkMs(scope, Math.round((picked.responseEnd || picked.duration) - picked.startTime));
}

export function recordRouteEntryJsonParseComplete(scope: RouteEntryPerfScope): void {
  recordRouteEntryElapsedPhase(scope, `${scope}_json_parse_complete_ms`, "jsonParseCycleId");
}

export function recordRouteEntryFirstContentRender(scope: RouteEntryPerfScope): void {
  recordRouteEntryElapsedPhase(scope, `${scope}_first_content_render_ms`, "firstContentRenderCycleId");
}

export function recordRouteEntryFullRender(scope: RouteEntryPerfScope): void {
  recordRouteEntryElapsedPhase(scope, `${scope}_full_render_ms`, "fullRenderCycleId");
}

export function recordRouteEntryFirstInteractive(scope: RouteEntryPerfScope): void {
  recordRouteEntryElapsedPhase(scope, `${scope}_first_interactive_ms`, "firstInteractiveCycleId");
}

export function recordRouteEntryMetric(
  scope: RouteEntryPerfScope,
  metricSuffix: string,
  value: number | null | undefined
): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  recordAppWidePhaseLastMs(`${scope}_${metricSuffix}`, Math.round(value));
}

export function recordRouteEntryElapsedMetric(scope: RouteEntryPerfScope, metricSuffix: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = readRouteEntryPerfState(scope);
  if (state.startedAt <= 0) return;
  recordAppWidePhaseLastMs(`${scope}_${metricSuffix}`, Math.round(performance.now() - state.startedAt));
}

export function recordRouteEntryElapsedMetricOnce(scope: RouteEntryPerfScope, metricSuffix: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = readRouteEntryPerfState(scope);
  if (state.startedAt <= 0) return;
  if (state.customMetricCycleIds[metricSuffix] === state.activeCycleId) return;
  state.customMetricCycleIds[metricSuffix] = state.activeCycleId;
  recordAppWidePhaseLastMs(`${scope}_${metricSuffix}`, Math.round(performance.now() - state.startedAt));
}

export function recordRouteEntryResourceMetricRangeFromResources(
  scope: RouteEntryPerfScope,
  opts: {
    startMetricSuffix: string;
    endMetricSuffix: string;
    matchers: string[];
    initiatorTypes?: string[];
    pick?: "first" | "last";
  }
): void {
  if (!samarketRuntimeDebugEnabled() || typeof performance === "undefined") return;
  const state = readRouteEntryPerfState(scope);
  if (state.startedAt <= 0) return;
  const startKey = opts.startMetricSuffix;
  const endKey = opts.endMetricSuffix;
  if (
    state.customMetricCycleIds[startKey] === state.activeCycleId &&
    state.customMetricCycleIds[endKey] === state.activeCycleId
  ) {
    return;
  }
  const initiatorTypes = opts.initiatorTypes?.filter(Boolean) ?? [];
  const candidates = performance
    .getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .filter((entry) => entry.startTime >= state.startedAt)
    .filter((entry) => {
      if (initiatorTypes.length > 0 && !initiatorTypes.includes(entry.initiatorType)) return false;
      const target = entry.name;
      return opts.matchers.every((matcher) => target.includes(matcher));
    })
    .sort((a, b) => a.startTime - b.startTime);
  const picked = opts.pick === "last" ? candidates[candidates.length - 1] : candidates[0];
  if (!picked) return;
  const startMs = Math.max(0, Math.round(picked.startTime - state.startedAt));
  const endMs = Math.max(0, Math.round((picked.responseEnd || picked.startTime + picked.duration) - state.startedAt));
  state.customMetricCycleIds[startKey] = state.activeCycleId;
  state.customMetricCycleIds[endKey] = state.activeCycleId;
  recordAppWidePhaseLastMs(`${scope}_${startKey}`, startMs);
  recordAppWidePhaseLastMs(`${scope}_${endKey}`, endMs);
}

export function scheduleRouteEntryToPaint(scope: RouteEntryPerfScope): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = readRouteEntryPerfState(scope);
  if (state.startedAt <= 0 || state.toPaintCycleId === state.activeCycleId) return;
  state.toPaintCycleId = state.activeCycleId;
  if (typeof requestAnimationFrame !== "function") {
    queueMicrotask(() => {
      recordAppWidePhaseLastMs(`${scope}_to_paint_ms`, Math.round(performance.now() - state.startedAt));
    });
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      recordAppWidePhaseLastMs(`${scope}_to_paint_ms`, Math.round(performance.now() - state.startedAt));
    });
  });
}

type MessengerBootstrapClientPhaseState = {
  activeCycleId: number;
  startedAt: number;
  jsonParseCycleId: number;
  firstListItemRenderCycleId: number;
  fullListRenderCycleId: number;
  firstInteractiveCycleId: number;
};

const MESSENGER_BOOTSTRAP_CLIENT_PHASE_STATE_GLOBAL_KEY = "__samarketMessengerBootstrapClientPhaseState" as const;

function messengerBootstrapClientPhaseStateStore(): MessengerBootstrapClientPhaseState {
  const g = globalThis as unknown as {
    [MESSENGER_BOOTSTRAP_CLIENT_PHASE_STATE_GLOBAL_KEY]?: MessengerBootstrapClientPhaseState;
  };
  let state = g[MESSENGER_BOOTSTRAP_CLIENT_PHASE_STATE_GLOBAL_KEY];
  if (!state) {
    state = {
      activeCycleId: 0,
      startedAt: 0,
      jsonParseCycleId: 0,
      firstListItemRenderCycleId: 0,
      fullListRenderCycleId: 0,
      firstInteractiveCycleId: 0,
    };
    g[MESSENGER_BOOTSTRAP_CLIENT_PHASE_STATE_GLOBAL_KEY] = state;
  }
  return state;
}

function recordMessengerBootstrapClientElapsedPhase(
  phaseKey: string,
  field: "jsonParseCycleId" | "firstListItemRenderCycleId" | "fullListRenderCycleId" | "firstInteractiveCycleId"
): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = messengerBootstrapClientPhaseStateStore();
  if (state.startedAt <= 0 || state[field] === state.activeCycleId) return;
  state[field] = state.activeCycleId;
  recordAppWidePhaseLastMs(phaseKey, Math.round(performance.now() - state.startedAt));
}

export function beginMessengerBootstrapClientPhase(_mode: MessengerHomeBootstrapNetworkMode): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const state = messengerBootstrapClientPhaseStateStore();
  state.activeCycleId += 1;
  state.startedAt = performance.now();
  state.jsonParseCycleId = 0;
  state.firstListItemRenderCycleId = 0;
  state.fullListRenderCycleId = 0;
  state.firstInteractiveCycleId = 0;
}

export function recordMessengerBootstrapResponseSizeBytes(bytes: number | null | undefined): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return;
  recordAppWidePhaseLastMs("messenger_bootstrap_response_size_bytes", Math.round(bytes));
}

export function recordMessengerBootstrapJsonParseComplete(): void {
  recordMessengerBootstrapClientElapsedPhase("messenger_bootstrap_json_parse_complete_ms", "jsonParseCycleId");
}

export function recordMessengerBootstrapFirstListItemRender(): void {
  recordMessengerBootstrapClientElapsedPhase(
    "messenger_bootstrap_first_list_item_render_ms",
    "firstListItemRenderCycleId"
  );
}

export function recordMessengerBootstrapFullListRender(): void {
  recordMessengerBootstrapClientElapsedPhase("messenger_bootstrap_full_list_render_ms", "fullListRenderCycleId");
}

export function recordMessengerBootstrapFirstInteractive(): void {
  recordMessengerBootstrapClientElapsedPhase("messenger_bootstrap_first_interactive_ms", "firstInteractiveCycleId");
}

type MessengerHomeVerificationState = {
  /** `fetchCommunityMessengerBootstrapClient` 팩토리가 실제 `fetch` 를 시작한 횟수(모드별) */
  bootstrapClientNetworkFetch: Record<MessengerHomeBootstrapNetworkMode, number>;
  /** `GET /api/community-messenger/home-sync` 팩토리 실행 횟수 */
  homeSyncNetworkFetch: number;
  /** `warmMessengerListBootstrapClient()` 호출(사이트 진입) — 네트워크와 별개 */
  warmCallSiteInvocations: number;
  /** `refresh()` 진입(맨 앞 — early return 포함 전부) */
  refreshInvocationTotal: number;
  refreshInvocationSilent: number;
  refreshInvocationNonSilent: number;
  /** 홈 Realtime 훅 effect 가 listener 를 등록한 깊이(0 이면 마운트 없음) */
  homeRealtimeReactListenerDepth: number;
  /** `bindCommunityMessengerHomeRealtimeChannels` 가 등록한 channel stop 핸들 개수 누적(현재 활성) */
  homeRealtimeSupabaseChannelDepth: number;
  /** `homeRealtimeEntries.size` / 리스너 ref 총합 — subscribe/cleanup 때 갱신 */
  homeRealtimeMapEntries: number;
  homeRealtimeMapListenerRefs: number;
};

const messengerHomeVerification: MessengerHomeVerificationState = {
  bootstrapClientNetworkFetch: { lite: 0, full: 0, fresh: 0 },
  homeSyncNetworkFetch: 0,
  warmCallSiteInvocations: 0,
  refreshInvocationTotal: 0,
  refreshInvocationSilent: 0,
  refreshInvocationNonSilent: 0,
  homeRealtimeReactListenerDepth: 0,
  homeRealtimeSupabaseChannelDepth: 0,
  homeRealtimeMapEntries: 0,
  homeRealtimeMapListenerRefs: 0,
};

/** Vitest 등 — 브라우저 세션 없이 카운터만 초기화 */
export function resetMessengerHomeVerificationStateForTests(): void {
  messengerHomeVerification.bootstrapClientNetworkFetch = { lite: 0, full: 0, fresh: 0 };
  messengerHomeVerification.homeSyncNetworkFetch = 0;
  messengerHomeVerification.warmCallSiteInvocations = 0;
  messengerHomeVerification.refreshInvocationTotal = 0;
  messengerHomeVerification.refreshInvocationSilent = 0;
  messengerHomeVerification.refreshInvocationNonSilent = 0;
  messengerHomeVerification.homeRealtimeReactListenerDepth = 0;
  messengerHomeVerification.homeRealtimeSupabaseChannelDepth = 0;
  messengerHomeVerification.homeRealtimeMapEntries = 0;
  messengerHomeVerification.homeRealtimeMapListenerRefs = 0;
  for (const k of Object.keys(messengerHomeDebugCounts)) {
    delete messengerHomeDebugCounts[k as MessengerHomeDebugEvent];
  }
  for (const k of Object.keys(messengerRenderPerfCounts)) {
    delete messengerRenderPerfCounts[k as MessengerRenderPerfEvent];
  }
  for (const k of Object.keys(appWidePerfCountsStore())) {
    delete appWidePerfCountsStore()[k as AppWidePerfCounter];
  }
  for (const k of Object.keys(appWidePhaseLastMsStore())) {
    delete appWidePhaseLastMsStore()[k];
  }
  firstMenuListFetchStartDone = false;
  firstMenuListFetchSuccessDone = false;
  firstMenuListRenderDone = false;
  chatInputKeydownAt = 0;
  const bootstrapClientPhase = messengerBootstrapClientPhaseStateStore();
  bootstrapClientPhase.activeCycleId = 0;
  bootstrapClientPhase.startedAt = 0;
  bootstrapClientPhase.jsonParseCycleId = 0;
  bootstrapClientPhase.firstListItemRenderCycleId = 0;
  bootstrapClientPhase.fullListRenderCycleId = 0;
  bootstrapClientPhase.firstInteractiveCycleId = 0;
  const routeEntryPerfStates = routeEntryPerfStatesStore();
  (Object.keys(routeEntryPerfStates) as RouteEntryPerfScope[]).forEach((scope) => {
    routeEntryPerfStates[scope] = emptyRouteEntryPerfState();
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(routeEntryPerfSessionKey(scope));
      } catch {
        /* ignore */
      }
    }
  });
}

function exposeMessengerHomeDebugApiToWindowOnce(): void {
  if (messengerHomeDebugCountsExposedToWindow || typeof window === "undefined") return;
  if (!samarketRuntimeDebugEnabled()) return;
  messengerHomeDebugCountsExposedToWindow = true;
  const w = window as unknown as {
    getMessengerHomeDebugCounts?: typeof getMessengerHomeDebugCounts;
    getMessengerHomeVerificationSnapshot?: typeof getMessengerHomeVerificationSnapshot;
    getMessengerRenderPerfCounts?: typeof getMessengerRenderPerfCounts;
    getAppWidePerfCounts?: typeof getAppWidePerfCounts;
    getAppWidePhaseLastMs?: typeof getAppWidePhaseLastMs;
  };
  w.getMessengerHomeDebugCounts = getMessengerHomeDebugCounts;
  w.getMessengerHomeVerificationSnapshot = getMessengerHomeVerificationSnapshot;
  w.getMessengerRenderPerfCounts = getMessengerRenderPerfCounts;
  w.getAppWidePerfCounts = getAppWidePerfCounts;
  w.getAppWidePhaseLastMs = getAppWidePhaseLastMs;
}

/** `fetchCommunityMessengerBootstrapClient` 의 `runSingleFlight` 팩토리가 실행될 때만(실제 fetch 직전) */
export function recordMessengerHomeBootstrapClientNetworkFetch(mode: MessengerHomeBootstrapNetworkMode): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.bootstrapClientNetworkFetch[mode] += 1;
}

export function recordMessengerHomeHomeSyncNetworkFetch(): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.homeSyncNetworkFetch += 1;
}

export function recordMessengerHomeWarmCallSiteInvocation(): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.warmCallSiteInvocations += 1;
}

export function recordMessengerHomeRefreshInvocation(silent: boolean): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.refreshInvocationTotal += 1;
  if (silent) messengerHomeVerification.refreshInvocationSilent += 1;
  else messengerHomeVerification.refreshInvocationNonSilent += 1;
  bumpAppWidePerf("list_refetch");
}

export function recordMessengerHomeRealtimeReactListenerGaugeDelta(delta: 1 | -1): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.homeRealtimeReactListenerDepth += delta;
}

export function recordMessengerHomeSupabaseHomeChannelGaugeDelta(delta: number): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.homeRealtimeSupabaseChannelDepth += delta;
}

export function publishMessengerHomeRealtimeMapSnapshot(entries: number, listenerRefs: number): void {
  exposeMessengerHomeDebugApiToWindowOnce();
  messengerHomeVerification.homeRealtimeMapEntries = entries;
  messengerHomeVerification.homeRealtimeMapListenerRefs = listenerRefs;
}

export function getMessengerHomeVerificationSnapshot(): Readonly<
  MessengerHomeVerificationState & {
    bootstrapClientNetworkFetchTotal: number;
    messengerHomeDebugEvents: Readonly<Record<string, number>>;
    messengerRenderPerf: Readonly<Record<string, number>>;
    appWidePerf: Readonly<Record<string, number>>;
    appWidePhaseLastMs: Readonly<Record<string, number>>;
  }
> {
  exposeMessengerHomeDebugApiToWindowOnce();
  const b = messengerHomeVerification.bootstrapClientNetworkFetch;
  const total = b.lite + b.full + b.fresh;
  let realtimeStore: Record<string, unknown> | null = null;
  if (typeof window !== "undefined") {
    const peek = (window as unknown as { peekMessengerRealtimeStoreDebugSnapshot?: () => Record<string, unknown> })
      .peekMessengerRealtimeStoreDebugSnapshot;
    if (typeof peek === "function") {
      try {
        realtimeStore = peek();
      } catch {
        realtimeStore = null;
      }
    }
  }
  return {
    ...messengerHomeVerification,
    bootstrapClientNetworkFetch: { ...b },
    bootstrapClientNetworkFetchTotal: total,
    messengerHomeDebugEvents: getMessengerHomeDebugCounts(),
    messengerRenderPerf: getMessengerRenderPerfCounts(),
    appWidePerf: getAppWidePerfCounts(),
    appWidePhaseLastMs: getAppWidePhaseLastMs(),
    ...(realtimeStore ? { realtimeStore } : {}),
  } as MessengerHomeVerificationState & {
    bootstrapClientNetworkFetchTotal: number;
    messengerHomeDebugEvents: Readonly<Record<string, number>>;
    messengerRenderPerf: Readonly<Record<string, number>>;
    appWidePerf: Readonly<Record<string, number>>;
    appWidePhaseLastMs: Readonly<Record<string, number>>;
    realtimeStore?: Record<string, unknown>;
  };
}

/** 디버그 플래그가 켜진 클라이언트 번들이 로드되면 한 틱 안에 `window` 에 스냅샷 API를 붙인다(Playwright·수동 검증). */
if (typeof window !== "undefined") {
  queueMicrotask(() => {
    try {
      if (sessionStorage.getItem("samarket:debug:runtime") === "1") {
        exposeMessengerHomeDebugApiToWindowOnce();
      }
    } catch {
      /* ignore */
    }
  });
}
