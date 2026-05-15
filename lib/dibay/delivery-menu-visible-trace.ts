"use client";

/**
 * store_click → menu first visible 구간 분해.
 * shell/route prefetch 는 건드리지 않음 — menus fetch·normalize·첫 섹션·첫 paint 만.
 *
 * phase 는 navigation session(`nav_t0`) 에 묶인다. 카드 클릭으로 nav_t0 기록 후 beginNavSession.
 */

import {
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_MENU_FETCH_COMPLETE,
  DELIVERY_PERF_TAG_MENU_FETCH_START,
  DELIVERY_PERF_TAG_MENU_FIRST_SECTION_READY,
  DELIVERY_PERF_TAG_MENU_FIRST_VISIBLE,
  DELIVERY_PERF_TAG_MENU_NORMALIZE_MS,
  DELIVERY_PERF_TAG_MENU_VISIBLE_BREAKDOWN,
} from "@/lib/dibay/delivery-perf-trace";

const K_NAV_T0 = "dibay:perf:nav_t0";
const K_NAV_SLUG = "dibay:perf:nav_slug";
const K_SHELL_PHASES = "dibay:shell-entry-phases:";
const K_MENU_PHASES = "dibay:menu-visible-phases:";
const K_MENU_BREAKDOWN_DONE = "dibay:menu-visible-breakdown-done:";
const K_NORMALIZE_WORK_MS = "dibay:menu-visible-normalize-work-ms:";

const NAV_SESSION_SLACK_MS = 48;

export type DeliveryMenuVisiblePhase =
  | "menu_fetch_start"
  | "menu_fetch_complete"
  | "menu_data_ready"
  | "normalize_complete"
  | "first_section_ready"
  | "first_visible";

