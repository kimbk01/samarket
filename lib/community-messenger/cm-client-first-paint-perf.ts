"use client";

/**
 * Messenger bootstrap lite — API 응답 이후 클라이언트 첫 페인트 계측.
 * 서버 bootstrap API·페이로드·unread 의미는 변경하지 않는다.
 *
 * Dev: `sessionStorage.setItem('samarket:debug:runtime','1')` 또는 `NEXT_PUBLIC_SAMARKET_CM_CLIENT_FIRST_PAINT=1`
 * 로그: `[cm-client-first-paint]`
 */

export type CmClientFirstPaintMark =
  | "bootstrap_fetch_start"
  | "bootstrap_response_received"
  | "room_list_state_apply_start"
  | "room_list_state_apply_end"
  | "first_room_row_rendered"
  | "unread_badge_rendered"
  | "skeleton_removed"
  | "list_interactive";

export type { CmClientFirstPaintPassFail } from "@/lib/community-messenger/cm-client-first-paint-lock";
import type { CmClientFirstPaintPassFail } from "@/lib/community-messenger/cm-client-first-paint-lock";

export type CmClientFirstPaintSession = {
  session_id: string;
  path: "lite_network" | "lite_cache_hit";
  marks: Partial<Record<CmClientFirstPaintMark, number>>;
  deltas_from_response_ms: Partial<Record<CmClientFirstPaintMark, number>>;
  room_list_re_render_count: number;
  finalized: boolean;
  pass_fail: CmClientFirstPaintPassFail | null;
};

import {
  cmClientFirstPaintPassLimits,
  isCmClientFirstPaintSessionPass,
  warnCmClientFirstPaintBaselineOnce,
} from "@/lib/community-messenger/cm-client-first-paint-lock";

const PASS_LIMITS = cmClientFirstPaintPassLimits();

let sessionCounter = 0;
let activeSession: CmClientFirstPaintSession | null = null;
const completedSessions: CmClientFirstPaintSession[] = [];

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function cmClientFirstPaintLoggingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_SAMARKET_CM_CLIENT_FIRST_PAINT === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return window.sessionStorage.getItem("samarket:debug:runtime") === "1";
  } catch {
    return false;
  }
}

function logLine(payload: Record<string, unknown>): void {
  if (!cmClientFirstPaintLoggingEnabled()) return;
  // eslint-disable-next-line no-console -- client first-paint measurement
  console.log("[cm-client-first-paint]", JSON.stringify(payload));
}

function perfMark(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`cm-client-first-paint:${name}`);
  } catch {
    /* ignore */
  }
}

function deltaFromResponse(session: CmClientFirstPaintSession, mark: CmClientFirstPaintMark): number | null {
  const responseAt = session.marks.bootstrap_response_received;
  const at = session.marks[mark];
  if (responseAt == null || at == null) return null;
  return Math.max(0, Math.round(at - responseAt));
}

function buildPassFail(session: CmClientFirstPaintSession): CmClientFirstPaintPassFail {
  const toFirstRow = deltaFromResponse(session, "first_room_row_rendered") ?? -1;
  const toSkeleton = deltaFromResponse(session, "skeleton_removed") ?? -1;
  const toInteractive = deltaFromResponse(session, "list_interactive") ?? -1;
  const rerenders = session.room_list_re_render_count;
  return {
    response_to_first_room_row_ms: {
      pass: toFirstRow >= 0 && toFirstRow <= PASS_LIMITS.response_to_first_room_row_ms,
      ms: toFirstRow,
      max: PASS_LIMITS.response_to_first_room_row_ms,
    },
    response_to_skeleton_removed_ms: {
      pass: toSkeleton >= 0 && toSkeleton <= PASS_LIMITS.response_to_skeleton_removed_ms,
      ms: toSkeleton,
      max: PASS_LIMITS.response_to_skeleton_removed_ms,
    },
    response_to_list_interactive_ms: {
      pass: toInteractive >= 0 && toInteractive <= PASS_LIMITS.response_to_list_interactive_ms,
      ms: toInteractive,
      max: PASS_LIMITS.response_to_list_interactive_ms,
    },
    room_list_re_render_count: {
      pass: rerenders <= PASS_LIMITS.room_list_re_render_max,
      count: rerenders,
      max: PASS_LIMITS.room_list_re_render_max,
    },
  };
}

function maybeFinalizeSession(session: CmClientFirstPaintSession): void {
  if (session.finalized) return;
  const hasResponse = session.marks.bootstrap_response_received != null;
  if (!hasResponse) return;
  if (session.marks.list_interactive == null) return;
  session.finalized = true;
  session.pass_fail = buildPassFail(session);
  for (const key of Object.keys(session.marks) as CmClientFirstPaintMark[]) {
    const d = deltaFromResponse(session, key);
    if (d != null) session.deltas_from_response_ms[key] = d;
  }
  completedSessions.push(session);
  if (completedSessions.length > 12) completedSessions.shift();
  const pf = session.pass_fail;
  const overallPass = isCmClientFirstPaintSessionPass(pf);
  if (!overallPass) {
    warnCmClientFirstPaintBaselineOnce(pf, {
      path: session.path,
      session_id: session.session_id,
    });
  }
  logLine({
    event: "session_complete",
    session_id: session.session_id,
    path: session.path,
    overall_pass: overallPass,
    marks: session.marks,
    deltas_from_response_ms: session.deltas_from_response_ms,
    room_list_re_render_count: session.room_list_re_render_count,
    pass_fail: pf,
    pass_limits: PASS_LIMITS,
  });
  if (activeSession === session) activeSession = null;
}

