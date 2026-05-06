export type DibayMyInfoPerfKey =
  | "nav_click_ms"
  | "route_start_ms"
  | "rsc_done_ms"
  | "first_shell_visible_ms"
  | "profile_card_visible_ms"
  | "menu_visible_ms"
  | "first_content_visible_ms"
  | "api_start_ms"
  | "api_done_ms"
  | "supabase_query_start_ms"
  | "supabase_query_done_ms"
  | "hydration_done_ms"
  | "total_click_to_visible_ms";

type PerfState = {
  runId: string;
  baseMs: number;
  marks: Partial<Record<DibayMyInfoPerfKey, number>>;
  lastHref?: string;
};

const PREFIX = "[dibay-myinfo-perf]";

function nowMs(): number {
  // Called only from effects/handlers.
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function getState(): PerfState | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __dibayMyInfoPerf?: PerfState };
  return w.__dibayMyInfoPerf ?? null;
}

function setState(next: PerfState) {
  const w = window as unknown as { __dibayMyInfoPerf?: PerfState };
  w.__dibayMyInfoPerf = next;
}

export function dibayMyInfoPerfReset(reason: string) {
  if (typeof window === "undefined") return;
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const baseMs = nowMs();
  const next: PerfState = { runId, baseMs, marks: {} };
  setState(next);
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} reset`, { runId, reason });
}

export function dibayMyInfoPerfMark(key: DibayMyInfoPerfKey, extra?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const s = getState();
  if (!s) return;
  const t = nowMs();
  s.marks[key] = t;
  setState(s);
  const rel = Math.round(t - s.baseMs);
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${key}`, { runId: s.runId, rel_ms: rel, abs_ms: Math.round(t), ...extra });
}

export function dibayMyInfoPerfNavClick(href: string) {
  if (typeof window === "undefined") return;
  dibayMyInfoPerfReset("nav_click");
  const s = getState();
  if (!s) return;
  s.lastHref = href;
  setState(s);
  dibayMyInfoPerfMark("nav_click_ms", { href });
}

export function dibayMyInfoPerfMaybeLogTotal(extra?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const s = getState();
  const nav = s?.marks.nav_click_ms;
  const visible = s?.marks.first_content_visible_ms ?? s?.marks.profile_card_visible_ms ?? null;
  if (nav == null || visible == null) return;
  const total = Math.round(visible - nav);
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} total_click_to_visible_ms`, { runId: s?.runId, ms: total, ...extra });
}

