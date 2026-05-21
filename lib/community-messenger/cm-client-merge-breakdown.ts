"use client";

import { cmClientFirstPaintLoggingEnabled } from "@/lib/community-messenger/cm-client-first-paint-perf";
import type { HomeListPatchStats } from "@/lib/community-messenger/home-list-patch";
import { wasHydrationOverlapDuringLiteMerge } from "@/lib/community-messenger/home/lite-merge-gate";

export type CmClientMergeBreakdownPayload = {
  response_to_merge_start_ms: number;
  patch_build_ms: number;
  patch_apply_ms: number;
  store_emit_ms: number;
  list_render_ms: number;
  row_render_count: number;
  changed_room_count: number;
  unchanged_room_count: number;
  skeleton_remove_ms: number;
  interactive_ms: number;
  rerender_count: number;
  hydration_overlap: boolean;
  response_to_first_row_ms: number;
  response_to_skeleton_ms: number;
  response_to_interactive_ms: number;
  patch_kind: string;
  list_reference_stable: boolean;
  bootstrap_reference_stable: boolean;
};

let responseAtMs = 0;
let mergeStartAtMs = 0;
let patchBuildMs = 0;
let patchApplyMs = 0;
let storeEmitMs = 0;
let listRenderMs = 0;
let patchStats: Partial<HomeListPatchStats> | null = null;
let listReferenceStable = false;
let bootstrapReferenceStable = false;
let patchKind = "";
let rerenderCount = 0;
let rowRenderCount = 0;
let skeletonRemoveMs = -1;
let interactiveMs = -1;
let firstRowMs = -1;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function deltaFromResponse(at: number): number {
  if (!responseAtMs || at <= 0) return -1;
  return Math.max(0, Math.round(at - responseAtMs));
}

function loggingEnabled(): boolean {
  return cmClientFirstPaintLoggingEnabled();
}

/** @param keepResponseAnchor lite fetch 직후 hook 재진입 시 breakdown 앵커 유지 */
export function resetCmClientMergeBreakdown(keepResponseAnchor = false): void {
  const keptResponse = keepResponseAnchor ? responseAtMs : 0;
  responseAtMs = keptResponse;
  breakdownLogged = false;
  mergeStartAtMs = 0;
  patchBuildMs = 0;
  patchApplyMs = 0;
  storeEmitMs = 0;
  listRenderMs = 0;
  patchStats = null;
  listReferenceStable = false;
  bootstrapReferenceStable = false;
  patchKind = "";
  rerenderCount = 0;
  rowRenderCount = 0;
  skeletonRemoveMs = -1;
  interactiveMs = -1;
  firstRowMs = -1;
}

/** lite HTTP `bootstrap_response_received` 직후 */
export function anchorCmClientMergeBreakdownFromResponse(at?: number): void {
  if (!loggingEnabled()) return;
  responseAtMs = at ?? nowMs();
  mergeStartAtMs = 0;
}

export function markCmClientMergeStart(): void {
  if (!loggingEnabled() || !responseAtMs) return;
  mergeStartAtMs = nowMs();
}

export function recordCmClientMergePatchStats(stats: HomeListPatchStats & {
  changedRoomCount?: number;
  unchangedRoomCount?: number;
  listReferenceStable?: boolean;
  bootstrapReferenceStable?: boolean;
}): void {
  if (!loggingEnabled()) return;
  patchStats = stats;
  patchBuildMs = stats.patchBuildMs ?? 0;
  patchApplyMs = stats.durationMs ?? 0;
  patchKind = stats.kind;
  listReferenceStable = stats.listReferenceStable === true;
  bootstrapReferenceStable = stats.bootstrapReferenceStable === true;
  rowRenderCount = stats.changedRoomCount ?? stats.appliedRooms ?? 0;
  publishCmClientMergeBreakdownSnapshot();
}

export function recordCmClientMergeStoreEmitMs(ms: number): void {
  if (!loggingEnabled()) return;
  storeEmitMs = ms;
}

