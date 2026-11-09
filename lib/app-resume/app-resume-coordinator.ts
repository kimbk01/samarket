/**
 * 복귀 조정자 (장시간 실행·앱 복귀 개선 2026-11-09 B · `docs/dibay-app-entry-resume-hard-lock.md` H5 방향).
 *
 * 책임: 「앱이 다시 보였다」는 신호를 한 곳에서 받아 **복귀 1회(epoch)** 로 정리하고, 등록된 작업을 레인별로 실행한다.
 * - 신호: `visibilitychange` · `pageshow`(bfcache 복원) · Capacitor `appStateChange`. 같은 복귀에 여러 신호가 와도 1회.
 * - 숨김 시간(`hiddenMs`)을 잰다 — 작업마다 「이만큼 숨겨졌을 때만」 조건(`minHiddenMs`)을 둘 수 있다.
 * - 레인
 *   - `auth`: 인증이 필요한 요청. 세션 신선도 대기(기존 3-2a 관문과 같은 단일 비행)가 끝난 뒤 **병렬** 실행.
 *   - `background`: 화면 준비·사용자 조작이 먼저. `auth` 준비 + 메인 스레드 idle 뒤 실행. 내 통화가 있으면 건너뛴다.
 * - 취소: 복귀 도중 다시 숨겨지거나, 로그아웃·계정 전환이면 진행 중 epoch 의 `signal` 이 abort 된다.
 * - 오프라인이면 `online` 이 올 때까지 미룬다(그 사이 숨겨지면 취소).
 *
 * 하지 않는 것:
 * - 기존 전역 복귀 리스너(배지·친구요청·가입상태·주소·푸시·통화 등)를 옮기지 않는다 — 도메인별 하드락 승인 후 하나씩
 *   (`docs/audit/phase3-auth-request-structure-design-2026-11-08.md` §7 3-2b).
 * - 통화 경로는 등록 대상이 아니다(통화 규정). 통화 중에는 background 레인을 실행하지 않는다.
 * - 강제 새로고침·재시도 루프·고정 지연 추가 없음.
 *
 * 이 파일은 DOM 을 직접 만지지 않는 순수 코어다. 브라우저 연결은 `app-resume-coordinator.client.ts`.
 */

export type AppResumeLane = "auth" | "background";

export type AppResumeContext = {
  /** 복귀 순번 (문서 수명 내 1부터) */
  epoch: number;
  /** 숨겨져 있던 시간. 모르면 null (예: bfcache 복원) */
  hiddenMs: number | null;
  /** 다시 숨겨지거나 로그아웃·계정 전환이면 abort */
  signal: AbortSignal;
  /** 이 복귀를 연 첫 신호 */
  source: string;
};

export type AppResumeTask = {
  id: string;
  lane: AppResumeLane;
  /** 이 시간 이상 숨겨졌을 때만 실행. 숨김 시간을 모르면(null) 실행한다(보수적 — 오래 숨겨졌을 수 있음). */
  minHiddenMs?: number;
  run: (ctx: AppResumeContext) => void | Promise<void>;
};

export type AppResumeCoordinatorDeps = {
  now: () => number;
  /** 세션 신선도 대기 — 상한 있는 Promise (실패해도 resolve) */
  waitForSessionFreshness: () => Promise<void>;
  /** 메인 스레드 idle 대기 — 상한 있는 Promise */
  waitForIdle: (signal: AbortSignal) => Promise<void>;
  isOnline: () => boolean;
  /** 다음 `online` 까지 대기 (abort 시 resolve) */
  waitForOnline: (signal: AbortSignal) => Promise<void>;
  hasOwnLiveCall: () => boolean;
  onTaskError?: (taskId: string, error: unknown) => void;
};

export type AppResumeCoordinator = {
  register: (task: AppResumeTask) => () => void;
  noteHidden: (source: string) => void;
  noteVisible: (source: string) => void;
  /** 로그아웃·계정 전환 — 진행 중 복귀 작업 취소 */
  abortCurrent: (reason: string) => void;
  /** 테스트·계측용 */
  getState: () => { epoch: number; hidden: boolean; running: boolean };
};

function shouldRun(task: AppResumeTask, hiddenMs: number | null): boolean {
  const min = task.minHiddenMs ?? 0;
  if (min <= 0) return true;
  if (hiddenMs === null) return true;
  return hiddenMs >= min;
}

async function runTasks(tasks: AppResumeTask[], ctx: AppResumeContext, deps: AppResumeCoordinatorDeps): Promise<void> {
  await Promise.all(
    tasks.map(async (task) => {
      if (ctx.signal.aborted) return;
      try {
        await task.run(ctx);
      } catch (error) {
        deps.onTaskError?.(task.id, error);
      }
    })
  );
}

export function createAppResumeCoordinator(
  deps: AppResumeCoordinatorDeps,
  initial: { visible: boolean }
): AppResumeCoordinator {
  const tasks = new Map<string, AppResumeTask>();
  let epoch = 0;
  let hidden = !initial.visible;
  let hiddenAt: number | null = hidden ? deps.now() : null;
  let controller: AbortController | null = null;
  let running = false;

  const abortCurrent = () => {
    if (controller && !controller.signal.aborted) controller.abort();
    controller = null;
  };

  const dispatch = async (ctx: AppResumeContext) => {
    running = true;
    try {
      const all = [...tasks.values()].filter((t) => shouldRun(t, ctx.hiddenMs));
      if (all.length === 0) return;

      if (!deps.isOnline()) {
        await deps.waitForOnline(ctx.signal);
        if (ctx.signal.aborted) return;
      }

      // 인증 의존 작업은 세션 신선도 확보 뒤 (단일 비행 공유 — 갱신을 새로 일으키지 않음).
      await deps.waitForSessionFreshness();
      if (ctx.signal.aborted) return;

      const authTasks = all.filter((t) => t.lane === "auth");
      const bgTasks = all.filter((t) => t.lane === "background");

      const authRun = runTasks(authTasks, ctx, deps);

      // 화면·사용자 조작 우선: background 는 idle 뒤. 통화 중이면 건너뛴다.
      const bgRun = (async () => {
        if (bgTasks.length === 0) return;
        await deps.waitForIdle(ctx.signal);
        if (ctx.signal.aborted) return;
        if (deps.hasOwnLiveCall()) return;
        await runTasks(bgTasks, ctx, deps);
      })();

      await Promise.all([authRun, bgRun]);
    } finally {
      running = false;
    }
  };

  return {
    register(task) {
      tasks.set(task.id, task);
      return () => {
        if (tasks.get(task.id) === task) tasks.delete(task.id);
      };
    },
    noteHidden(_source) {
      if (hidden) return;
      hidden = true;
      hiddenAt = deps.now();
      abortCurrent();
    },
    noteVisible(source) {
      // 같은 보이는 구간의 중복 신호(visibilitychange + appStateChange + pageshow)는 무시.
      // bfcache 복원도 그 전에 pagehide·hidden 을 거치므로 같은 규칙으로 1회만 연다.
      if (!hidden) return;
      const now = deps.now();
      const hiddenMs = hidden && hiddenAt !== null ? Math.max(0, now - hiddenAt) : null;
      hidden = false;
      hiddenAt = null;
      abortCurrent();
      epoch += 1;
      controller = new AbortController();
      void dispatch({ epoch, hiddenMs, signal: controller.signal, source });
    },
    abortCurrent(_reason) {
      abortCurrent();
    },
    getState() {
      return { epoch, hidden, running };
    },
  };
}
