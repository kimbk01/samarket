import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAMARKET_PRESENCE_KEEPALIVE_MS,
  SAMARKET_PRESENCE_ONLINE_GRACE_MS,
  SAMARKET_PRESENCE_PING_OFFLINE_MS,
} from "@/lib/community-messenger/presence/presence-policy";
import {
  PRESENCE_HEARTBEAT_IDLE_IN_ROOM_MS,
  PRESENCE_HEARTBEAT_IDLE_OUTSIDE_ROOM_MS,
  isPresenceHeartbeatIdle,
} from "@/lib/community-messenger/realtime/presence/presence-heartbeat-idle";
import {
  communityMessengerPresenceUserChannelName,
  parseCmPresenceUserBroadcastPayload,
} from "@/lib/community-messenger/realtime/presence/cm-presence-user-channel";
import { createPresenceSnapshotPollScheduler } from "@/lib/community-messenger/realtime/presence/presence-snapshot-poll-scheduler";

/**
 * D1 2단계 (Owner 승인 2026-11-19) — 접속 상태 구조 계약.
 * 근거: docs/audit/supabase-request-surge-2026-11-18/d1-presence-push-structure-analysis-2026-11-19.md
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const RUNTIME = "lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime.ts";

describe("D1 2단계 — 판정 상수 (레거시 Telegram: 약 1분 갱신)", () => {
  it("keepalive 60s, 판정 창 = keepalive × 2.5 = 150s, 오프라인 창 ≥ 판정 창", () => {
    expect(SAMARKET_PRESENCE_KEEPALIVE_MS).toBe(60_000);
    expect(SAMARKET_PRESENCE_ONLINE_GRACE_MS).toBe(150_000);
    expect(SAMARKET_PRESENCE_PING_OFFLINE_MS).toBeGreaterThanOrEqual(SAMARKET_PRESENCE_ONLINE_GRACE_MS);
  });
});

describe("D1 2단계 — 런타임 (전역 채널 없음 · 전환 즉시 · keepalive)", () => {
  const src = read(RUNTIME);
  it("전역 presence 채널을 구독·track 하지 않는다 (접속자 N² 전파 제거)", () => {
    expect(src).not.toContain('"community-messenger:presence"');
    expect(src).not.toContain(".track(");
    expect(src).not.toContain("subscribeWithRetry");
  });
  it("12초 하트비트가 없고 60초 keepalive 상수만 쓴다", () => {
    expect(src).not.toMatch(/12_000/);
    expect(src).toContain("SAMARKET_PRESENCE_KEEPALIVE_MS");
  });
  it("전환(앞화면 진입·백그라운드·유휴 복귀·종료)은 transition:true, keepalive 는 false", () => {
    expect(src).toContain("postPresence(true)");
    expect(src).toContain("postPresence(false)");
    expect(src).toContain("sessionEnd: true, transition: true");
  });
  it("유휴면 keepalive 정지, 활동 시 간격 제한 없이 즉시 재개", () => {
    const rec = src.slice(src.indexOf("function recordActivity"), src.indexOf("function recordActivity") + 400);
    expect(rec.indexOf("if (keepaliveIdlePaused)")).toBeLessThan(rec.indexOf("ACTIVITY_THROTTLE_MS"));
    expect(rec).toContain("resumeFromIdle?.()");
    expect(src).toContain('document.addEventListener("scroll", onActivity, { capture: true, passive: true })');
  });
});

describe("D1 2단계 — 유휴 판정", () => {
  const t0 = 1_800_000_000_000;
  it("방 밖 5분 · 방 안 30분", () => {
    expect(PRESENCE_HEARTBEAT_IDLE_OUTSIDE_ROOM_MS).toBe(5 * 60_000);
    expect(PRESENCE_HEARTBEAT_IDLE_IN_ROOM_MS).toBe(30 * 60_000);
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 5 * 60_000 - 1, lastActivityMs: t0, inRoom: false })).toBe(false);
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 5 * 60_000, lastActivityMs: t0, inRoom: false })).toBe(true);
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 10 * 60_000, lastActivityMs: t0, inRoom: true })).toBe(false);
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 30 * 60_000, lastActivityMs: t0, inRoom: true })).toBe(true);
    expect(isPresenceHeartbeatIdle({ nowMs: t0, lastActivityMs: 0, inRoom: false })).toBe(false);
  });
});

describe("D1 2단계 — 사용자별 토픽", () => {
  it("토픽 이름·페이로드 검증", () => {
    expect(communityMessengerPresenceUserChannelName(" ABC ")).toBe("cm-presence-user:abc");
    expect(parseCmPresenceUserBroadcastPayload({ userId: "u", state: "online", at: "t" })).toEqual({
      v: 1,
      userId: "u",
      state: "online",
      lastSeenAt: null,
      at: "t",
    });
    expect(parseCmPresenceUserBroadcastPayload({ userId: "u", state: "away", at: "t" })).toBeNull();
    expect(parseCmPresenceUserBroadcastPayload({ state: "online", at: "t" })).toBeNull();
  });
  it("서버는 전환일 때만 발행한다 (keepalive 발행 없음)", () => {
    const route = read("app/api/community-messenger/presence/route.ts");
    expect(route).toContain("const isTransition = body?.transition === true || body?.sessionEnd === true;");
    expect(route).toContain("publishCommunityMessengerPresenceTransitionFromServer");
    expect(route).toContain("after(async () =>");
  });
  it("1:1 머리글만 live 구독, 목록 행은 구독하지 않는다", () => {
    expect(read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx")).toContain(
      "{ live: true }"
    );
    for (const p of [
      "components/community-messenger/MessengerChatListItemPresenceDot.tsx",
      "components/community-messenger/MessengerLineFriendRow.tsx",
      "components/community-messenger/friend-list/CommunityMessengerFriendPresenceLine.tsx",
      "components/community-messenger/room/phase2/GroupMemberPresenceLabel.tsx",
    ]) {
      expect(read(p)).not.toContain("live: true");
    }
  });
  it("수신 권한 마이그레이션: 본인 또는 같은 방 참가자 · 전역 채널 제거는 별도 파일", () => {
    const a = read("supabase/migrations/20271119120000_cm_presence_user_topic_read.sql");
    expect(a).toContain("when p_topic like ''cm-presence-user:%'' then");
    expect(a).toContain("me.left_at is null");
    expect(a).toContain("peer.left_at is null");
    expect(a).toContain("exactly once — stop");
    const b = read("supabase/migrations/20271119120100_cm_presence_global_topic_drop.sql");
    expect(b).toContain("community-messenger:presence");
    expect(b).toContain("배포 후");
  });
});

describe("D1 2단계 — 스냅샷 스케줄러: 첫 값 1회 + 온라인만 재확인", () => {
  function harness(onlineIds: Set<string>) {
    let now = 0;
    const timers: Array<{ at: number; fn: () => void; id: number }> = [];
    let seq = 0;
    const fetched: string[][] = [];
    const s = createPresenceSnapshotPollScheduler({
      fetchBatch: async (ids) => {
        fetched.push([...ids]);
        return new Map();
      },
      apply: () => {},
      isRealtimeHealthy: () => false,
      shouldRepoll: (id) => onlineIds.has(id),
      isDeferred: () => false,
      isDocumentVisible: () => true,
      now: () => now,
      setTimer: (fn, ms) => {
        const id = ++seq;
        timers.push({ at: now + ms, fn, id });
        return id;
      },
      clearTimer: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    const advance = async (ms: number) => {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        now = t.at;
        t.fn();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = end;
    };
    return { s, fetched, advance, timers };
  }

  it("오프라인 상대는 첫 값 뒤 다시 조회하지 않는다", async () => {
    const h = harness(new Set());
    h.s.subscribe("off");
    await h.advance(1_000);
    expect(h.fetched).toEqual([["off"]]);
    await h.advance(30 * 60_000);
    expect(h.fetched).toEqual([["off"]]);
    expect(h.s.isTimerActive()).toBe(false);
  });

  it("온라인 상대는 판정 창 만료 전(140s)에만 재확인한다", async () => {
    const h = harness(new Set(["on"]));
    h.s.subscribe("on");
    await h.advance(1_000);
    expect(h.fetched.length).toBe(1);
    await h.advance(130_000);
    expect(h.fetched.length).toBe(1);
    await h.advance(20_000);
    expect(h.fetched.length).toBe(2);
  });
});
