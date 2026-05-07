"use client";

/**
 * critical-first 이후 deferred hydrate 가 한꺼번에 몰려 메인 스레드·네트워크가 경쟁하지 않도록
 * 우선순위·동시 1·dedupe·가시성·표면 활성으로 조율한다.
 *
 * unread/badge/realtime 의미는 바꾸지 않고 **실행 시점·동시성**만 제어한다.
 */

export type HydrationPriorityLevel = "high" | "medium" | "low";

const PRIORITY_RANK: Record<HydrationPriorityLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** 동시 실행 허용 수 — 네트워크 burst·setState burst 완화 */
export const MESSENGER_BACKGROUND_HYDRATION_MAX_CONCURRENT = 1;

export type MessengerHydrationTaskSpec = {
  id: string;
  /** 큐에 동일 키가 있으면 기존 항목 제거 후 교체(dedupe) */
  dedupeKey?: string;
  priority: HydrationPriorityLevel;
  run: (signal: AbortSignal) => Promise<void>;
};

type QueuedTask = MessengerHydrationTaskSpec & { enqueuedAt: number };

function logHydrationScheduler(payload: Record<string, unknown>): void {
  console.info("[cm-hydration-scheduler]", JSON.stringify(payload));
}

export class MessengerBackgroundHydrationScheduler {
  private readonly queue: QueuedTask[] = [];
  private readonly runningTasks = new Map<string, { controller: AbortController; startedAt: number }>();
  private generation = 0;
  /** `/community-messenger` 등 표면에 붙어 있을 때만 dequeue */
  private surfaceActive = true;

  constructor(private readonly label: string) {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.cancelAll("dispose");
  }

  /** 라우트 이탈·언마운트 시 호출 — 큐·실행 중 LOW/MEDIUM 백그라운드 작업 정리 */
  setSurfaceActive(active: boolean): void {
    this.surfaceActive = active;
    if (!active) {
      this.cancelAll("surface_inactive");
    } else {
      this.pump();
    }
  }

