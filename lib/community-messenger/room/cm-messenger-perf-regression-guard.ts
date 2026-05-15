"use client";

import { CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS } from "@/lib/community-messenger/room/cm-bootstrap-constants";

/**
 * 회귀 경고 전용 leaf 모듈 — `cm-bootstrap-scheduling`·`cm-room-bootstrap-lock`·
 * `cm-room-entry-timing`·`cm-event-loop-dev` import 금지 (prefetch TDZ 방지).
 */
export const CM_PERF_REGRESSION_REENTRY_REUSE_MS = CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS;

/** 회귀 경고 — shell-first·PASS 구조 lock (docs/messenger-performance-baseline.md) */
export const CM_PERF_REGRESSION_SHELL_VISIBLE_MS = 200;
export const CM_PERF_REGRESSION_COMPOSER_VISIBLE_MS = 300;

const WARN_DEDUPE_MS = 60_000;
const warnedAtByKey = new Map<string, number>();

function roomIdSuffix(roomId: string): string {
  const id = String(roomId ?? "").trim();
  return id.length <= 8 ? id : id.slice(-8);
}

function warnCmPerfRegressionOnce(
  dedupeKey: string,
  body: Record<string, unknown>
): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const now = Date.now();
  const last = warnedAtByKey.get(dedupeKey) ?? 0;
  if (now - last < WARN_DEDUPE_MS) return;
  warnedAtByKey.set(dedupeKey, now);
  // eslint-disable-next-line no-console -- production perf regression lock
  console.warn("[cm-perf-regression]", body);
}

/** A — room_client_legacy 네트워크/결정 발생 */
export function warnCmPerfRegressionRoomClientLegacy(
  roomId: string,
  detail: Record<string, unknown>
): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  warnCmPerfRegressionOnce(`legacy:${id}`, {
    kind: "room_client_legacy",
    room_id_suffix: roomIdSuffix(id),
    ...detail,
  });
}

/** B — shell_visible_ms > 200 */
export function warnCmPerfRegressionShellVisibleMs(roomId: string, shellVisibleMs: number): void {
  const id = String(roomId ?? "").trim();
  if (!id || !Number.isFinite(shellVisibleMs)) return;
  if (shellVisibleMs <= CM_PERF_REGRESSION_SHELL_VISIBLE_MS) return;
  warnCmPerfRegressionOnce(`shell:${id}`, {
    kind: "shell_visible_slow",
    room_id_suffix: roomIdSuffix(id),
    room_shell_visible_ms: Math.round(shellVisibleMs),
    threshold_ms: CM_PERF_REGRESSION_SHELL_VISIBLE_MS,
  });
}

/** C — composer_visible_ms > 300 */
export function warnCmPerfRegressionComposerVisibleMs(roomId: string, composerVisibleMs: number): void {
  const id = String(roomId ?? "").trim();
  if (!id || !Number.isFinite(composerVisibleMs)) return;
  if (composerVisibleMs <= CM_PERF_REGRESSION_COMPOSER_VISIBLE_MS) return;
  warnCmPerfRegressionOnce(`composer:${id}`, {
    kind: "composer_visible_slow",
    room_id_suffix: roomIdSuffix(id),
    composer_visible_ms: Math.round(composerVisibleMs),
    threshold_ms: CM_PERF_REGRESSION_COMPOSER_VISIBLE_MS,
  });
}

/** D — same-room subtree surface remount (Strict Mode 제외) */
export function warnCmPerfRegressionSubtreeRemounted(
  roomId: string,
  detail: {
    surface: "shell" | "viewport" | "composer";
    subtreeRemounted: boolean;
    strictDoubleInvokeBlocked?: boolean;
  }
): void {
  const id = String(roomId ?? "").trim();
  if (!id || !detail.subtreeRemounted) return;
  if (detail.strictDoubleInvokeBlocked) return;
  warnCmPerfRegressionOnce(`subtree:${id}:${detail.surface}`, {
    kind: "subtree_remounted",
    room_id_suffix: roomIdSuffix(id),
    ...detail,
  });
}

/** E — 5s 이내 warm 재진입인데 foreground fetch 가 스킵되지 않음 */
export function warnCmPerfRegressionReentryForegroundFetch(
  roomId: string,
  detail: {
    foreground_fetch_skipped: boolean;
    used_cached_snapshot: boolean;
    snapshot_age_ms: number | null;
  }
): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  if (detail.foreground_fetch_skipped) return;
  if (!detail.used_cached_snapshot) return;
  const age = detail.snapshot_age_ms;
  if (age == null || age > CM_PERF_REGRESSION_REENTRY_REUSE_MS) return;
  warnCmPerfRegressionOnce(`reentry_fetch:${id}`, {
    kind: "reentry_foreground_fetch_not_skipped",
    room_id_suffix: roomIdSuffix(id),
    foreground_fetch_skipped: false,
    snapshot_age_ms: age,
    reuse_window_ms: CM_PERF_REGRESSION_REENTRY_REUSE_MS,
  });
}

export function resetCmMessengerPerfRegressionGuardForTests(): void {
  warnedAtByKey.clear();
}