/** lite bootstrap fetch 시작 — 네트워크 또는 캐시 단락 직전 */
export function beginCmLiteClientFirstPaintSession(path: "lite_network" | "lite_cache_hit"): string {
  if (!cmClientFirstPaintLoggingEnabled()) return "";
  if (
    activeSession &&
    !activeSession.finalized &&
    activeSession.path === path &&
    activeSession.marks.bootstrap_fetch_start != null
  ) {
    return activeSession.session_id;
  }
  const session_id = `lite-${++sessionCounter}-${Math.round(nowMs())}`;
  activeSession = {
    session_id,
    path,
    marks: {},
    deltas_from_response_ms: {},
    room_list_re_render_count: 0,
    finalized: false,
    pass_fail: null,
  };
  markCmClientFirstPaint("bootstrap_fetch_start");
  if (path === "lite_cache_hit") {
    markCmClientFirstPaint("bootstrap_response_received");
    queueMicrotask(() => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          markCmClientFirstPaint("first_room_row_rendered");
          markCmClientFirstPaint("skeleton_removed");
          markCmClientFirstPaint("list_interactive");
        });
      }
    });
  }
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (!activeSession || activeSession.session_id !== session_id || activeSession.finalized) return;
      if (activeSession.marks.bootstrap_response_received == null) return;
      if (activeSession.marks.skeleton_removed == null) markCmClientFirstPaint("skeleton_removed");
      if (activeSession.marks.list_interactive == null) markCmClientFirstPaint("list_interactive");
      maybeFinalizeSession(activeSession);
    }, 6000);
  }
  return session_id;
}

export function markCmClientFirstPaint(mark: CmClientFirstPaintMark): void {
  if (!cmClientFirstPaintLoggingEnabled() || !activeSession) return;
  if (
    mark !== "bootstrap_fetch_start" &&
    mark !== "bootstrap_response_received" &&
    activeSession.marks.bootstrap_response_received == null
  ) {
    return;
  }
  if (activeSession.marks[mark] != null) return;
  const at = nowMs();
  activeSession.marks[mark] = at;
  perfMark(`${activeSession.session_id}:${mark}`);
  logLine({
    event: "mark",
    session_id: activeSession.session_id,
    mark,
    at_ms: Math.round(at),
    delta_from_response_ms: deltaFromResponse(activeSession, mark),
    path: activeSession.path,
  });
  queueMicrotask(() => {
    if (activeSession) maybeFinalizeSession(activeSession);
  });
}

/** `CommunityMessengerHomeListPane` 렌더 — lite 세션 중 리스트 pane 리렌더 횟수 */
/** lite merge 직후 DOM 에 행이 이미 있으면 layout effect 대기 없이 mark */
export function probeCmLiteFirstPaintDomIfReady(): void {
  if (!activeSession || activeSession.finalized) return;
  if (
    activeSession.path !== "lite_cache_hit" &&
    activeSession.marks.bootstrap_response_received == null
  ) {
    return;
  }
  if (typeof document === "undefined") return;
  const frame = document.querySelector("[data-cm-home-frame]");
  if (!frame) return;
  const row = frame.querySelector('[data-messenger-chat-row="true"]');
  if (row && activeSession.marks.first_room_row_rendered == null) {
    markCmClientFirstPaint("first_room_row_rendered");
  }
  if (!frame.querySelector("[data-cm-home-skeleton]") && activeSession.marks.skeleton_removed == null) {
    markCmClientFirstPaint("skeleton_removed");
  }
  const interactive =
    frame.querySelector('[data-messenger-chat-row="true"] a[href*="/community-messenger/rooms/"]') ??
    frame.querySelector('[data-messenger-chat-row="true"] [role="button"]') ??
    frame.querySelector('[data-messenger-chat-row="true"]');
  if (interactive instanceof HTMLElement && activeSession.marks.list_interactive == null) {
    markCmClientFirstPaint("list_interactive");
  }
}

export function recordCmLiteListPaneRenderForFirstPaint(): void {
  if (!activeSession || activeSession.finalized) return;
  if (activeSession.marks.bootstrap_response_received == null) return;
  activeSession.room_list_re_render_count += 1;
}

export function getCmClientFirstPaintActiveSessionId(): string | null {
  return activeSession?.session_id ?? null;
}

export function dumpCmClientFirstPaintSessions(): CmClientFirstPaintSession[] {
  return [...completedSessions, ...(activeSession ? [activeSession] : [])];
}

declare global {
  interface Window {
    __cmClientFirstPaintDump?: () => CmClientFirstPaintSession[];
  }
}

if (typeof window !== "undefined") {
  window.__cmClientFirstPaintDump = dumpCmClientFirstPaintSessions;
}