  private onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (!document.hidden) this.pump();
  };

  schedule(spec: MessengerHydrationTaskSpec): void {
    const dedupeKey = spec.dedupeKey;
    if (dedupeKey) {
      const prevLen = this.queue.length;
      const filtered = this.queue.filter((t) => t.dedupeKey !== dedupeKey);
      const dropped = prevLen - filtered.length;
      if (dropped > 0) {
        logHydrationScheduler({
          event: "dropped_duplicate",
          label: this.label,
          dedupe_key: dedupeKey,
          dropped_count: dropped,
          queue_depth: filtered.length,
          running_tasks: this.runningTasks.size,
        });
      }
      this.queue.length = 0;
      this.queue.push(...filtered);
    }

    this.queue.push({ ...spec, enqueuedAt: typeof performance !== "undefined" ? performance.now() : 0 });
    this.sortQueue();

    logHydrationScheduler({
      event: "queued_task",
      label: this.label,
      task_id: spec.id,
      priority: spec.priority,
      dedupe_key: dedupeKey ?? null,
      queue_depth: this.queue.length,
      running_tasks: this.runningTasks.size,
    });

    this.pump();
  }

  /** 세대 증가로 진행 중 작업 abort + 큐 비우기(탭 전환·방 변경 등에서 선택적 사용) */
  cancelAll(reason: string): void {
    this.generation += 1;
    const gen = this.generation;

    const runningEntries = [...this.runningTasks.entries()];
    for (const [taskId, rt] of runningEntries) {
      try {
        rt.controller.abort();
      } catch {
        /* ignore */
      }
      const dur =
        typeof performance !== "undefined" ? Math.round(performance.now() - rt.startedAt) : 0;
      this.runningTasks.delete(taskId);
      logHydrationScheduler({
        event: "canceled_task",
        label: this.label,
        task_id: taskId,
        phase: "running",
        reason,
        generation: gen,
        task_duration_ms: dur,
        queue_depth: this.queue.length,
        running_tasks: this.runningTasks.size,
      });
    }

    const queuedSnapshot = [...this.queue];
    this.queue.length = 0;
    for (const t of queuedSnapshot) {
      logHydrationScheduler({
        event: "canceled_task",
        label: this.label,
        task_id: t.id,
        phase: "queued",
        reason,
        generation: gen,
        queue_depth: this.queue.length,
        running_tasks: this.runningTasks.size,
      });
    }

    logHydrationScheduler({
      event: "queue_cleared",
      label: this.label,
      reason,
      generation: gen,
      queue_depth: 0,
      running_tasks: 0,
      canceled_queued_count: queuedSnapshot.length,
    });
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  /** hidden 이면 LOW dequeue 금지 */
  private mayStartPriority(p: HydrationPriorityLevel): boolean {
    if (typeof document !== "undefined" && document.hidden && p === "low") {
      return false;
    }
    return true;
  }

  private pump(): void {
    if (!this.surfaceActive) return;

    while (
      this.runningTasks.size < MESSENGER_BACKGROUND_HYDRATION_MAX_CONCURRENT &&
      this.queue.length > 0
    ) {
      const idx = this.queue.findIndex((t) => this.mayStartPriority(t.priority));
      if (idx < 0) break;

      const task = this.queue.splice(idx, 1)[0]!;
      const controller = new AbortController();
      const gen = this.generation;
      const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

      this.runningTasks.set(task.id, { controller, startedAt });

      logHydrationScheduler({
        event: "started_task",
        label: this.label,
        task_id: task.id,
        priority: task.priority,
        queue_depth: this.queue.length,
        running_tasks: this.runningTasks.size,
      });

      void (async () => {
        try {
          if (gen !== this.generation) return;
          await task.run(controller.signal);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            /* expected */
          }
        } finally {
          const rt = this.runningTasks.get(task.id);
          const dur =
            rt && typeof performance !== "undefined"
              ? Math.round(performance.now() - rt.startedAt)
              : 0;
          this.runningTasks.delete(task.id);

          logHydrationScheduler({
            event: "completed_task",
            label: this.label,
            task_id: task.id,
            priority: task.priority,
            aborted: controller.signal.aborted,
            task_duration_ms: dur,
            queue_depth: this.queue.length,
            running_tasks: this.runningTasks.size,
          });

          this.pump();
        }
      })();
    }
  }

  /** 디버그용 스냅샷 */
  snapshot(): { queue_depth: number; running_tasks: number; queued_ids: string[] } {
    return {
      queue_depth: this.queue.length,
      running_tasks: this.runningTasks.size,
      queued_ids: this.queue.map((t) => t.id),
    };
  }
}

let messengerSchedulerSingleton: MessengerBackgroundHydrationScheduler | null = null;
let messengerRoomEntrySchedulerSingleton: MessengerBackgroundHydrationScheduler | null = null;

export function getMessengerBackgroundHydrationScheduler(): MessengerBackgroundHydrationScheduler {
  if (!messengerSchedulerSingleton) {
    messengerSchedulerSingleton = new MessengerBackgroundHydrationScheduler("messenger_home");
  }
  return messengerSchedulerSingleton;
}

/** 방 입장 — secondary 보강·히스토리 저우선 큐(홈 큐와 분리해 동시 1·burst 완화) */
export function getMessengerRoomEntryHydrationScheduler(): MessengerBackgroundHydrationScheduler {
  if (!messengerRoomEntrySchedulerSingleton) {
    messengerRoomEntrySchedulerSingleton = new MessengerBackgroundHydrationScheduler("messenger_room_entry");
  }
  return messengerRoomEntrySchedulerSingleton;
}

export function attachMessengerHydrationSchedulerSurface(active: boolean): void {
  getMessengerBackgroundHydrationScheduler().setSurfaceActive(active);
}

export function attachMessengerRoomEntryHydrationSchedulerSurface(active: boolean): void {
  getMessengerRoomEntryHydrationScheduler().setSurfaceActive(active);
}

export function cancelMessengerBackgroundHydration(reason: string): void {
  messengerSchedulerSingleton?.cancelAll(reason);
}

export function cancelMessengerRoomEntryHydration(reason: string): void {
  messengerRoomEntrySchedulerSingleton?.cancelAll(reason);
}
