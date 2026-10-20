/**
 * 지연 커밋 큐 (최종 설계 C6 · S27 좋아요/저장 해제) — 순수 로직(브라우저 API 는 주입).
 *
 * - `schedule(job)`: 목록에서 이미 제거된 항목의 서버 해제를 `delayMs`(5초) 뒤 실행. [되돌리기] = `cancel(key)` → 서버 호출 0.
 * - 동시 대기 1건: 새 `schedule` 시 이전 대기 건은 즉시 커밋.
 * - `flush()`: 화면 이탈·`pagehide` 시 남은 대기 건 즉시 커밋.
 * - 커밋 실패 시 `job.onFail()`(항목 복귀 + 오류 토스트는 화면 몫).
 */

export const MYPAGE_DEFERRED_COMMIT_MS = 5000;

export type DeferredCommitJob = {
  key: string;
  commit: () => Promise<boolean>;
  onFail?: () => void;
};

type Timer = ReturnType<typeof setTimeout>;

export type DeferredCommitQueue = {
  schedule: (job: DeferredCommitJob) => void;
  /** 대기 중이면 취소하고 true(서버 호출 없음) */
  cancel: (key: string) => boolean;
  /** 대기 중인 건 즉시 커밋 */
  flush: () => void;
  pendingKey: () => string | null;
};

export function createDeferredCommitQueue(opts?: {
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (t: Timer) => void;
}): DeferredCommitQueue {
  const delayMs = opts?.delayMs ?? MYPAGE_DEFERRED_COMMIT_MS;
  const setTimer = opts?.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts?.clearTimer ?? ((t) => clearTimeout(t));
  let pending: { job: DeferredCommitJob; timer: Timer } | null = null;

  const run = (job: DeferredCommitJob) => {
    void job
      .commit()
      .then((ok) => {
        if (!ok) job.onFail?.();
      })
      .catch(() => job.onFail?.());
  };

  const flush = () => {
    if (!pending) return;
    const { job, timer } = pending;
    pending = null;
    clearTimer(timer);
    run(job);
  };

  return {
    schedule(job) {
      flush();
      const timer = setTimer(() => {
        if (pending?.job !== job) return;
        pending = null;
        run(job);
      }, delayMs);
      pending = { job, timer };
    },
    cancel(key) {
      if (!pending || pending.job.key !== key) return false;
      clearTimer(pending.timer);
      pending = null;
      return true;
    },
    flush,
    pendingKey: () => pending?.job.key ?? null,
  };
}

/**
 * 커뮤니티 공감/저장 해제 DELETE (A6) — 화면 이탈 중에도 끝나도록 `keepalive`(sendBeacon 은 DELETE 불가).
 */
export async function deleteCommunityPostReaction(postId: string, kind: "like" | "save"): Promise<boolean> {
  try {
    const res = await fetch(`/api/community/posts/${encodeURIComponent(postId)}/${kind}`, {
      method: "DELETE",
      credentials: "include",
      keepalive: true,
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return json.ok !== false;
  } catch {
    return false;
  }
}
