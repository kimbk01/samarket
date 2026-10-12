import { describe, expect, it } from "vitest";
import { resolveTerminalRingStopTarget } from "@/lib/community-messenger/incoming-call/terminal-ring-scope";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const ROOM = "cccccccc-3333-4333-8333-333333333333";
const CALLER = "dddddddd-4444-4444-8444-444444444444";

function ringing(id: string, extra: Partial<CommunityMessengerCallSession> = {}): CommunityMessengerCallSession {
  return {
    id,
    roomId: ROOM,
    sessionMode: "direct",
    initiatorUserId: CALLER,
    recipientUserId: "me",
    peerUserId: CALLER,
    peerLabel: "caller",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
    ...extra,
  } as CommunityMessengerCallSession;
}

describe("resolveTerminalRingStopTarget", () => {
  it("nothing ringing → no stop", () => {
    expect(resolveTerminalRingStopTarget({ activeRingCallId: null, query: { sessionId: A } })).toBeNull();
  });

  // ── 확정 결함: 이전 통화 A 의 늦은 종료가 새 통화 B 의 벨을 끄면 안 된다 (취소 후 곧바로 다시 걸기) ──
  it("late terminal of call A does NOT stop call B's ring (same room, same caller, same kind)", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B),
        query: { sessionId: A, roomId: ROOM, initiatorUserId: CALLER, callKind: "voice", status: "cancelled" },
      })
    ).toBeNull();
  });

  it("late terminal of call A does NOT stop call B's ring when the ringing row is unknown (call-engine path)", () => {
    expect(resolveTerminalRingStopTarget({ activeRingCallId: B, query: { sessionId: A } })).toBeNull();
  });

  it("terminal of the ringing call stops it (real id)", () => {
    expect(resolveTerminalRingStopTarget({ activeRingCallId: B, ringingSession: ringing(B), query: { sessionId: B } })).toBe(B);
    expect(resolveTerminalRingStopTarget({ activeRingCallId: B, query: { sessionId: B } })).toBe(B);
  });

  // ── tmp_* 별칭: 기존 통화 벨이 계속 울리는 회귀를 만들지 않는다 ──
  it("tmp-only terminal matching the ringing row's tmp alias stops the ring (caller cancelled before create returned)", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B, { tmpSessionId: "tmp_b" }),
        query: { tmpSessionId: "tmp_b" },
      })
    ).toBe(B);
  });

  it("tmp carried in the sessionId slot is treated as an alias (not a different real id)", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B, { tmpSessionId: "tmp_b" }),
        query: { sessionId: "tmp_b" },
      })
    ).toBe(B);
  });

  it("tmp-only terminal of a different dial (ringing row has another tmp alias) does not stop", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B, { tmpSessionId: "tmp_b" }),
        query: { tmpSessionId: "tmp_a", roomId: ROOM, initiatorUserId: CALLER, callKind: "voice" },
      })
    ).toBeNull();
  });

  it("tmp-only terminal + ringing row without alias → keeps previous behaviour via room/caller/kind (match → stop)", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B),
        query: { tmpSessionId: "tmp_x", roomId: ROOM, initiatorUserId: CALLER, callKind: "voice" },
      })
    ).toBe(B);
  });

  it("tmp-only terminal from another room/caller does not stop a ringing row without alias", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B),
        query: { tmpSessionId: "tmp_x", roomId: "other-room", initiatorUserId: CALLER, callKind: "voice" },
      })
    ).toBeNull();
  });

  it("tmp-only terminal without room info and no alias → cannot disprove → previous behaviour (stop)", () => {
    expect(
      resolveTerminalRingStopTarget({ activeRingCallId: B, ringingSession: ringing(B), query: { tmpSessionId: "tmp_x" } })
    ).toBe(B);
    expect(resolveTerminalRingStopTarget({ activeRingCallId: B, query: { tmpSessionId: "tmp_x" } })).toBe(B);
  });

  it("id-less terminal keeps previous behaviour (room/caller/kind when present)", () => {
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B),
        query: { roomId: ROOM, initiatorUserId: CALLER, callKind: "voice" },
      })
    ).toBe(B);
    expect(
      resolveTerminalRingStopTarget({
        activeRingCallId: B,
        ringingSession: ringing(B),
        query: { roomId: "other-room", initiatorUserId: CALLER, callKind: "voice" },
      })
    ).toBeNull();
    expect(resolveTerminalRingStopTarget({ activeRingCallId: B, query: {} })).toBe(B);
  });

  it("ignores a ringing row whose id is not the active ring (stale row)", () => {
    expect(
      resolveTerminalRingStopTarget({ activeRingCallId: B, ringingSession: ringing(A), query: { sessionId: A } })
    ).toBeNull();
  });
});
