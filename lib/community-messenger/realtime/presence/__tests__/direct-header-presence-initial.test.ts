/**
 * 1:1 방 머리글 접속 상태 — 감사·계획 docs/audit/messenger-direct-header-presence-audit-plan-2026-11-16.md
 * F1: 처음 보는 상대는 실시간 정상이어도 1회 조회, 첫 값은 저장소에 없을 때만 넣는다.
 * F2: 표시 값의 마지막 접속 시각 = 저장소 값 우선.
 * F3: 1:1 방 + 상대 id + 값 없음 → 머리글 부제 빈칸(방 설명 문구 금지).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { createPresenceSnapshotPollScheduler } from "@/lib/community-messenger/realtime/presence/presence-snapshot-poll-scheduler";
import { mergePresenceSnapshotsIntoStoreMap } from "@/lib/community-messenger/realtime/presence/merge-presence-snapshots";
import { resolveMessengerRoomHeaderStatusLine } from "@/lib/community-messenger/realtime/presence/resolve-room-header-status-line";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";

type Snap = CommunityMessengerPeerPresenceSnapshot;

describe("F1 — 처음 보는 상대 1회 조회", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:45:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  function setup(healthy: boolean) {
    const state = { healthy };
    const calls: string[][] = [];
    const infos: boolean[] = [];
    const scheduler = createPresenceSnapshotPollScheduler({
      fetchBatch: async (ids) => {
        calls.push([...ids]);
        return new Map<string, Snap>(ids.map((id) => [id, { userId: id, state: "offline", lastSeenAt: null }]));
      },
      apply: (_m, info) => infos.push(info.initial),
      isRealtimeHealthy: () => state.healthy,
      isDeferred: () => false,
      isDocumentVisible: () => true,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      intervalMs: 12_000,
      coalesceMs: 50,
      minRunGapMs: 2_000,
    });
    return { scheduler, state, calls, infos };
  }

  it("실시간 정상이어도 새 id 는 1회 조회하고, 그 뒤 정상인 동안은 다시 조회하지 않는다", async () => {
    const { scheduler, calls, infos } = setup(true);
    scheduler.subscribe("w");
    await vi.advanceTimersByTimeAsync(60);
    expect(calls).toEqual([["w"]]);
    expect(infos).toEqual([true]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(calls).toHaveLength(1);
  });

  it("실시간 비정상 폴링 결과는 첫 값이 아니다(덮어쓰기 유지)", async () => {
    const { scheduler, infos } = setup(false);
    scheduler.subscribe("w");
    await vi.advanceTimersByTimeAsync(60);
    expect(infos).toEqual([false]);
  });
});

describe("F1 — 첫 값은 저장소에 없을 때만", () => {
  const snaps = new Map<string, Snap>([
    ["a", { userId: "a", state: "offline", lastSeenAt: "2026-11-13T20:15:17.561Z" }],
    ["b", { userId: "b", state: "offline", lastSeenAt: "2026-11-13T00:00:00.000Z" }],
  ]);
  const prev = { a: { userId: "a", state: "online" as const, lastSeenAt: null, updatedAt: "2026-11-16T10:44:59Z" } };
  it("fillOnly: 실시간 online 은 덮지 않고, 없는 b 만 넣는다", () => {
    const next = mergePresenceSnapshotsIntoStoreMap(prev, snaps, { observedAtIso: "2026-11-16T10:45:00Z", fillOnly: true });
    expect(next.a.state).toBe("online");
    expect(next.b).toMatchObject({ state: "offline", lastSeenAt: "2026-11-13T00:00:00.000Z" });
  });
  it("폴링(fillOnly 아님): 지금처럼 덮는다", () => {
    const next = mergePresenceSnapshotsIntoStoreMap(prev, snaps, { observedAtIso: "2026-11-16T10:45:00Z", fillOnly: false });
    expect(next.a.state).toBe("offline");
  });
});

describe("F2·F3 — 머리글 부제", () => {
  const t = (k: string, vars?: Record<string, string | number>) => (vars?.stamp ? `${k}:${vars.stamp}` : k);
  const base = { roomType: "direct", typingLabel: null, roomHeaderStatus: "1:1 대화 · 설명", t };
  it("값 없음 + 상대 id → 빈칸 (방 설명 문구 금지)", () => {
    expect(resolveMessengerRoomHeaderStatusLine({ ...base, peerUserId: "w", peerPresence: null })).toEqual({
      kind: "text",
      text: "",
    });
  });
  it("상대 id 가 없으면 지금처럼 대체 문구", () => {
    expect(resolveMessengerRoomHeaderStatusLine({ ...base, peerUserId: null, peerPresence: null })).toEqual({
      kind: "text",
      text: "1:1 대화 · 설명",
    });
  });
  it("오프라인 + 마지막 접속 시각 → 「마지막 접속 …」(i18n 키)", () => {
    const snap = { userId: "w", state: "offline" as const, lastSeenAt: "2026-11-13T20:15:17.561Z" };
    const line = resolveMessengerRoomHeaderStatusLine({ ...base, peerUserId: "w", peerPresence: snap });
    expect(line).toEqual({ kind: "text", text: formatMessengerPeerPresenceLine(snap, t) });
    expect(line.kind === "text" && /^cm_presence_last_seen_(today|yesterday|date)$/.test(line.text)).toBe(true);
  });
  it("그룹방은 지금과 같음", () => {
    expect(
      resolveMessengerRoomHeaderStatusLine({ ...base, roomType: "private_group", peerUserId: null, peerPresence: null })
    ).toEqual({ kind: "text", text: "1:1 대화 · 설명" });
  });
  it("P3: 입력 중이면 어떤 방이든 typing 결과", () => {
    expect(
      resolveMessengerRoomHeaderStatusLine({ ...base, typingLabel: "입력 중", peerUserId: "w", peerPresence: null })
    ).toEqual({ kind: "typing", label: "입력 중" });
  });
  it("훅은 저장소 lastSeenAt 을 우선 넘긴다(소스 계약)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/community-messenger/realtime/presence/use-community-messenger-peer-presence.ts"),
      "utf8"
    );
    expect(src).toMatch(/lastSeenAt:\s*liveLastSeenAt \?\? fallback\?\.lastSeenAt \?\? null/);
    expect(src).not.toMatch(/lastSeenAt:\s*fallback\?\.lastSeenAt \?\? null/);
  });
  it("머리글은 이 함수로 부제를 정한다", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx"),
      "utf8"
    );
    expect(src).toMatch(/resolveMessengerRoomHeaderStatusLine\(/);
  });
});
