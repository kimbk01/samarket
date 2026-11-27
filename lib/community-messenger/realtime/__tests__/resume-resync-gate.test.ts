/**
 * R5 다시 열기 조회 판정 — 설계 resume-fixed-cost-design-2026-11-27 §4 (Owner 「결함 3 설계대로 구현」 2026-11-27)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  RESUME_REFETCH_WAIT_FOR_RESYNC_MS,
  RESUME_RESYNC_SKIP_MAX_HIDDEN_MS,
  createResumeRefetchScheduler,
  resumeRefetchPlan,
  type ResumeRefetchPlan,
  RESUME_SIGNAL_WINDOW_MS,
  hiddenSpanFrom,
  lastHiddenSpanMs,
  resumeRefetchNeeded,
} from "@/lib/community-messenger/realtime/resume-resync-gate";
import {
  createMessengerRealtimeSupervisor,
  type RtSupervisorDeps,
} from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import type { SubscribeWithRetryArgs } from "@/lib/community-messenger/realtime/cm-rt-channel-registry";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("resumeRefetchNeeded — 모두 참일 때만 조회 생략", () => {
  const ok = { allChannelsLive: true, socketConnected: true, hiddenSpanMs: 1_000 };

  it("모든 채널 연결 · 소켓 열림 · 짧게 숨김 → 조회 안 함", () => {
    expect(resumeRefetchNeeded(ok)).toBe(false);
  });
  it("채널 하나라도 연결 아님 → 조회", () => {
    expect(resumeRefetchNeeded({ ...ok, allChannelsLive: false })).toBe(true);
  });
  it("소켓 닫힘 → 조회", () => {
    expect(resumeRefetchNeeded({ ...ok, socketConnected: false })).toBe(true);
  });
  it("숨김 시각 기록을 달지 못했으면 모름(무한) → 조회", () => {
    expect(lastHiddenSpanMs()).toBe(Number.POSITIVE_INFINITY);
    expect(resumeRefetchNeeded({ ...ok, hiddenSpanMs: lastHiddenSpanMs() })).toBe(true);
  });
  it("연결 확인 간격(25초) 이상 숨김 → 조회 (서버가 이미 끊었을 수 있음)", () => {
    expect(RESUME_RESYNC_SKIP_MAX_HIDDEN_MS).toBe(25_000);
    expect(resumeRefetchNeeded({ ...ok, hiddenSpanMs: 25_000 })).toBe(true);
    expect(resumeRefetchNeeded({ ...ok, hiddenSpanMs: 24_999 })).toBe(false);
  });
});

describe("hiddenSpanFrom — 숨김 시간", () => {
  const base = { installed: true, hiddenAt: 1_000, visibleAt: 31_000 };
  it("방금 보임으로 바뀜 → 그 숨김 시간", () => {
    expect(hiddenSpanFrom({ ...base, now: 31_500 })).toBe(30_000);
  });
  it("보임이 된 지 오래(창 포커스 등) → 0 (옛 숨김으로 매번 조회하지 않음)", () => {
    expect(hiddenSpanFrom({ ...base, now: 31_000 + RESUME_SIGNAL_WINDOW_MS + 1 })).toBe(0);
  });
  it("보임 시각 전(네이티브 appStateChange 먼저) → 숨김 시작부터 지금까지", () => {
    expect(hiddenSpanFrom({ installed: true, hiddenAt: 1_000, visibleAt: 500, now: 41_000 })).toBe(40_000);
    expect(hiddenSpanFrom({ installed: true, hiddenAt: 1_000, visibleAt: null, now: 41_000 })).toBe(40_000);
  });
  it("숨긴 적 없음 → 0, 기록 없음 → 무한", () => {
    expect(hiddenSpanFrom({ installed: true, hiddenAt: null, visibleAt: null, now: 5 })).toBe(0);
    expect(hiddenSpanFrom({ installed: false, hiddenAt: null, visibleAt: null, now: 5 })).toBe(Number.POSITIVE_INFINITY);
  });
});

function supervisorHarness() {
  const subs: { onStatus?: (s: string) => void; stopped: boolean }[] = [];
  const deps: RtSupervisorDeps = {
    subscribe: (args) => {
      const s = { onStatus: args.onStatus, stopped: false };
      subs.push(s);
      return { channel: {} as never, stop: () => void (s.stopped = true), markSignal: () => undefined };
    },
    now: () => 0,
    setTimer: () => 1,
    clearTimer: () => undefined,
    canProbe: () => true,
    record: () => undefined,
  };
  const sup = createMessengerRealtimeSupervisor(deps);
  const args = (name: string): SubscribeWithRetryArgs =>
    ({ sb: {} as never, name, scope: name, build: (c) => c, isCancelled: () => false }) as SubscribeWithRetryArgs;
  return { sup, subs, args };
}

describe("감독 allChannelsLive", () => {
  it("채널이 없으면 false (모름)", () => {
    expect(supervisorHarness().sup.allChannelsLive()).toBe(false);
  });

  it("모든 채널이 SUBSCRIBED 여야 true — 하나라도 가입 중·실패면 false", () => {
    const { sup, subs, args } = supervisorHarness();
    sup.supervise(args("a"));
    sup.supervise(args("b"));
    expect(sup.allChannelsLive()).toBe(false);
    subs[0].onStatus?.("SUBSCRIBED");
    expect(sup.allChannelsLive()).toBe(false);
    subs[1].onStatus?.("SUBSCRIBED");
    expect(sup.allChannelsLive()).toBe(true);
    subs[1].onStatus?.("CHANNEL_ERROR");
    expect(sup.allChannelsLive()).toBe(false);
    subs[1].onStatus?.("SUBSCRIBED");
    expect(sup.allChannelsLive()).toBe(true);
    subs[0].onStatus?.("CLOSED");
    expect(sup.allChannelsLive()).toBe(false);
  });

  it("호출부가 멈춘 채널은 세지 않는다", () => {
    const { sup, subs, args } = supervisorHarness();
    const a = sup.supervise(args("a"));
    sup.supervise(args("b"));
    subs[1].onStatus?.("SUBSCRIBED");
    a.stop();
    expect(sup.allChannelsLive()).toBe(true);
  });
  it("onAllChannelsLive — 마지막 채널이 붙는 순간·남은 채널만 남기고 멈출 때 알림, 해제 뒤 안 옴", () => {
    const { sup, subs, args } = supervisorHarness();
    const cb = vi.fn();
    const off = sup.onAllChannelsLive(cb);
    const a = sup.supervise(args("a"));
    sup.supervise(args("b"));
    subs[0].onStatus?.("SUBSCRIBED");
    expect(cb).toHaveBeenCalledTimes(0);
    subs[1].onStatus?.("SUBSCRIBED");
    expect(cb).toHaveBeenCalledTimes(1);
    subs[0].onStatus?.("CHANNEL_ERROR");
    a.stop(); // 붙지 않은 채널을 멈추면 남은 채널이 모두 연결
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    subs[1].onStatus?.("CLOSED");
    subs[1].onStatus?.("SUBSCRIBED");
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe("호출부 연결 (소스)", () => {
  it("친구요청·알림 배지 다시 열기 조회가 판정을 거친다", () => {
    expect(read("lib/community-messenger/realtime/use-global-friend-request-feed.ts")).toMatch(
      /if \(!shouldRefetchOnAppResume\(\)\) return;\s*if \(!resumeSignals\.accept/
    );
    expect(read("components/notifications/NotificationsBadgeRealtimeBridge.tsx")).toMatch(
      /if \(!shouldRefetchOnAppResume\(\)\) return;\s*if \(!resumeSignals\.accept/
    );
    /**
     * 사장님 배지는 판정에 넣지 않는다 — 거래 채팅·매장 주문처럼 감독 밖 데이터가 섞여 「실시간 연결」만으로 놓친 것이 없다고 할 수 없다
     * (병합 전 재감사 2026-11-27).
     */
    expect(read("lib/chats/owner-hub-badge-store.ts")).not.toContain("shouldRefetchOnAppResume");
  });

  it("알림 채널은 같은 계정의 SIGNED_IN 에 다시 만들지 않는다", () => {
    expect(read("hooks/useSupabaseNotificationsRealtime.ts")).toContain(
      "if (currentSub && uid === subscribedUid) return;"
    );
  });

  it("주소 확인은 정상 통과면 복귀 때 다시 묻지 않는다", () => {
    const gate = read("components/addresses/MandatoryAddressGate.tsx");
    expect(gate).toMatch(/if \(document\.visibilityState !== "visible"\) return;\s*if \(lastPassedRef\.current\) return;/);
    expect(gate).toContain("lastPassedRef.current = false;");
    /** 확인 실패(네트워크 오류)면 통과 표시를 지워 다음 복귀에 다시 묻는다 */
    expect(gate).toMatch(/catch \{[\s\S]{0,120}lastPassedRef\.current = false;/);
  });
});

