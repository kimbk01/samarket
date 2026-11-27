/**
 * R5 다시 열기 조회 판정 — 설계 resume-fixed-cost-design-2026-11-27 §4 (Owner 「결함 3 설계대로 구현」 2026-11-27)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESUME_RESYNC_SKIP_MAX_HIDDEN_MS,
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
});

describe("호출부 연결 (소스)", () => {
  it("친구요청·알림 배지·사장님 배지 다시 열기 조회가 판정을 거친다", () => {
    expect(read("lib/community-messenger/realtime/use-global-friend-request-feed.ts")).toMatch(
      /if \(!shouldRefetchOnAppResume\(\)\) return;\s*if \(!resumeSignals\.accept/
    );
    expect(read("components/notifications/NotificationsBadgeRealtimeBridge.tsx")).toMatch(
      /if \(!shouldRefetchOnAppResume\(\)\) return;\s*if \(!resumeSignals\.accept/
    );
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    expect(hub).toContain("if (!shouldRefetchOnAppResume()) return;");
    expect(hub).toContain("onMessengerRealtimeResynced(onHubRealtimeResynced)");
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
  });
});
