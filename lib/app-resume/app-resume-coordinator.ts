/**
 * 복귀 조정자 (장시간 실행·앱 복귀 개선 2026-11-09 B · `docs/dibay-app-entry-resume-hard-lock.md` H5 방향).
 *
 * 책임: 「앱이 다시 보였다」는 신호를 한 곳에서 받아 **복귀 1회(epoch)** 로 정리하고, 등록된 작업을 실행한다.
 * - 신호: `visibilitychange` · `pageshow`(bfcache 복원) · Capacitor `appStateChange`. 같은 복귀에 여러 신호가 와도 1회.
 * - 숨김 시간(`hiddenMs`)을 잰다 — 작업마다 「이만큼 숨겨졌을 때만」 조건(`minHiddenMs`)을 둘 수 있다.
 * - 레인: `auth`(즉시 병렬) / `background`(메인 스레드 idle 뒤, 내 통화가 있으면 건너뜀).
 *
 * P0-C 인증 FAIL-CLOSED (Owner 4단계 C 2026-11-09):
 * - 세션 판정 결과 6종(fresh·refreshed·pending·invalid·guest·error)으로 작업의 `auth` 등급별 실행·보류·취소.
 *   - `required`: fresh·refreshed 만 실행 · pending·error 보류 · invalid·guest 취소.
 *   - `optional`(세션이 있으면 그 세션으로 나가는 요청 — 예: 하단 탭 RSC 프리페치): fresh·refreshed·guest 실행 ·
 *     pending·error 보류 · invalid 취소.
 *   - `none`(공개): 세션과 무관하게 실행(세션 판정도 하지 않음).
 * - 보류는 같은 epoch 의 첫 세션 이벤트(`noteSessionEvent`: 갱신·로그인)에 **1회** 다시 판정 — 실행 아니면 폐기(다음 복귀에서 다시).
 * - 같은 epoch·같은 작업 ID 는 최대 1회 실행(재시도 중복 방지).
 * - 세션 변경(로그아웃·계정 전환)·다시 숨김 → epoch abort → 보류 큐 폐기.
 * - 조정자 작업은 화면을 막지 않는다(배경) → 무한 대기 없음. 재시도는 이벤트 1회 → 무한 재시도·폭주 없음.
 *
 * 하지 않는 것: 기존 전역 복귀 리스너 이관(도메인별 승인), 통화 경로, 강제 새로고침·고정 지연·재시도 루프,
 * 3-2a fetch 관문(Amendment 7) 동작 변경.
 *
 * 이 파일은 DOM 을 직접 만지지 않는 순수 코어다. 브라우저 연결은 `app-resume-coordinator.client.ts`.
 */

export type AppResumeLane = "auth" | "background";
export type AppResumeAuthRequirement = "required" | "optional" | "none";
export type AppResumeSessionOutcome = "fresh" | "refreshed" | "pending" | "invalid" | "guest" | "error";
export type TaskDecision = "run" | "defer" | "cancel";

export type AppResumeContext = {
  /** 복귀 순번 (문서 수명 내 1부터) */
  epoch: number;
  /** 숨겨져 있던 시간. 모르면 null (예: bfcache 복원) */
  hiddenMs: number | null;
  /** 다시 숨겨지거나 로그아웃·계정 전환이면 abort */
  signal: AbortSignal;
  /** 이 복귀를 연 첫 신호 */
  source: string;
  /** 실행 시점 세션 판정 (`auth: "none"` 작업은 판정하지 않으므로 "fresh" 로 전달) */
  session: AppResumeSessionOutcome;
};

export type AppResumeTask = {
  id: string;
  lane: AppResumeLane;
  /** 인증 등급 — 등록 시 반드시 명시. */
  auth: AppResumeAuthRequirement;
  /** 이 시간 이상 숨겨졌을 때만 실행. 숨김 시간을 모르면(null) 실행(보수적 — 오래 숨겨졌을 수 있음). */
  minHiddenMs?: number;
  run: (ctx: AppResumeContext) => void | Promise<void>;
};

export type AppResumeDecisionInfo = {
  epoch: number;
  taskId: string;
  session: AppResumeSessionOutcome;
  decision: TaskDecision;
  phase: "resume" | "session_event";
};

export type AppResumeCoordinatorDeps = {
  now: () => number;
  /** 세션 판정 — 상한 있는 Promise(실패해도 resolve) */
  resolveSession: () => Promise<AppResumeSessionOutcome>;
  /** 메인 스레드 idle 대기 — 상한 있는 Promise */
  waitForIdle: (signal: AbortSignal) => Promise<void>;
  isOnline: () => boolean;
  /** 다음 `online` 까지 대기 (abort 시 resolve) */
  waitForOnline: (signal: AbortSignal) => Promise<void>;
  hasOwnLiveCall: () => boolean;
  onTaskError?: (taskId: string, error: unknown) => void;
  onDecision?: (info: AppResumeDecisionInfo) => void;
};

export type AppResumeCoordinator = {
  register: (task: AppResumeTask) => () => void;
  noteHidden: (source: string) => void;
  noteVisible: (source: string) => void;
  /** 세션 갱신·로그인 이벤트 — 현재 epoch 의 보류 작업을 1회 다시 판정 */
  noteSessionEvent: (kind: "refreshed" | "signed_in") => void;
  /** 로그아웃·계정 전환 — 진행 중 복귀 작업·보류 큐 취소 */
  abortCurrent: (reason: string) => void;
  /** 테스트·계측용 */
  getState: () => { epoch: number; hidden: boolean; running: boolean; deferred: number };
};