describe("resumeRefetchPlan — 재연결이 곧 오면 기다린다 (설계 resume-reconnect-wait-design-2026-11-27 §3-1)", () => {
  const base = { allChannelsLive: true, socketConnected: true, hiddenSpanMs: 1_000, reconnectExpected: true };
  it("① 모두 연결·소켓 열림·짧게 숨김 → skip", () => {
    expect(resumeRefetchPlan(base)).toBe("skip");
  });
  it("연결은 살아 보이나 25초 이상 숨김 → now (겉으로만 열린 소켓)", () => {
    expect(resumeRefetchPlan({ ...base, hiddenSpanMs: RESUME_RESYNC_SKIP_MAX_HIDDEN_MS })).toBe("now");
  });
  it("② 소켓 닫힘(Samsung 1006)·가입 허용 → wait_resync", () => {
    expect(resumeRefetchPlan({ ...base, socketConnected: false })).toBe("wait_resync");
    expect(resumeRefetchPlan({ ...base, allChannelsLive: false })).toBe("wait_resync");
    expect(resumeRefetchPlan({ ...base, allChannelsLive: false, hiddenSpanMs: 60_000 })).toBe("wait_resync");
  });
  it("③ 재연결을 기대할 수 없음(차단·오프라인·감독 꺼짐) → now", () => {
    expect(resumeRefetchPlan({ ...base, socketConnected: false, reconnectExpected: false })).toBe("now");
    expect(resumeRefetchPlan({ ...base, allChannelsLive: false, reconnectExpected: false })).toBe("now");
  });
  it("기다림 창 = 재동기화 상한 8초 + 1초 = 9초", () => {
    expect(RESUME_REFETCH_WAIT_FOR_RESYNC_MS).toBe(9_000);
  });
});

