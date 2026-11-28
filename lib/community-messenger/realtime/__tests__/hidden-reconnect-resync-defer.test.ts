/**
 * 2026-11-28 — 숨김 중 재연결 재동기화는 보일 때 1번 · 다시 열기 조회(R5)와 합쳐 받는 쪽마다 1번.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/hidden-reconnect-resync-design-2026-11-28.md
 * 독립 검토(첫 안 오류) 재현: 밀린 묶음 + 모든 채널 연결 + 25초 이상 숨김 → 이전 판정은 바로 조회 + 묶음 = 2번.
 */
import { describe, expect, it } from "vitest";
import {
  createMessengerResyncCoordinator,
  type MessengerResyncCoordinator,
} from "@/lib/community-messenger/realtime/messenger-realtime-resync";
import {
  createResumeRefetchScheduler,
  resumeRefetchPlan,
  RESUME_REFETCH_WAIT_FOR_RESYNC_MS,
  RESUME_RESYNC_SKIP_MAX_HIDDEN_MS,
} from "@/lib/community-messenger/realtime/resume-resync-gate";
import { isAllowedRealtimeConnectionMetric } from "@/lib/community-messenger/monitoring/realtime-connection-rollup-key";

/** 가짜 시계 — 0ms 예약은 「다음 차례」 */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (t: unknown) => {
      timers.delete(t as number);
    },
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    },
  };
}

function setup(opts: { supervisor: boolean }) {
  const clock = fakeClock();
  let hidden = false;
  const visibleCbs = new Set<() => void>();
  const allLiveCbs = new Set<() => void>();
  let allLive = true;
  const metrics: string[] = [];
  const c: MessengerResyncCoordinator = createMessengerResyncCoordinator({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    allLive: opts.supervisor
      ? {
          isAllLive: () => allLive,
          onAllLive: (cb) => {
            allLiveCbs.add(cb);
            return () => allLiveCbs.delete(cb);
          },
        }
      : null,
    visibility: {
      isHidden: () => hidden,
      onVisible: (cb) => {
        visibleCbs.add(cb);
        return () => visibleCbs.delete(cb);
      },
    },
    onDeferredHidden: () => metrics.push("deferred"),
    onFlushedVisible: () => metrics.push("flushed"),
  });
  let receiverFetches = 0;
  c.onResynced(() => {
    receiverFetches += 1;
  });
  return {
    clock,
    c,
    metrics,
    setHidden: (v: boolean) => {
      hidden = v;
    },
    setAllLive: (v: boolean) => {
      allLive = v;
    },
    emitVisible: () => {
      for (const cb of [...visibleCbs]) cb();
    },
    fetches: () => receiverFetches,
  };
}

describe("재동기화 묶음 — 숨김 중 미룸", () => {
  for (const supervisor of [true, false]) {
    const label = supervisor ? "감독 켜짐" : "감독 꺼짐(롤백 스위치)";

    it(`${label}: 숨김 중 재연결 3번 → 실행 0번, 보이면 다음 차례에 1번`, () => {
      const t = setup({ supervisor });
      t.setHidden(true);
      for (let i = 0; i < 3; i++) {
        t.c.noteResubscribed();
        t.clock.advance(10_000);
      }
      expect(t.fetches()).toBe(0);
      expect(t.c.isDeferred()).toBe(true);
      expect(t.c.isPending()).toBe(true);
      expect(t.metrics).toEqual(["deferred"]);
      t.setHidden(false);
      t.emitVisible();
      t.emitVisible();
      expect(t.fetches()).toBe(0); // 다음 차례
      t.clock.advance(0);
      expect(t.fetches()).toBe(1);
      expect(t.c.isDeferred()).toBe(false);
      expect(t.c.isPending()).toBe(false);
      expect(t.metrics).toEqual(["deferred", "flushed"]);
    });

    it(`${label}: 보이는 중 재연결은 지금처럼 바로 1번`, () => {
      const t = setup({ supervisor });
      t.c.noteResubscribed();
      t.clock.advance(10_000);
      expect(t.fetches()).toBe(1);
      expect(t.metrics).toEqual([]);
    });
  }

  it("보임 알림이 왔지만 실행 순간 아직 숨김(네이티브 활성·문서 hidden)이면 다음 보임에 1번", () => {
    const t = setup({ supervisor: true });
    t.setHidden(true);
    t.c.noteResubscribed();
    t.clock.advance(10_000);
    t.emitVisible();
    t.clock.advance(0);
    expect(t.fetches()).toBe(0);
    expect(t.c.isDeferred()).toBe(true);
    t.setHidden(false);
    t.emitVisible();
    t.clock.advance(0);
    expect(t.fetches()).toBe(1);
  });

  it("밖에서 부르는 실행(다시 열기 신호 안전망)", () => {
    const t = setup({ supervisor: true });
    t.setHidden(true);
    t.c.noteResubscribed();
    t.clock.advance(10_000);
    t.setHidden(false);
    t.c.flushDeferred();
    t.c.flushDeferred();
    t.clock.advance(0);
    expect(t.fetches()).toBe(1);
    t.c.flushDeferred();
    t.clock.advance(0);
    expect(t.fetches()).toBe(1);
  });
});

