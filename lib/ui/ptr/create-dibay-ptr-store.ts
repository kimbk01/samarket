import {
  aggregateDibayPtrOutcomes,
  deriveDibayPtrPullPhase,
  DIBAY_PTR_ERROR_HOLD_MS,
  DIBAY_PTR_HANDLER_TIMEOUT_MS,
  DIBAY_PTR_MIN_SPIN_MS,
  DIBAY_PTR_SUCCESS_HOLD_MS,
  resolveDibayPtrSlotPx,
  type DibayPtrHandler,
  type DibayPtrOutcome,
  type DibayPtrPhase,
  type DibayPtrRunOutcome,
  type DibayPtrRunResult,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

export type DibayPtrSnapshot = {
  pullPx: number;
  /** = `phase === "REFRESHING"` — 기존 힌트·훅 호환 필드 */
  refreshing: boolean;
  phase: DibayPtrPhase;
  /** SUCCESS/ERROR 일 때만 값 */
  outcome: DibayPtrRunOutcome | null;
};

export const DIBAY_PTR_EMPTY_SNAPSHOT: DibayPtrSnapshot = {
  pullPx: 0,
  refreshing: false,
  phase: "IDLE",
  outcome: null,
};

export type DibayPtrStoreTimings = {
  minSpinMs: number;
  successHoldMs: number;
  errorHoldMs: number;
  handlerTimeoutMs: number;
};

const DEFAULT_TIMINGS: DibayPtrStoreTimings = {
  minSpinMs: DIBAY_PTR_MIN_SPIN_MS,
  successHoldMs: DIBAY_PTR_SUCCESS_HOLD_MS,
  errorHoldMs: DIBAY_PTR_ERROR_HOLD_MS,
  handlerTimeoutMs: DIBAY_PTR_HANDLER_TIMEOUT_MS,
};

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextTwoFrames(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function settleHandler(
  handler: DibayPtrHandler,
  timeoutMs: number
): Promise<{ status: DibayPtrOutcome; timedOut: boolean }> {
  let timer: number | null = null;
  const timeout = new Promise<{ status: DibayPtrOutcome; timedOut: boolean }>((resolve) => {
    timer = window.setTimeout(() => resolve({ status: "error", timedOut: true }), timeoutMs);
  });
  const work = (async () => {
    try {
      const r = await handler();
      return { status: r ?? "success", timedOut: false } as const;
    } catch {
      return { status: "error", timedOut: false } as const;
    }
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer != null) window.clearTimeout(timer);
  }
}

function createCore(preflight: () => void, timings?: Partial<DibayPtrStoreTimings>) {
  const t: DibayPtrStoreTimings = { ...DEFAULT_TIMINGS, ...timings };
  let snapshot: DibayPtrSnapshot = DIBAY_PTR_EMPTY_SNAPSHOT;
  /** 외부 리셋·새 당김이 진행 중 run 의 늦은 쓰기를 무효화 */
  let generation = 0;
  const listeners = new Set<() => void>();

  const write = (next: DibayPtrSnapshot) => {
    if (
      next.pullPx === snapshot.pullPx &&
      next.refreshing === snapshot.refreshing &&
      next.phase === snapshot.phase &&
      next.outcome === snapshot.outcome
    ) {
      return;
    }
    snapshot = next;
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => snapshot;
  const getServerSnapshot = () => DIBAY_PTR_EMPTY_SNAPSHOT;

  /**
   * 레거시 patch 계약 — 제스처 훅의 `{pullPx}` 갱신, cleanup 의 `{refreshing:false, pullPx:0}` 강제 리셋.
   * REFRESHING·결과 표시 중 외부 patch 는 진행 중 run 의 후속 쓰기를 무효화한다.
   */
  const patch = (p: { pullPx?: number; refreshing?: boolean }) => {
    const pullPx = p.pullPx ?? snapshot.pullPx;
    const refreshing = p.refreshing ?? snapshot.refreshing;
    if (refreshing) {
      write({ pullPx, refreshing: true, phase: "REFRESHING", outcome: null });
      return;
    }
    const interruptsRun =
      snapshot.phase === "REFRESHING" ||
      snapshot.phase === "SUCCESS" ||
      snapshot.phase === "ERROR" ||
      snapshot.phase === "CANCELLED";
    if (interruptsRun) {
      if (p.pullPx === undefined && p.refreshing === undefined) return;
      generation += 1;
    }
    write({ pullPx, refreshing: false, phase: deriveDibayPtrPullPhase(pullPx), outcome: null });
  };

  const run = async (handlers: DibayPtrHandler[], releasePullPx: number): Promise<DibayPtrRunResult> => {
    if (snapshot.phase === "REFRESHING") return "busy";
    if (handlers.length === 0) {
      // 핸들러 없음 — 힌트가 열린 채 남지 않도록 즉시 접는다
      generation += 1;
      write(DIBAY_PTR_EMPTY_SNAPSHOT);
      return "no_handler";
    }
    preflight();
    const gen = ++generation;
    const slotPx = resolveDibayPtrSlotPx(releasePullPx);
    write({ pullPx: slotPx, refreshing: true, phase: "REFRESHING", outcome: null });
    const startedAt = performance.now();

    const settled = await Promise.all(handlers.map((h) => settleHandler(h, t.handlerTimeoutMs)));
    const outcome = aggregateDibayPtrOutcomes(settled);

    await wait(t.minSpinMs - (performance.now() - startedAt));
    if (gen !== generation) return outcome;

    if (outcome.status === "cancelled") {
      write({ pullPx: slotPx, refreshing: false, phase: "CANCELLED", outcome: null });
      await nextTwoFrames();
      if (gen !== generation) return outcome;
      write(DIBAY_PTR_EMPTY_SNAPSHOT);
      return outcome;
    }

    write({
      pullPx: slotPx,
      refreshing: false,
      phase: outcome.status === "success" ? "SUCCESS" : "ERROR",
      outcome,
    });
    await wait(outcome.status === "success" ? t.successHoldMs : t.errorHoldMs);
    if (gen !== generation) return outcome;
    write(DIBAY_PTR_EMPTY_SNAPSHOT);
    return outcome;
  };

  return { subscribe, getSnapshot, getServerSnapshot, patch, run };
}

/** 다중 핸들러(`Promise.all`) — 커뮤니티·메신저·배달 홈·browse */
export function createDibayPtrStore(options: {
  preflight: () => void;
  timings?: Partial<DibayPtrStoreTimings>;
}) {
  const handlers = new Set<DibayPtrHandler>();
  const core = createCore(options.preflight, options.timings);
  return {
    subscribe: core.subscribe,
    getSnapshot: core.getSnapshot,
    getServerSnapshot: core.getServerSnapshot,
    patch: core.patch,
    addHandler(fn: DibayPtrHandler): () => void {
      handlers.add(fn);
      return () => {
        handlers.delete(fn);
      };
    },
    /** @deprecated 단일 슬롯 호환 */
    replaceHandlers(fn: DibayPtrHandler | null): void {
      handlers.clear();
      if (fn) handlers.add(fn);
    },
    run(releasePullPx = 0): Promise<DibayPtrRunResult> {
      return core.run([...handlers], releasePullPx);
    },
  };
}

/** 라우트 키별 단일 핸들러 — 거래(경로+committed query) */
export function createDibayKeyedPtrStore(options: {
  preflight: () => void;
  timings?: Partial<DibayPtrStoreTimings>;
}) {
  const handlers = new Map<string, DibayPtrHandler>();
  const core = createCore(options.preflight, options.timings);
  return {
    subscribe: core.subscribe,
    getSnapshot: core.getSnapshot,
    getServerSnapshot: core.getServerSnapshot,
    patch: core.patch,
    addHandler(key: string, fn: DibayPtrHandler): () => void {
      handlers.set(key, fn);
      return () => {
        if (handlers.get(key) === fn) handlers.delete(key);
      };
    },
    run(releasePullPx: number, key: string | null): Promise<DibayPtrRunResult> {
      const h = key ? handlers.get(key) : undefined;
      return core.run(h ? [h] : [], releasePullPx);
    },
  };
}

export type DibayPtrStore = ReturnType<typeof createDibayPtrStore>;
export type DibayKeyedPtrStore = ReturnType<typeof createDibayKeyedPtrStore>;
