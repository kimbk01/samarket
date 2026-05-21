"use client";

/**
 * Messenger lite client first-paint — 회귀 방지 baseline (클라이언트 merge/render만).
 * 서버 bootstrap API·unread·realtime·trade enrich·room UI 구조는 이 파일 범위 밖.
 *
 * @see docs/messenger-client-first-paint-lock.md
 */

export type CmClientFirstPaintPassFail = {
  response_to_first_room_row_ms: { pass: boolean; ms: number; max: number };
  response_to_skeleton_removed_ms: { pass: boolean; ms: number; max: number };
  response_to_list_interactive_ms: { pass: boolean; ms: number; max: number };
  room_list_re_render_count: { pass: boolean; count: number; max: number };
};

function cmClientFirstPaintLoggingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_SAMARKET_CM_CLIENT_FIRST_PAINT === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return window.sessionStorage.getItem("samarket:debug:runtime") === "1";
  } catch {
    return false;
  }
}

import baselineJson from "@/lib/community-messenger/cm-client-first-paint-baseline.json";

/** Playwright·dev warn·PASS 판정 — `cm-client-first-paint-baseline.json` 과 동기화 */
export const CM_CLIENT_FIRST_PAINT_BASELINE = {
  response_to_first_room_row_ms: baselineJson.response_to_first_room_row_ms,
  response_to_skeleton_removed_ms: baselineJson.response_to_skeleton_removed_ms,
  response_to_list_interactive_ms: baselineJson.response_to_list_interactive_ms,
  room_list_re_render_max: baselineJson.room_list_re_render_max,
  server_lite_ms_recommended: baselineJson.server_lite_ms_recommended,
} as const;

export type CmClientFirstPaintBaseline = typeof CM_CLIENT_FIRST_PAINT_BASELINE;

export function cmClientFirstPaintPassLimits(): Pick<
  CmClientFirstPaintBaseline,
  | "response_to_first_room_row_ms"
  | "response_to_skeleton_removed_ms"
  | "response_to_list_interactive_ms"
  | "room_list_re_render_max"
> {
  return {
    response_to_first_room_row_ms: CM_CLIENT_FIRST_PAINT_BASELINE.response_to_first_room_row_ms,
    response_to_skeleton_removed_ms: CM_CLIENT_FIRST_PAINT_BASELINE.response_to_skeleton_removed_ms,
    response_to_list_interactive_ms: CM_CLIENT_FIRST_PAINT_BASELINE.response_to_list_interactive_ms,
    room_list_re_render_max: CM_CLIENT_FIRST_PAINT_BASELINE.room_list_re_render_max,
  };
}

export function isCmClientFirstPaintSessionPass(pf: CmClientFirstPaintPassFail): boolean {
  return (
    pf.response_to_first_room_row_ms.pass &&
    pf.response_to_skeleton_removed_ms.pass &&
    pf.response_to_list_interactive_ms.pass &&
    pf.room_list_re_render_count.pass
  );
}

let regressionWarnedThisLoad = false;

/** baseline 초과 시 dev 에서 `console.warn` 1회 (동일 탭 load) */
export function warnCmClientFirstPaintBaselineOnce(
  pf: CmClientFirstPaintPassFail,
  ctx?: { path?: string; session_id?: string }
): void {
  if (typeof window === "undefined") return;
  if (!cmClientFirstPaintLoggingEnabled()) return;
  if (regressionWarnedThisLoad) return;
  if (isCmClientFirstPaintSessionPass(pf)) return;

  const failures: string[] = [];
  if (!pf.response_to_first_room_row_ms.pass) {
    failures.push(
      `first_row ${pf.response_to_first_room_row_ms.ms}ms > ${pf.response_to_first_room_row_ms.max}ms`
    );
  }
  if (!pf.response_to_skeleton_removed_ms.pass) {
    failures.push(
      `skeleton ${pf.response_to_skeleton_removed_ms.ms}ms > ${pf.response_to_skeleton_removed_ms.max}ms`
    );
  }
  if (!pf.response_to_list_interactive_ms.pass) {
    failures.push(
      `interactive ${pf.response_to_list_interactive_ms.ms}ms > ${pf.response_to_list_interactive_ms.max}ms`
    );
  }
  if (!pf.room_list_re_render_count.pass) {
    failures.push(
      `re_renders ${pf.room_list_re_render_count.count} > ${pf.room_list_re_render_count.max}`
    );
  }
  if (failures.length === 0) return;

  regressionWarnedThisLoad = true;
  // eslint-disable-next-line no-console -- regression lock (dev only)
  console.warn("[cm-client-first-paint-lock] baseline exceeded", {
    failures,
    baseline: CM_CLIENT_FIRST_PAINT_BASELINE,
    pass_fail: pf,
    path: ctx?.path,
    session_id: ctx?.session_id,
    doc: "docs/messenger-client-first-paint-lock.md",
  });
}