describe("다시 숨김", () => {
  it("보임 실행 예약 뒤 같은 차례에 다시 숨겨지고 재연결이 오면 예약을 거두고 다음 보임에 1번", () => {
    const t = setup({ supervisor: true });
    t.setHidden(true);
    t.c.noteResubscribed();
    t.clock.advance(10_000);
    t.setHidden(false);
    t.emitVisible(); // 다음 차례 예약
    t.setHidden(true);
    t.c.noteResubscribed(); // 감독 모두 연결 → 다음 차례 fire
    t.clock.advance(0);
    expect(t.fetches()).toBe(0);
    expect(t.c.isDeferred()).toBe(true);
    t.setHidden(false);
    t.emitVisible();
    t.clock.advance(0);
    expect(t.fetches()).toBe(1);
  });
});

describe("다시 열기 조회(R5)와 합쳐 받는 쪽마다 1번", () => {
  function scheduler(t: ReturnType<typeof setup>, hiddenSpanMs: number) {
    return createResumeRefetchScheduler({
      plan: () =>
        resumeRefetchPlan({
          allChannelsLive: true,
          socketConnected: true,
          hiddenSpanMs,
          reconnectExpected: false,
          resyncDeferred: t.c.isDeferred(),
        }),
      onResynced: t.c.onResynced,
      resyncPending: t.c.isPending,
      flushDeferred: t.c.flushDeferred,
      setTimer: t.clock.setTimer,
      clearTimer: t.clock.clearTimer,
    });
  }

  for (const order of ["다시 열기 판정 먼저", "보임 알림 먼저"] as const) {
    it(`밀린 묶음 + 모든 채널 연결 + ${RESUME_RESYNC_SKIP_MAX_HIDDEN_MS / 1000}초 이상 숨김 → 정확히 1번 (${order})`, () => {
      const t = setup({ supervisor: true });
      t.setHidden(true);
      t.c.noteResubscribed();
      t.clock.advance(10_000);
      expect(t.fetches()).toBe(0);
      t.setHidden(false);
      let r5Fetches = 0;
      const resume = () => scheduler(t, 60_000)(() => (r5Fetches += 1));
      if (order === "다시 열기 판정 먼저") {
        resume();
        t.emitVisible();
      } else {
        t.emitVisible();
        resume();
      }
      t.clock.advance(RESUME_REFETCH_WAIT_FOR_RESYNC_MS + 1_000);
      expect(t.fetches()).toBe(1);
      expect(r5Fetches).toBe(0);
    });
  }

  it("보임 알림을 놓쳐도(포커스 신호만) 다시 열기 예약이 밀린 묶음을 실행한다", () => {
    const t = setup({ supervisor: true });
    t.setHidden(true);
    t.c.noteResubscribed();
    t.clock.advance(10_000);
    t.setHidden(false);
    let r5Fetches = 0;
    scheduler(t, 0)(() => (r5Fetches += 1));
    t.clock.advance(RESUME_REFETCH_WAIT_FOR_RESYNC_MS + 1_000);
    expect(t.fetches()).toBe(1);
    expect(r5Fetches).toBe(0);
  });

  it("밀린 묶음이 없으면 판정은 예전 그대로", () => {
    expect(
      resumeRefetchPlan({ allChannelsLive: true, socketConnected: true, hiddenSpanMs: 60_000, reconnectExpected: false })
    ).toBe("now");
    expect(
      resumeRefetchPlan({ allChannelsLive: true, socketConnected: true, hiddenSpanMs: 1_000, reconnectExpected: false })
    ).toBe("skip");
    expect(
      resumeRefetchPlan({
        allChannelsLive: false,
        socketConnected: false,
        hiddenSpanMs: 1_000,
        reconnectExpected: false,
        resyncDeferred: true,
      })
    ).toBe("wait_resync");
  });
});

describe("효과 측정 기록 허용", () => {
  it("새 기록 2개만 허용", () => {
    expect(isAllowedRealtimeConnectionMetric("resync_deferred.hidden")).toBe(true);
    expect(isAllowedRealtimeConnectionMetric("resync_flushed.visible")).toBe(true);
    expect(isAllowedRealtimeConnectionMetric("resync_deferred.visible")).toBe(false);
    expect(isAllowedRealtimeConnectionMetric("resync_flushed.hidden")).toBe(false);
  });
});
