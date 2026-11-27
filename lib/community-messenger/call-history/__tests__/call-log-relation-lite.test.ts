/**
 * 결함 4 — 통화 기록 목록 관계 조회 줄이기 (통화 영향 분석서 call-log-relation-lite-call-impact-2026-11-27.md).
 * 시험 장치는 call-history-list-query-consolidation.test.ts 와 같다(개발용 메모리 상태 · Supabase 없음).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CALLER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CALLEE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROOM = "room-hist-1";

type QueryHit = { table: string };

const queryHits: QueryHit[] = [];

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(),
}));

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  __callLogRelationScopeTestHooks as hooks,
  listCommunityMessengerCallLogs,
} from "@/lib/community-messenger/service";

type DevState = {
  friendRequests: unknown[];
  favoriteFriends: Map<string, unknown>;
  hiddenFriends: Map<string, unknown>;
  rooms: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
  roomProfiles: unknown[];
  messages: unknown[];
  calls: Array<Record<string, unknown>>;
  callSessions: Array<Record<string, unknown>>;
  callSignals: unknown[];
};

function resetDevState(partial?: Partial<DevState>): DevState {
  const state: DevState = {
    friendRequests: [],
    favoriteFriends: new Map(),
    hiddenFriends: new Map(),
    rooms: [
      {
        id: ROOM,
        roomType: "direct",
        title: "Peer DM",
        lastMessage: null,
        lastMessageAt: null,
      },
    ],
    participants: [
      { roomId: ROOM, userId: CALLER, unreadCount: 0 },
      { roomId: ROOM, userId: CALLEE, unreadCount: 0 },
    ],
    roomProfiles: [],
    messages: [],
    calls: [],
    callSessions: [],
    callSignals: [],
    ...partial,
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

function seedCall(opts: {
  id: string;
  sessionId: string;
  callKind: "voice" | "video";
  status: string;
  callerUserId: string;
  peerUserId: string;
  startedAt: string;
  durationSeconds?: number;
  endedAt?: string | null;
  endedReason?: string | null;
  answeredAt?: string | null;
  connectedAt?: string | null;
}) {
  const state = (globalThis as unknown as { __samarketCommunityMessengerState: DevState })
    .__samarketCommunityMessengerState;
  state.calls.push({
    id: opts.id,
    sessionId: opts.sessionId,
    roomId: ROOM,
    callerUserId: opts.callerUserId,
    peerUserId: opts.peerUserId,
    callKind: opts.callKind,
    status: opts.status,
    durationSeconds: opts.durationSeconds ?? 0,
    startedAt: opts.startedAt,
  });
  state.callSessions.push({
    id: opts.sessionId,
    roomId: ROOM,
    sessionMode: "direct",
    initiatorUserId: opts.callerUserId,
    recipientUserId: opts.peerUserId,
    callKind: opts.callKind,
    status: opts.status === "ended" || opts.status === "missed" || opts.status === "rejected" || opts.status === "cancelled"
      ? opts.status === "ended"
        ? "ended"
        : opts.status
      : "ended",
    startedAt: opts.startedAt,
    answeredAt: opts.answeredAt ?? null,
    connectedAt: opts.connectedAt ?? null,
    endedAt: opts.endedAt ?? null,
    endedReason: opts.endedReason ?? null,
    createdAt: opts.startedAt,
    participants: [
      { userId: opts.callerUserId, participationStatus: "joined" },
      { userId: opts.peerUserId, participationStatus: "joined" },
    ],
  });
}


const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function seedFriend() {
  const state = (globalThis as unknown as { __samarketCommunityMessengerState: DevState })
    .__samarketCommunityMessengerState;
  state.friendRequests.push({
    id: "fr-1",
    requester_id: CALLER,
    addressee_id: CALLEE,
    status: "accepted",
    responded_at: "2026-06-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
  });
}

function seedEnded(id: string, startedAt: string, opts?: { callerUserId?: string; endedReason?: string | null }) {
  seedCall({
    id,
    sessionId: `s-${id}`,
    callKind: "voice",
    status: "ended",
    callerUserId: opts?.callerUserId ?? CALLER,
    peerUserId: (opts?.callerUserId ?? CALLER) === CALLER ? CALLEE : CALLER,
    startedAt,
    durationSeconds: 5,
    endedAt: startedAt,
    endedReason: opts?.endedReason ?? null,
  });
}

describe("결함 4 — 통화 기록 목록 view·관계 범위", () => {
  beforeEach(() => {
    queryHits.length = 0;
    resetDevState();
    vi.mocked(getSupabaseServer).mockImplementation(() => {
      throw new Error("no_supabase_for_dev_parity");
    });
  });

  it("통화 탭(full) — 친구면 mutual_friend, 아니면 stranger (친구 여부는 그대로 계산)", async () => {
    seedEnded("c1", "2026-06-09T10:00:00.000Z");
    const stranger = await listCommunityMessengerCallLogs(CALLER);
    expect(stranger.ok && stranger.calls[0]?.peerRelationLabel).toBe("stranger");
    seedFriend();
    const friend = await listCommunityMessengerCallLogs(CALLER);
    expect(friend.ok && friend.calls[0]?.peerRelationLabel).toBe("mutual_friend");
  });

  it("홈(view=home) — 앞 limit 건, peerRelationLabel 없음, 다음 페이지 없음", async () => {
    for (let i = 0; i < 5; i += 1) seedEnded(`h${i}`, `2026-06-09T1${i}:00:00.000Z`);
    const listed = await listCommunityMessengerCallLogs(CALLER, { view: "home", limit: 3 });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls.map((c) => c.id)).toEqual(["h4", "h3", "h2"]);
    expect(listed.calls.every((c) => !("peerRelationLabel" in c))).toBe(true);
    expect(listed.nextCursor).toBeNull();
    expect(listed.hasMore).toBe(true);
  });

  it("홈 — 보는 사람 기준 제외 행이 맨 앞에 있어도 3건을 채운다(행을 3개만 읽지 않음)", async () => {
    for (let i = 0; i < 4; i += 1) seedEnded(`ok${i}`, `2026-06-09T0${i}:00:00.000Z`);
    /** 상대가 건 「본인 통화 중」 기록은 상대(발신자)만 본다 — CALLER 목록에서 빠진다 */
    seedEnded("busy1", "2026-06-09T20:00:00.000Z", { callerUserId: CALLEE, endedReason: "caller_busy" });
    seedEnded("busy2", "2026-06-09T21:00:00.000Z", { callerUserId: CALLEE, endedReason: "caller_busy" });
    const listed = await listCommunityMessengerCallLogs(CALLER, { view: "home", limit: 3 });
    expect(listed.ok && listed.calls.map((c) => c.id)).toEqual(["ok3", "ok2", "ok1"]);
  });

  it("홈 limit 상한·하한", async () => {
    for (let i = 0; i < 9; i += 1) seedEnded(`m${i}`, `2026-06-09T0${i}:00:00.000Z`);
    const big = await listCommunityMessengerCallLogs(CALLER, { view: "home", limit: 999 });
    expect(big.ok && big.calls.length).toBe(9);
    const zero = await listCommunityMessengerCallLogs(CALLER, { view: "home", limit: 0 });
    expect(zero.ok && zero.calls.length).toBe(3);
  });

  it("관계 범위 friend 의 친구 판정 = all 의 친구 판정 (친구·모르는 사람·자기 자신 섞어)", async () => {
    const OTHER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    seedFriend();
    const targets = [CALLER, CALLEE, OTHER];
    const all = await hooks.getViewerRelationSets(CALLER, targets);
    const friend = await hooks.getViewerRelationSetsScoped(CALLER, targets, "friend");
    expect([...friend.friendIds].sort()).toEqual([...all.friendIds].sort());
    expect([...friend.friendIds]).toEqual([CALLEE]);
    /** friend 범위는 다른 관계 값을 계산하지 않는다(통화 기록이 안 읽는 값) */
    expect(friend.blocked.size + friend.following.size + friend.favoriteFriendIds.size + friend.hiddenFriendIds.size).toBe(0);
    const none = await hooks.getViewerRelationSetsScoped(CALLER, targets, "none");
    expect(none.friendIds.size).toBe(0);
    const allViaScoped = await hooks.getViewerRelationSetsScoped(CALLER, targets, "all");
    expect([...allViaScoped.friendIds]).toEqual([...all.friendIds]);
  });

  it("full 응답은 view 없을 때와 같다", async () => {
    seedFriend();
    for (let i = 0; i < 3; i += 1) seedEnded(`f${i}`, `2026-06-09T0${i}:00:00.000Z`);
    const a = await listCommunityMessengerCallLogs(CALLER);
    const b = await listCommunityMessengerCallLogs(CALLER, { view: "full" });
    expect(b).toEqual(a);
  });
});