type MenuVisibleTraceBag = {
  nav_t0: number | null;
  phases: Partial<Record<DeliveryMenuVisiblePhase, number>>;
};

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function routeNow(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function readNavT0(): number | null {
  try {
    const raw = sessionStorage.getItem(K_NAV_T0);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function resolveSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (typeof sessionStorage === "undefined") return s;
  try {
    const nav = sessionStorage.getItem(K_NAV_SLUG)?.trim().toLowerCase();
    if (nav) return nav;
  } catch {
    /* ignore */
  }
  return s;
}

function menuPhasesKey(slug: string): string {
  return K_MENU_PHASES + resolveSlug(slug);
}

function parseMenuTraceBag(raw: string): MenuVisibleTraceBag {
  try {
    const parsed = JSON.parse(raw) as MenuVisibleTraceBag | Partial<Record<DeliveryMenuVisiblePhase, number>>;
    if (parsed && typeof parsed === "object" && "phases" in parsed && parsed.phases) {
      return {
        nav_t0: typeof parsed.nav_t0 === "number" && Number.isFinite(parsed.nav_t0) ? parsed.nav_t0 : null,
        phases: parsed.phases ?? {},
      };
    }
    return {
      nav_t0: readNavT0(),
      phases: (parsed ?? {}) as Partial<Record<DeliveryMenuVisiblePhase, number>>,
    };
  } catch {
    return { nav_t0: null, phases: {} };
  }
}

function readMenuTraceBag(slug: string): MenuVisibleTraceBag {
  if (typeof sessionStorage === "undefined") return { nav_t0: null, phases: {} };
  try {
    const raw = sessionStorage.getItem(menuPhasesKey(slug));
    if (!raw) return { nav_t0: null, phases: {} };
    return parseMenuTraceBag(raw);
  } catch {
    return { nav_t0: null, phases: {} };
  }
}

function writeMenuTraceBag(slug: string, bag: MenuVisibleTraceBag): void {
  if (typeof sessionStorage === "undefined") return;
  const s = resolveSlug(slug);
  if (!s) return;
  try {
    sessionStorage.setItem(menuPhasesKey(s), JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

function readMenuPhases(slug: string): Partial<Record<DeliveryMenuVisiblePhase, number>> {
  return readMenuTraceBag(slug).phases;
}

function isPhaseInNavSession(phaseTs: number, navT0: number | null): boolean {
  if (navT0 == null) return true;
  return phaseTs >= navT0 - NAV_SESSION_SLACK_MS;
}

function sessionNavT0(slug: string): number | null {
  const bag = readMenuTraceBag(slug);
  return bag.nav_t0 ?? readNavT0();
}

function clearMenuTraceArtifacts(slug: string): void {
  const s = resolveSlug(slug);
  if (!s || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(menuPhasesKey(s));
    sessionStorage.removeItem(K_MENU_BREAKDOWN_DONE + s);
    sessionStorage.removeItem(K_NORMALIZE_WORK_MS + s);
  } catch {
    /* quota */
  }
}

function writeMenuPhase(slug: string, phase: DeliveryMenuVisiblePhase, t: number): void {
  const s = resolveSlug(slug);
  if (!s) return;
  const bag = readMenuTraceBag(s);
  const navT0 = sessionNavT0(s);
  if (!isPhaseInNavSession(t, navT0)) return;
  if (bag.phases[phase] != null) return;
  writeMenuTraceBag(s, {
    nav_t0: bag.nav_t0 ?? navT0,
    phases: { ...bag.phases, [phase]: t },
  });
}

function overwriteMenuFetchStart(slug: string, t: number): void {
  const s = resolveSlug(slug);
  if (!s) return;
  const bag = readMenuTraceBag(s);
  const navT0 = sessionNavT0(s);
  if (!isPhaseInNavSession(t, navT0)) return;
  writeMenuTraceBag(s, {
    nav_t0: bag.nav_t0 ?? navT0,
    phases: { ...bag.phases, menu_fetch_start: t },
  });
}

function readNormalizeWorkMs(slug: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(K_NORMALIZE_WORK_MS + resolveSlug(slug));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
  } catch {
    return null;
  }
}

function readShellVisibleAt(slug: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(K_SHELL_PHASES + resolveSlug(slug));
    if (!raw) return null;
    const phases = JSON.parse(raw) as { shell_visible?: number; shell_perceived_visible?: number };
    const p = phases.shell_visible ?? phases.shell_perceived_visible;
    return p != null && Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

function sinceClickMs(t: number): number | null {
  const t0 = readNavT0();
  if (t0 == null) return null;
  return Math.max(0, Math.round(t - t0));
}

/** nav_t0 기록 직후 호출 — 카드 onClick·상세 loadSplitDetail 진입 */
export function deliveryMenuVisibleBeginNavSession(slug: string): void {
  if (typeof sessionStorage === "undefined") return;
  const s = resolveSlug(slug);
  if (!s) return;
  clearMenuTraceArtifacts(s);
  writeMenuTraceBag(s, { nav_t0: readNavT0(), phases: {} });
}

export function deliveryMenuVisibleResetForNavigation(slug: string): void {
  deliveryMenuVisibleBeginNavSession(slug);
}

/** @deprecated `deliveryMenuVisibleBeginNavSession` */
export function deliveryMenuVisibleRefreshTraceForSlug(slug: string): void {
  deliveryMenuVisibleBeginNavSession(slug);
}

export function deliveryMenuVisibleMarkFetchStart(slug: string): void {
  const s = resolveSlug(slug);
  const t = perfNow();
  const bag = readMenuTraceBag(s);
  if (bag.nav_t0 == null) {
    deliveryMenuVisibleBeginNavSession(s);
  }
  overwriteMenuFetchStart(s, t);
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_FETCH_START, {
    event: "menu_fetch_start",
    slug: s,
    since_click_ms: sinceClickMs(t),
  });
}

/** @deprecated — `deliveryMenuVisibleMarkMenuDataReady` */
export function deliveryMenuVisibleMarkFetchComplete(slug: string): void {
  deliveryMenuVisibleMarkMenuDataReady(slug);
}

/** 상세 페이지가 menus JSON 을 apply 직전에 확보한 시점 */
export function deliveryMenuVisibleMarkMenuDataReady(slug: string): void {
  if (readMenuPhases(slug).menu_data_ready != null) return;
  const t = perfNow();
  writeMenuPhase(slug, "menu_data_ready", t);
  writeMenuPhase(slug, "menu_fetch_complete", t);
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_FETCH_COMPLETE, {
    event: "menu_data_ready",
    slug: resolveSlug(slug),
    since_click_ms: sinceClickMs(t),
  });
}

export function deliveryMenuVisibleMarkNormalizeComplete(slug: string, durationMs: number): void {
  const t = perfNow();
  const workMs = Math.max(0, Math.round(durationMs));
  writeMenuPhase(slug, "normalize_complete", t);
  try {
    sessionStorage.setItem(K_NORMALIZE_WORK_MS + resolveSlug(slug), String(workMs));
  } catch {
    /* quota */
  }
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_NORMALIZE_MS, {
    event: "normalize_complete",
    slug: resolveSlug(slug),
    duration_ms: workMs,
    since_click_ms: sinceClickMs(t),
  });
}

export function deliveryMenuVisibleMarkFirstSectionReady(slug: string, sectionCount: number): void {
  if (readMenuPhases(slug).first_section_ready != null) return;
  const t = perfNow();
  writeMenuPhase(slug, "first_section_ready", t);
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_FIRST_SECTION_READY, {
    event: "first_section_ready",
    slug: resolveSlug(slug),
    section_count: sectionCount,
    since_click_ms: sinceClickMs(t),
  });
}

function scheduleMenuVisibleBreakdown(slug: string): void {
  if (typeof window === "undefined") {
    deliveryMenuVisibleEmitBreakdown(slug);
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => deliveryMenuVisibleEmitBreakdown(slug));
  });
}