export function recordCmClientMergeListRenderMs(ms: number): void {
  if (!loggingEnabled()) return;
  listRenderMs = ms;
}

export function recordCmClientMergePaneRender(): void {
  if (!loggingEnabled() || !responseAtMs) return;
  rerenderCount += 1;
}

export function markCmClientMergeFirstRowRendered(): void {
  if (!loggingEnabled() || firstRowMs >= 0) return;
  firstRowMs = deltaFromResponse(nowMs());
  publishCmClientMergeBreakdownSnapshot();
}

export function markCmClientMergeSkeletonRemoved(): void {
  if (!loggingEnabled() || skeletonRemoveMs >= 0) return;
  skeletonRemoveMs = deltaFromResponse(nowMs());
}

export function markCmClientMergeInteractive(): void {
  if (!loggingEnabled() || interactiveMs >= 0) return;
  interactiveMs = deltaFromResponse(nowMs());
}

/** React commit·layout·first row mark 이후 breakdown 로그 (home-sync flush 도 paint 뒤로 미룸) */
export function scheduleCmClientMergeBreakdownFinalize(): void {
  if (!loggingEnabled() || !responseAtMs) return;
  const run = () => finalizeCmClientMergeBreakdown();
  if (typeof requestAnimationFrame !== "function") {
    queueMicrotask(run);
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

function buildCmClientMergeBreakdownPayload(): CmClientMergeBreakdownPayload | null {
  if (!responseAtMs) return null;
  const response_to_merge_start_ms =
    mergeStartAtMs > 0 ? Math.max(0, Math.round(mergeStartAtMs - responseAtMs)) : 0;
  return {
    response_to_merge_start_ms,
    patch_build_ms: patchBuildMs,
    patch_apply_ms: patchApplyMs,
    store_emit_ms: storeEmitMs,
    list_render_ms: listRenderMs,
    row_render_count: rowRenderCount,
    changed_room_count: patchStats?.changedRoomCount ?? 0,
    unchanged_room_count: patchStats?.unchangedRoomCount ?? 0,
    skeleton_remove_ms: skeletonRemoveMs,
    interactive_ms: interactiveMs,
    rerender_count: rerenderCount,
    hydration_overlap: wasHydrationOverlapDuringLiteMerge(),
    response_to_first_row_ms: firstRowMs,
    response_to_skeleton_ms: skeletonRemoveMs,
    response_to_interactive_ms: interactiveMs,
    patch_kind: patchKind,
    list_reference_stable: listReferenceStable,
    bootstrap_reference_stable: bootstrapReferenceStable,
  };
}

let breakdownLogged = false;

/** Playwright·`__cmClientMergeBreakdownLastPayload` — logging 여부와 무관 */
export function publishCmClientMergeBreakdownSnapshot(): void {
  const payload = buildCmClientMergeBreakdownPayload();
  if (!payload || typeof window === "undefined") return;
  window.__cmClientMergeBreakdownLastPayload = payload;
}

export function finalizeCmClientMergeBreakdown(): void {
  publishCmClientMergeBreakdownSnapshot();
  if (!loggingEnabled() || !responseAtMs || breakdownLogged) return;
  const payload = buildCmClientMergeBreakdownPayload();
  if (!payload) return;
  breakdownLogged = true;
  // eslint-disable-next-line no-console -- client merge measurement (Playwright capture)
  console.log("[cm-client-merge-breakdown]", JSON.stringify(payload));
}

declare global {
  interface Window {
    __cmClientMergeBreakdownLast?: () => CmClientMergeBreakdownPayload | null;
    /** finalize 시점 스냅샷 — Playwright·HMR 이후에도 읽기 */
    __cmClientMergeBreakdownLastPayload?: CmClientMergeBreakdownPayload | null;
  }
}

if (typeof window !== "undefined") {
  window.__cmClientMergeBreakdownLast = () =>
    window.__cmClientMergeBreakdownLastPayload ?? buildCmClientMergeBreakdownPayload();
}
