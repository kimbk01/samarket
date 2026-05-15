"use client";

/**
 * 카드 탭 → 상세 shell visible 구간 분해 trace.
 * 기준점: dibay flow perf `K_NAV_T0` (performance.now, 카드 onClick 직전 기록).
 * breakdown 은 route `shell_visible` 1회만 emit (perceived overlay 시 emit 금지).
 */

import { deliveryStoreSummaryPrewarmArmFromSlowReadyRoute } from "@/lib/dibay/delivery-store-summary-prewarm";
import {
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_CARD_TAP,
  DELIVERY_PERF_TAG_DETAIL_CLIENT_MOUNT_START,
  DELIVERY_PERF_TAG_DETAIL_PAGE_ENTER,
  DELIVERY_PERF_TAG_DETAIL_SHELL_PERCEIVED_VISIBLE,
  DELIVERY_PERF_TAG_DETAIL_SHELL_RENDERED,
  DELIVERY_PERF_TAG_DETAIL_SHELL_VISIBLE,
  DELIVERY_PERF_TAG_ROUTE_LAYOUT_ENTER,
  DELIVERY_PERF_TAG_ROUTER_PUSH_START,
  DELIVERY_PERF_TAG_SHELL_ENTRY_BREAKDOWN,
  type DeliveryPerfTraceTag,
} from "@/lib/dibay/delivery-perf-trace";

const K_NAV_T0 = "dibay:perf:nav_t0";
const K_NAV_SLUG = "dibay:perf:nav_slug";
const K_PHASES = "dibay:shell-entry-phases:";
const K_NAV_CTX = "dibay:shell-entry-nav-ctx:";
const K_BREAKDOWN_DONE = "dibay:shell-entry-breakdown-done:";

export type DeliveryShellEntryPhase =
  | "card_tap"
  | "router_push_start"
  | "route_layout_enter"
  | "detail_page_enter"
  | "client_mount_start"
  | "shell_rendered"
  | "shell_visible"
  | "shell_perceived_visible";

const PHASE_TAG: Record<DeliveryShellEntryPhase, DeliveryPerfTraceTag> = {
  card_tap: DELIVERY_PERF_TAG_CARD_TAP,
  router_push_start: DELIVERY_PERF_TAG_ROUTER_PUSH_START,
  route_layout_enter: DELIVERY_PERF_TAG_ROUTE_LAYOUT_ENTER,
  detail_page_enter: DELIVERY_PERF_TAG_DETAIL_PAGE_ENTER,
  client_mount_start: DELIVERY_PERF_TAG_DETAIL_CLIENT_MOUNT_START,
  shell_rendered: DELIVERY_PERF_TAG_DETAIL_SHELL_RENDERED,
  shell_visible: DELIVERY_PERF_TAG_DETAIL_SHELL_VISIBLE,
  shell_perceived_visible: DELIVERY_PERF_TAG_DETAIL_SHELL_PERCEIVED_VISIBLE,
};

type ShellEntryNavContext = {
  prefetch_hit?: boolean;
  prefetch_age_ms?: number | null;
  was_prefetched_request?: boolean;
  was_prefetch_ready?: boolean;
  was_prefetch_inflight?: boolean;
  prefetch_request_age_ms?: number | null;
  prefetch_ready_age_ms?: number | null;
  prefetch_duration_ms?: number | null;
  had_perceived_overlay?: boolean;
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

function phasesKey(slug: string): string {
  return K_PHASES + slug.trim().toLowerCase();
}

function navCtxKey(slug: string): string {
  return K_NAV_CTX + slug.trim().toLowerCase();
}

function resolvePhaseSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (typeof sessionStorage === "undefined") return s;
  try {
    const navSlug = sessionStorage.getItem(K_NAV_SLUG)?.trim().toLowerCase();
    if (navSlug) return navSlug;
  } catch {
    /* ignore */
  }
  return s;
}

function readPhases(slug: string): Partial<Record<DeliveryShellEntryPhase, number>> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(phasesKey(resolvePhaseSlug(slug)));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<DeliveryShellEntryPhase, number>>;
  } catch {
    return {};
  }
}

function readNavContext(slug: string): ShellEntryNavContext {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(navCtxKey(resolvePhaseSlug(slug)));
    if (!raw) return {};
    return JSON.parse(raw) as ShellEntryNavContext;
  } catch {
    return {};
  }
}

