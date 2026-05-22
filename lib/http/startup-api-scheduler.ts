"use client";

/**
 * 첫 페인트 이후 deferred API — profile blocking 외 hub-badge·notification 등 지연.
 */

export type StartupApiDeferredTask = {
  id: string;
  delayMs: number;
  run: () => void;
};

let planLogged = false;

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

function scheduleWithDelay(delayMs: number, run: () => void): () => void {
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
  opts?: { delayMs?: number }
): () => void {
  const delayMs = opts?.delayMs ?? 0;
  // eslint-disable-next-line no-console -- observability contract
  console.log("[startup-api-deferred]", { id, delay_ms: delayMs });
  return scheduleWithDelay(delayMs, run);
}

export function resetStartupApiPlanLogForTests(): void {
  planLogged = false;
}
