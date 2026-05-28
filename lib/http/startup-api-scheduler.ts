"use client";

/**
 * 첫 페인트 이후 deferred API — profile blocking 외 hub-badge·notification 등 지연.
 * 동일 jobId 는 pending join / TTL skip 으로 navigation·remount 중복 schedule 을 막는다.
 */

import { isSamarketStartupDeferredTraceEnabled } from "@/lib/debug/samarket-client-console-flags";

export type StartupApiDeferredTask = {
  id: string;
  delayMs: number;
  run: () => void;
};

export type StartupDeferredTraceAction =
  | "scheduled"
  | "joined"
  | "skipped_pending"
  | "skipped_ttl"
  | "executed";

export type ScheduleStartupApiDeferredOptions = {
  delayMs?: number;
  /** 계측용 호출 출처 — 미지정 시 jobId */
  source?: string;
  /** 완료 후 동일 jobId 재실행 억제(ms). 기본 20s */
  ttlMs?: number;
};

export type ScheduleNotificationSettingsSnapshotDeferredOptions = {
  delayMs?: number;
  source?: string;
  ttlMs?: number;
};

const DEFAULT_JOB_TTL_MS = 20_000;
export const NOTIFICATION_SETTINGS_APP_JOB_ID = "notification-settings-app";

let planLogged = false;

type PendingRun = {
  run: () => void;
};

type PendingJob = {
  delayMs: number;
  runs: PendingRun[];
  cancelTimer: () => void;
};

const pendingJobs = new Map<string, PendingJob>();
const completedAtByJobId = new Map<string, number>();

function readStartupDeferredTraceEnabled(): boolean {
  return isSamarketStartupDeferredTraceEnabled();
}

function readStartupDeferredLegacyLogEnabled(): boolean {
  return readStartupDeferredTraceEnabled();
}

function currentPathname(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

function logStartupDeferredTrace(args: {
  jobId: string;
  source: string;
  action: StartupDeferredTraceAction;
  delayMs: number;
  pathname: string;
}): void {
  if (!readStartupDeferredTraceEnabled()) return;
  // eslint-disable-next-line no-console -- observability contract
  console.log("[startup-deferred-trace]", args);
}

function logStartupApiDeferredLegacy(id: string, delayMs: number): void {
  if (!readStartupDeferredLegacyLogEnabled()) return;
  // eslint-disable-next-line no-console -- observability contract
  console.log("[startup-api-deferred]", { id, delay_ms: delayMs });
}

function clearPendingJob(jobId: string): void {
  pendingJobs.delete(jobId);
}

function markJobCompleted(jobId: string): void {
  completedAtByJobId.set(jobId, Date.now());
  clearPendingJob(jobId);
}

function executePendingJob(jobId: string, source: string, delayMs: number): void {
  const pending = pendingJobs.get(jobId);
  if (!pending) return;
  const runs = pending.runs.slice();
  clearPendingJob(jobId);
  if (runs.length === 0) return;
  logStartupDeferredTrace({
    jobId,
    source,
    action: "executed",
    delayMs,
    pathname: currentPathname(),
  });
  for (const item of runs) {
    try {
      item.run();
    } catch {
      /* ignore — deferred background work */
    }
  }
  markJobCompleted(jobId);
}

export function logStartupApiPlan(plan: {
  blocking: readonly string[];
  deferred: readonly string[];
}): void {
  if (planLogged) return;
  planLogged = true;
  // eslint-disable-next-line no-console -- observability contract
  console.log("[startup-api-plan]", {
    blocking: [...plan.blocking],
    deferred: [...plan.deferred],
  });
}

function scheduleWithDelay(
  delayMs: number,
  run: () => void
): () => void {
  if (typeof window === "undefined") {
    run();
    return () => {};
  }
  if (delayMs <= 0 && typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(
      () => {
        if (document.visibilityState === "hidden") return;
        run();
      },
      { timeout: 300 }
    );
    return () => {
      try {
        cancelIdleCallback(id);
      } catch {
        /* ignore */
      }
    };
  }
  const t = window.setTimeout(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    run();
  }, Math.max(0, delayMs));
  return () => clearTimeout(t);
}

/**
 * @param delayMs 0 = idle(최대 300ms), 1~300 = setTimeout
 */
export function scheduleStartupApiDeferred(
  id: string,
  run: () => void,
  opts?: ScheduleStartupApiDeferredOptions
): () => void {
  const delayMs = opts?.delayMs ?? 0;
  const source = opts?.source?.trim() || id;
  const ttlMs = Math.max(0, opts?.ttlMs ?? DEFAULT_JOB_TTL_MS);
  const pathname = currentPathname();
  const now = Date.now();

  logStartupApiDeferredLegacy(id, delayMs);

  const completedAt = completedAtByJobId.get(id);
  if (completedAt != null && now - completedAt < ttlMs) {
    logStartupDeferredTrace({
      jobId: id,
      source,
      action: "skipped_ttl",
      delayMs,
      pathname,
    });
    return () => {};
  }

  const existingPending = pendingJobs.get(id);
  if (existingPending) {
    if (existingPending.runs.some((entry) => entry.run === run)) {
      logStartupDeferredTrace({
        jobId: id,
        source,
        action: "skipped_pending",
        delayMs,
        pathname,
      });
      return () => {};
    }
    const pendingRun: PendingRun = { run };
    existingPending.runs.push(pendingRun);
    logStartupDeferredTrace({
      jobId: id,
      source,
      action: "joined",
      delayMs,
      pathname,
    });
    return () => {
      const pending = pendingJobs.get(id);
      if (!pending) return;
      const idx = pending.runs.indexOf(pendingRun);
      if (idx >= 0) pending.runs.splice(idx, 1);
    };
  }

  logStartupDeferredTrace({
    jobId: id,
    source,
    action: "scheduled",
    delayMs,
    pathname,
  });

  const pendingRun: PendingRun = { run };
  const pending: PendingJob = {
    delayMs,
    runs: [pendingRun],
    cancelTimer: () => {},
  };

  pending.cancelTimer = scheduleWithDelay(delayMs, () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      clearPendingJob(id);
      return;
    }
    executePendingJob(id, source, delayMs);
  });

  pendingJobs.set(id, pending);

  return () => {
    const live = pendingJobs.get(id);
    if (!live) return;
    const idx = live.runs.indexOf(pendingRun);
    if (idx >= 0) live.runs.splice(idx, 1);
  };
}

/**
 * notification-settings snapshot 전용 단일 스케줄러.
 * Surface/Inbox/Hub/Philife 가 같은 jobId 로 합류해 중복 예약을 줄인다.
 */
export function scheduleNotificationSettingsSnapshotDeferred(
  run: () => void,
  opts?: ScheduleNotificationSettingsSnapshotDeferredOptions
): () => void {
  return scheduleStartupApiDeferred(NOTIFICATION_SETTINGS_APP_JOB_ID, run, {
    delayMs: opts?.delayMs ?? 120,
    source: opts?.source,
    ttlMs: opts?.ttlMs,
  });
}

export function resetStartupApiPlanLogForTests(): void {
  planLogged = false;
}

export function resetStartupApiDeferredForTests(): void {
  for (const pending of pendingJobs.values()) {
    pending.cancelTimer();
  }
  pendingJobs.clear();
  completedAtByJobId.clear();
  planLogged = false;
}