export function deliveryMenuVisibleMarkFirstVisible(slug: string, source: string): void {
  if (readMenuPhases(slug).first_visible != null) return;
  const t = perfNow();
  writeMenuPhase(slug, "first_visible", t);
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_FIRST_VISIBLE, {
    event: "first_visible",
    slug: resolveSlug(slug),
    source,
    since_click_ms: sinceClickMs(t),
  });
  scheduleMenuVisibleBreakdown(slug);
}

function filterPhasesForSession(
  phases: Partial<Record<DeliveryMenuVisiblePhase, number>>,
  navT0: number | null
): Partial<Record<DeliveryMenuVisiblePhase, number>> {
  if (navT0 == null) return phases;
  const out: Partial<Record<DeliveryMenuVisiblePhase, number>> = {};
  for (const [k, v] of Object.entries(phases) as [DeliveryMenuVisiblePhase, number][]) {
    if (v != null && isPhaseInNavSession(v, navT0)) {
      out[k] = v;
    }
  }
  return out;
}

export function deliveryMenuVisibleEmitBreakdown(slug: string): void {
  if (!deliveryPerfTraceEnabled()) return;
  const s = resolveSlug(slug);
  const navT0 = readNavT0();
  if (navT0 == null) return;

  try {
    if (sessionStorage.getItem(K_MENU_BREAKDOWN_DONE + s)) return;
    sessionStorage.setItem(K_MENU_BREAKDOWN_DONE + s, "1");
  } catch {
    /* quota */
  }

  const bag = readMenuTraceBag(s);
  const sessionT0 = bag.nav_t0 ?? navT0;
  if (sessionT0 != null && Math.abs(sessionT0 - navT0) > NAV_SESSION_SLACK_MS) {
    return;
  }

  const phases = filterPhasesForSession(bag.phases, sessionT0);
  const shellVisible = readShellVisibleAt(s);
  const missingPhases = new Set<string>();
  let stale_session = false;

  const delta = (from: DeliveryMenuVisiblePhase, to: DeliveryMenuVisiblePhase): number | null => {
    const a = phases[from];
    const b = phases[to];
    if (a == null) missingPhases.add(from);
    if (b == null) missingPhases.add(to);
    if (a == null || b == null) return null;
    if (sessionT0 != null && (!isPhaseInNavSession(a, sessionT0) || !isPhaseInNavSession(b, sessionT0))) {
      stale_session = true;
      return null;
    }
    return Math.max(0, Math.round(b - a));
  };

  const since = (phase: DeliveryMenuVisiblePhase): number | null => {
    const p = phases[phase];
    if (p == null) {
      missingPhases.add(phase);
      return null;
    }
    return Math.max(0, Math.round(p - navT0));
  };

  const shellToFetchStartMs =
    shellVisible != null && phases.menu_fetch_start != null
      ? Math.max(0, Math.round(phases.menu_fetch_start - shellVisible))
      : null;

  const normalizeWorkMs = readNormalizeWorkMs(s);
  if (normalizeWorkMs == null) {
    missingPhases.add("normalize_work_ms");
  }

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_VISIBLE_BREAKDOWN, {
    event: "menu_visible_breakdown",
    slug: s,
    route: routeNow(),
    trace_session_nav_t0: sessionT0,
    stale_session,
    shell_visible_to_menu_fetch_start_ms: shellToFetchStartMs,
    menu_fetch_ms: delta("menu_fetch_start", "menu_data_ready"),
    normalize_ms: normalizeWorkMs,
    apply_ms: delta("menu_data_ready", "normalize_complete"),
    first_section_ms: delta("normalize_complete", "first_section_ready"),
    render_ms: delta("first_section_ready", "first_visible"),
    tap_to_menu_fetch_start_ms: since("menu_fetch_start"),
    tap_to_menu_first_visible_ms: since("first_visible"),
    missing_phases: [...missingPhases],
  });
}

export function resetDeliveryMenuVisibleTraceForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (
      k?.startsWith(K_MENU_PHASES) ||
      k?.startsWith(K_MENU_BREAKDOWN_DONE) ||
      k?.startsWith(K_NORMALIZE_WORK_MS)
    ) {
      keys.push(k);
    }
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