function writeNavContext(slug: string, patch: ShellEntryNavContext): void {
  if (typeof sessionStorage === "undefined") return;
  const s = resolvePhaseSlug(slug);
  const prev = readNavContext(s);
  try {
    sessionStorage.setItem(navCtxKey(s), JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* quota */
  }
}

/** 카드 탭 직전 — 이전 navigation phase·breakdown 초기화 */
export function deliveryShellEntryBeginNavigation(slug: string): void {
  if (typeof sessionStorage === "undefined") return;
  const s = slug.trim().toLowerCase();
  if (!s) return;
  try {
    sessionStorage.removeItem(phasesKey(s));
    sessionStorage.removeItem(navCtxKey(s));
    sessionStorage.removeItem(K_BREAKDOWN_DONE + s);
  } catch {
    /* quota */
  }
}

function writePhase(slug: string, phase: DeliveryShellEntryPhase, t: number): void {
  if (typeof sessionStorage === "undefined") return;
  const s = resolvePhaseSlug(slug);
  if (!s) return;
  const prev = readPhases(s);
  if (prev[phase] != null) return;
  const next = { ...prev, [phase]: t };
  try {
    sessionStorage.setItem(phasesKey(s), JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export type DeliveryShellEntryMarkOpts = {
  slug: string;
  href?: string;
  prefetch_hit?: boolean;
  prefetch_age_ms?: number | null;
  was_prefetched_request?: boolean;
  was_prefetch_ready?: boolean;
  was_prefetch_inflight?: boolean;
  prefetch_request_age_ms?: number | null;
  prefetch_ready_age_ms?: number | null;
  prefetch_duration_ms?: number | null;
  seed_saved?: boolean;
  source?: string;
};

export function deliveryShellEntryMark(
  phase: DeliveryShellEntryPhase,
  opts: DeliveryShellEntryMarkOpts
): number {
  if (!deliveryPerfTraceEnabled()) return perfNow();
  const slug = opts.slug.trim();
  const t = perfNow();
  const t0 = readNavT0();
  const sinceClickMs = t0 != null ? Math.max(0, Math.round(t - t0)) : null;
  if (slug) {
    writePhase(slug, phase, t);
    if (phase === "card_tap") {
      writeNavContext(slug, {
        prefetch_hit: opts.was_prefetch_ready === true || opts.prefetch_hit === true,
        prefetch_age_ms: opts.prefetch_ready_age_ms ?? opts.prefetch_age_ms ?? null,
        was_prefetched_request: opts.was_prefetched_request === true,
        was_prefetch_ready: opts.was_prefetch_ready === true,
        was_prefetch_inflight: opts.was_prefetch_inflight === true,
        prefetch_request_age_ms: opts.prefetch_request_age_ms ?? null,
        prefetch_ready_age_ms: opts.prefetch_ready_age_ms ?? null,
        prefetch_duration_ms: opts.prefetch_duration_ms ?? null,
        had_perceived_overlay: false,
      });
    }
    if (phase === "shell_perceived_visible") {
      writeNavContext(slug, { had_perceived_overlay: true });
    }
  }

  deliveryPerfTraceLog(PHASE_TAG[phase], {
    event: phase,
    slug,
    href: opts.href,
    prefetch_hit: opts.prefetch_hit,
    prefetch_age_ms: opts.prefetch_age_ms ?? null,
    seed_saved: opts.seed_saved,
    source: opts.source,
    since_click_ms: sinceClickMs,
  });

  if (phase === "shell_visible") {
    deliveryShellEntryEmitBreakdown(slug);
  }

  return t;
}

/** route shell visible 시점에 tap→push→… 구간 ms 일괄 출력 (1회) */
export function deliveryShellEntryEmitBreakdown(slug: string): void {
  if (!deliveryPerfTraceEnabled()) return;
  const s = resolvePhaseSlug(slug);
  const t0 = readNavT0();
  if (t0 == null) return;
  try {
    if (sessionStorage.getItem(K_BREAKDOWN_DONE + s)) return;
    sessionStorage.setItem(K_BREAKDOWN_DONE + s, "1");
  } catch {
    /* quota */
  }

  const phases = readPhases(s);
  const ctx = readNavContext(s);
  const missingPhases = new Set<string>();

  const delta = (from: DeliveryShellEntryPhase, to: DeliveryShellEntryPhase): number | null => {
    const a = phases[from];
    const b = phases[to];
    if (a == null) missingPhases.add(from);
    if (b == null) missingPhases.add(to);
    if (a == null || b == null) return null;
    return Math.max(0, Math.round(b - a));
  };

  const since = (phase: DeliveryShellEntryPhase): number | null => {
    const p = phases[phase];
    if (p == null) {
      missingPhases.add(phase);
      return null;
    }
    return Math.max(0, Math.round(p - t0));
  };

  const hadPerceivedOverlay =
    ctx.had_perceived_overlay === true || phases.shell_perceived_visible != null;

  const pushToPageEnterMs = delta("router_push_start", "detail_page_enter");
  if (pushToPageEnterMs != null && pushToPageEnterMs > 100 && ctx.was_prefetch_ready === true) {
    deliveryStoreSummaryPrewarmArmFromSlowReadyRoute();
  }

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_SHELL_ENTRY_BREAKDOWN, {
    event: "shell_entry_breakdown",
    slug: s,
    route: routeNow(),
    tap_to_push_ms: delta("card_tap", "router_push_start"),
    push_to_page_enter_ms: pushToPageEnterMs,
    page_enter_to_client_mount_ms: delta("detail_page_enter", "client_mount_start"),
    client_mount_to_shell_rendered_ms: delta("client_mount_start", "shell_rendered"),
    shell_rendered_to_visible_ms: delta("shell_rendered", "shell_visible"),
    tap_to_route_shell_visible_ms: since("shell_visible"),
    tap_to_perceived_ms: since("shell_perceived_visible"),
    had_perceived_overlay: hadPerceivedOverlay,
    was_prefetched: ctx.was_prefetch_ready === true || ctx.prefetch_hit === true,
    prefetch_age_ms: ctx.prefetch_ready_age_ms ?? ctx.prefetch_age_ms ?? null,
    was_prefetched_request: ctx.was_prefetched_request === true,
    was_prefetch_ready: ctx.was_prefetch_ready === true,
    was_prefetch_inflight: ctx.was_prefetch_inflight === true,
    prefetch_request_age_ms: ctx.prefetch_request_age_ms ?? null,
    prefetch_ready_age_ms: ctx.prefetch_ready_age_ms ?? null,
    prefetch_duration_ms: ctx.prefetch_duration_ms ?? null,
    missing_phases: [...missingPhases],
  });
}

export function deliveryShellEntryScheduleRouterPushStart(slug: string, href: string): void {
  if (typeof window === "undefined") return;
  deliveryShellEntryMark("router_push_start", { slug, href });
}

export function resetDeliveryShellEntryTraceForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (
      k?.startsWith(K_PHASES) ||
      k?.startsWith(K_NAV_CTX) ||
      k?.startsWith(K_BREAKDOWN_DONE)
    ) {
      keys.push(k);
    }
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