export function decideTask(auth: AppResumeAuthRequirement, session: AppResumeSessionOutcome): TaskDecision {
  if (auth === "none") return "run";
  if (session === "fresh" || session === "refreshed") return "run";
  if (session === "pending" || session === "error") return "defer";
  if (session === "invalid") return "cancel";
  return auth === "optional" ? "run" : "cancel"; // guest
}

function shouldRunForHidden(task: AppResumeTask, hiddenMs: number | null): boolean {
  const min = task.minHiddenMs ?? 0;
  if (min <= 0) return true;
  if (hiddenMs === null) return true;
  return hiddenMs >= min;
}

type EpochState = {
  epoch: number;
  hiddenMs: number | null;
  source: string;
  controller: AbortController;
  executed: Set<string>;
  deferred: AppResumeTask[];
  deferredConsumed: boolean;
};

export function createAppResumeCoordinator(
  deps: AppResumeCoordinatorDeps,
  initial: { visible: boolean }
): AppResumeCoordinator {
  const tasks = new Map<string, AppResumeTask>();
  let epoch = 0;
  let hidden = !initial.visible;
  let hiddenAt: number | null = hidden ? deps.now() : null;
  let current: EpochState | null = null;
  let running = false;

  const abortCurrent = () => {
    if (current) {
      if (!current.controller.signal.aborted) current.controller.abort();
      current.deferred = [];
    }
    current = null;
  };

  const runOne = async (st: EpochState, task: AppResumeTask, session: AppResumeSessionOutcome) => {
    if (st.controller.signal.aborted) return;
    if (st.executed.has(task.id)) return;
    st.executed.add(task.id);
    try {
      await task.run({ epoch: st.epoch, hiddenMs: st.hiddenMs, signal: st.controller.signal, source: st.source, session });
    } catch (error) {
      deps.onTaskError?.(task.id, error);
    }
  };

  const runLanes = async (st: EpochState, list: AppResumeTask[], session: AppResumeSessionOutcome) => {
    const authTasks = list.filter((t) => t.lane === "auth");
    const bgTasks = list.filter((t) => t.lane === "background");
    const authRun = Promise.all(authTasks.map((t) => runOne(st, t, session)));
    const bgRun = (async () => {
      if (bgTasks.length === 0) return;
      await deps.waitForIdle(st.controller.signal);
      if (st.controller.signal.aborted) return;
      if (deps.hasOwnLiveCall()) return;
      await Promise.all(bgTasks.map((t) => runOne(st, t, session)));
    })();
    await Promise.all([authRun, bgRun]);
  };

  const dispatch = async (st: EpochState) => {
    running = true;
    try {
      const all = [...tasks.values()].filter((t) => shouldRunForHidden(t, st.hiddenMs));
      if (all.length === 0) return;

      if (!deps.isOnline()) {
        await deps.waitForOnline(st.controller.signal);
        if (st.controller.signal.aborted) return;
      }

      const publicTasks = all.filter((t) => t.auth === "none");
      const sessionTasks = all.filter((t) => t.auth !== "none");
      const publicRun = runLanes(st, publicTasks, "fresh");

      let sessionRun: Promise<void> = Promise.resolve();
      if (sessionTasks.length > 0) {
        sessionRun = (async () => {
          const session = await deps.resolveSession();
          if (st.controller.signal.aborted) return;
          const toRun: AppResumeTask[] = [];
          for (const t of sessionTasks) {
            const decision = decideTask(t.auth, session);
            deps.onDecision?.({ epoch: st.epoch, taskId: t.id, session, decision, phase: "resume" });
            if (decision === "run") toRun.push(t);
            else if (decision === "defer") st.deferred.push(t);
          }
          await runLanes(st, toRun, session);
        })();
      }
      await Promise.all([publicRun, sessionRun]);
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
      const hiddenMs = hiddenAt !== null ? Math.max(0, now - hiddenAt) : null;
      hidden = false;
      hiddenAt = null;
      abortCurrent();
      epoch += 1;
      const st: EpochState = {
        epoch,
        hiddenMs,
        source,
        controller: new AbortController(),
        executed: new Set(),
        deferred: [],
        deferredConsumed: false,
      };
      current = st;
      void dispatch(st);
    },
    noteSessionEvent(_kind) {
      const st = current;
      if (!st || st.controller.signal.aborted) return;
      if (st.deferredConsumed || st.deferred.length === 0) return;
      st.deferredConsumed = true; // epoch 당 1회
      const list = st.deferred;
      st.deferred = [];
      void (async () => {
        const session = await deps.resolveSession();
        if (st.controller.signal.aborted) return;
        const toRun: AppResumeTask[] = [];
        for (const t of list) {
          const d = decideTask(t.auth, session);
          // 두 번째 판정에서도 미확정이면 폐기(cancel) — 다음 복귀에서 다시. 루프 없음.
          const decision: TaskDecision = d === "run" ? "run" : "cancel";
          deps.onDecision?.({ epoch: st.epoch, taskId: t.id, session, decision, phase: "session_event" });
          if (decision === "run") toRun.push(t);
        }
        await runLanes(st, toRun, session);
      })();
    },
    abortCurrent(_reason) {
      abortCurrent();
    },
    getState() {
      return { epoch, hidden, running, deferred: current?.deferred.length ?? 0 };
    },
  };
}