describe("createResumeRefetchScheduler", () => {
  function sched(plan: ResumeRefetchPlan, pending: { v: boolean } = { v: false }) {
    const resyncListeners = new Set<() => void>();
    const timers = new Map<number, { fn: () => void; ms: number }>();
    let id = 1;
    const schedule = createResumeRefetchScheduler({
      plan: () => plan,
      onResynced: (cb) => {
        resyncListeners.add(cb);
        return () => {
          resyncListeners.delete(cb);
        };
      },
      resyncPending: () => pending.v,
      setTimer: (fn, ms) => {
        timers.set(id, { fn, ms });
        return id++;
      },
      clearTimer: (t) => {
        timers.delete(t as number);
      },
    });
    const runTimers = () => {
      for (const [k, t] of [...timers]) {
        timers.delete(k);
        t.fn();
      }
    };
    const resync = () => {
      for (const cb of [...resyncListeners]) cb();
    };
    return { schedule, runTimers, resync, timers, resyncListeners };
  }

  it("skip → 조회 0, 기다림 없음", () => {
    const s = sched("skip");
    const f = vi.fn();
    s.schedule(f);
    expect(f).not.toHaveBeenCalled();
    expect(s.timers.size).toBe(0);
    expect(s.resyncListeners.size).toBe(0);
  });
  it("now → 바로 1번", () => {
    const s = sched("now");
    const f = vi.fn();
    s.schedule(f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.timers.size).toBe(0);
  });
  it("wait_resync · 창 안에 재동기화 → 조회 0, 타이머·구독 정리", () => {
    const s = sched("wait_resync");
    const f = vi.fn();
    s.schedule(f);
    expect([...s.timers.values()][0]?.ms).toBe(RESUME_REFETCH_WAIT_FOR_RESYNC_MS);
    s.resync();
    s.runTimers();
    expect(f).not.toHaveBeenCalled();
    expect(s.timers.size).toBe(0);
    expect(s.resyncListeners.size).toBe(0);
  });
  it("wait_resync · 창 끝까지 재동기화 없음 → 1번, 구독 정리", () => {
    const s = sched("wait_resync");
    const f = vi.fn();
    s.schedule(f);
    s.runTimers();
    expect(f).toHaveBeenCalledTimes(1);
    s.resync();
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.resyncListeners.size).toBe(0);
  });
  it("wait_resync · 9초 끝에 재동기화 묶음이 기다리는 중 → 조회 0, 묶음 실행으로 끝·정리", () => {
    const pending = { v: true };
    const s = sched("wait_resync", pending);
    const f = vi.fn();
    s.schedule(f);
    s.runTimers();
    expect(f).not.toHaveBeenCalled();
    expect(s.resyncListeners.size).toBe(1);
    pending.v = false;
    s.resync();
    expect(f).not.toHaveBeenCalled();
    expect(s.resyncListeners.size).toBe(0);
    expect(s.timers.size).toBe(0);
  });
  it("wait_resync · 9초 끝에 묶음 대기 중 · 그 뒤 취소 → 구독 정리", () => {
    const s = sched("wait_resync", { v: true });
    const f = vi.fn();
    const cancel = s.schedule(f);
    s.runTimers();
    cancel();
    expect(s.resyncListeners.size).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });
  it("wait_resync · 취소(화면 해제·새 다시 열기) → 조회 0, 정리", () => {
    const s = sched("wait_resync");
    const f = vi.fn();
    const cancel = s.schedule(f);
    cancel();
    s.runTimers();
    expect(f).not.toHaveBeenCalled();
    expect(s.timers.size).toBe(0);
    expect(s.resyncListeners.size).toBe(0);
  });
});

describe("호출처 — 다시 열기 조회는 scheduleResumeRefetch 로, 해제 때 취소", () => {
  for (const rel of [
    "lib/community-messenger/realtime/use-global-friend-request-feed.ts",
    "components/notifications/NotificationsBadgeRealtimeBridge.tsx",
  ]) {
    it(rel, () => {
      const src = read(rel);
      expect(src).toContain("scheduleResumeRefetch(");
      expect(src).toMatch(/cancelled = true;\s*cancelPendingResume\?\.\(\);/);
    });
  }
});