describe("결함 4 — 소스 경계", () => {
  const svc = read("lib/community-messenger/service.ts");
  it("hydrateProfiles 기본 관계 범위는 all(다른 호출처 무변경)", () => {
    expect(svc).toContain('getViewerRelationSetsScoped(viewerId, uniqueTargets, options?.relations ?? "all")');
  });
  it("관계 범위 friend·none 은 통화 기록 목록에서만 넘긴다", () => {
    /** 호출 인자만(타입 선언 `relations: HydrateProfilesRelations` 제외) */
    const hits = (svc.match(/relations: [^,}\n]+/g) ?? []).filter((h) => !h.includes("HydrateProfilesRelations")).map((h) => h.trim());
    expect(hits).toEqual(['relations: homeView ? "none" : "friend"']);
  });
  it("홈 telRING 은 홈 전용 응답을 부른다", () => {
    expect(read("components/home-hub/HomeTelringRecent.tsx")).toContain(
      "fetchCommunityMessengerCallLogsClient({ homeLimit: HOME_TELRING_RECENT_ROWS })"
    );
    expect(read("lib/community-messenger/call-history/use-community-call-history-realtime-sync.ts")).toContain(
      "/api/community-messenger/calls?view=home&limit="
    );
  });
  it("통화 탭 패널은 그대로 view 없이 부른다", () => {
    const panel = read("components/community-messenger/MessengerCallLogsPanel.tsx");
    expect(panel).not.toContain("homeLimit");
  });
});
