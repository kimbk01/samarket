import { describe, expect, it } from "vitest";
import {
  MESSENGER_REPORT_TARGET_NOT_FOUND,
  resolveMessengerReportTarget,
  type MessengerReportMessageRow,
  type MessengerReportTargetDeps,
} from "@/lib/community-messenger/server/messenger-report-target";

const REPORTER = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";
const ROOM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_A = "a0000000-0000-4000-8000-000000000001";
const MSG_B = "b0000000-0000-4000-8000-000000000002";
const MSG_DELETED = "a0000000-0000-4000-8000-000000000003";
const MSG_RECALLED = "a0000000-0000-4000-8000-000000000004";
const MSG_MINE = "a0000000-0000-4000-8000-000000000005";
const MSG_FROM_GONE = "a0000000-0000-4000-8000-000000000006";

/** 신고자는 ROOM_A 활성 참가자, ROOM_B 비참가. ROOM_B 의 메시지 MSG_B. */
function deps(over: Partial<MessengerReportTargetDeps> = {}): MessengerReportTargetDeps & { calls: string[] } {
  const calls: string[] = [];
  const messages: Record<string, MessengerReportMessageRow & { room: string }> = {
    [MSG_A]: { room: ROOM_A, sender_id: PEER, deleted_at: null, deleted_for_everyone_at: null },
    [MSG_B]: { room: ROOM_B, sender_id: OUTSIDER, deleted_at: null, deleted_for_everyone_at: null },
    [MSG_DELETED]: { room: ROOM_A, sender_id: PEER, deleted_at: "2026-11-01T00:00:00Z", deleted_for_everyone_at: null },
    [MSG_RECALLED]: { room: ROOM_A, sender_id: PEER, deleted_at: null, deleted_for_everyone_at: "2026-11-01T00:00:00Z" },
    [MSG_MINE]: { room: ROOM_A, sender_id: REPORTER, deleted_at: null, deleted_for_everyone_at: null },
    [MSG_FROM_GONE]: { room: ROOM_A, sender_id: GONE, deleted_at: null, deleted_for_everyone_at: null },
  };
  const participants = new Set([`${ROOM_A}:${REPORTER}`, `${ROOM_A}:${PEER}`, `${ROOM_A}:${GONE}`, `${ROOM_B}:${OUTSIDER}`]);
  const profiles: Record<string, { id: string; status: string | null; deleted_at: string | null }> = {
    [REPORTER]: { id: REPORTER, status: "active", deleted_at: null },
    [PEER]: { id: PEER, status: "active", deleted_at: null },
    [OUTSIDER]: { id: OUTSIDER, status: "active", deleted_at: null },
    [GONE]: { id: GONE, status: "withdrawn", deleted_at: "2026-10-01T00:00:00Z" },
  };
  return {
    calls,
    resolveMemberRoomId: async (userId, raw) => {
      calls.push(`room:${raw}`);
      return participants.has(`${raw}:${userId}`) ? raw : null;
    },
    loadMessage: async (roomId, messageId) => {
      calls.push(`msg:${messageId}`);
      const m = messages[messageId];
      return m && m.room === roomId ? m : null;
    },
    hasParticipantRow: async (roomId, userId) => participants.has(`${roomId}:${userId}`),
    loadProfile: async (userId) => profiles[userId] ?? null,
    ...over,
  };
}

const notFound = { ok: false, status: 404, error: MESSENGER_REPORT_TARGET_NOT_FOUND };

describe("messenger report target — 메시지 신고", () => {
  it("참가 방의 메시지 → 피신고자는 서버가 발신자로 정한다 (클라이언트 값 무시)", async () => {
    const r = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId: MSG_A, reportedUserId: OUTSIDER },
      deps()
    );
    expect(r).toEqual({ ok: true, roomId: ROOM_A, messageId: MSG_A, reportedUserId: PEER });
  });

  it("비참가 방(ROOM_B)의 메시지 → 404, 메시지 조회 자체를 하지 않는다", async () => {
    const d = deps();
    const r = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_B, messageId: MSG_B },
      d
    );
    expect(r).toEqual(notFound);
    expect(d.calls).not.toContain(`msg:${MSG_B}`);
  });

  it("내 방 id 에 다른 방 메시지 id 를 섞으면 → 404 (없는 메시지와 같은 응답)", async () => {
    const a = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId: MSG_B },
      deps()
    );
    const b = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId: "a0000000-0000-4000-8000-0000000000ff" },
      deps()
    );
    expect(a).toEqual(notFound);
    expect(b).toEqual(notFound);
  });

  it("삭제된 메시지·모두에게서 삭제된 메시지 → 404", async () => {
    for (const messageId of [MSG_DELETED, MSG_RECALLED]) {
      const r = await resolveMessengerReportTarget(
        { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId },
        deps()
      );
      expect(r).toEqual(notFound);
    }
  });

  it("내 메시지 → 400 cannot_report_self", async () => {
    const r = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId: MSG_MINE },
      deps()
    );
    expect(r).toEqual({ ok: false, status: 400, error: "cannot_report_self" });
  });

  it("탈퇴한 회원이 남긴 메시지는 신고할 수 있다", async () => {
    const r = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId: MSG_FROM_GONE },
      deps()
    );
    expect(r).toEqual({ ok: true, roomId: ROOM_A, messageId: MSG_FROM_GONE, reportedUserId: GONE });
  });

  it("방·메시지 id 누락 → 400, uuid 아닌 id → 404 (DB 조회 없음)", async () => {
    const d = deps();
    expect(
      await resolveMessengerReportTarget({ reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A }, d)
    ).toEqual({ ok: false, status: 400, error: "missing_target" });
    expect(
      await resolveMessengerReportTarget(
        { reporterUserId: REPORTER, reportType: "message", roomId: ROOM_A, messageId: "1 or 1=1" },
        d
      )
    ).toEqual(notFound);
    expect(d.calls).toEqual([]);
  });
});

describe("messenger report target — 방·회원 신고", () => {
  it("참가 방 신고 → 통과, 비참가 방 → 404", async () => {
    expect(
      await resolveMessengerReportTarget({ reporterUserId: REPORTER, reportType: "room", roomId: ROOM_A }, deps())
    ).toEqual({ ok: true, roomId: ROOM_A, messageId: null, reportedUserId: null });
    expect(
      await resolveMessengerReportTarget({ reporterUserId: REPORTER, reportType: "room", roomId: ROOM_B }, deps())
    ).toEqual(notFound);
  });

  it("방 신고에 그 방 참가자가 아닌 피신고자를 붙이면 → 404", async () => {
    const r = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "room", roomId: ROOM_A, reportedUserId: OUTSIDER },
      deps()
    );
    expect(r).toEqual(notFound);
  });

  it("회원 신고(방 없음) → 통과, 자기 자신 → 400, 탈퇴 회원 → 404", async () => {
    expect(
      await resolveMessengerReportTarget({ reporterUserId: REPORTER, reportType: "user", reportedUserId: PEER }, deps())
    ).toEqual({ ok: true, roomId: null, messageId: null, reportedUserId: PEER });
    expect(
      await resolveMessengerReportTarget({ reporterUserId: REPORTER, reportType: "user", reportedUserId: REPORTER }, deps())
    ).toEqual({ ok: false, status: 400, error: "cannot_report_self" });
    expect(
      await resolveMessengerReportTarget({ reporterUserId: REPORTER, reportType: "user", reportedUserId: GONE }, deps())
    ).toEqual(notFound);
  });

  it("회원 신고에 비참가 방 id 를 붙이면 → 404 (방 정보로 우회 불가)", async () => {
    const r = await resolveMessengerReportTarget(
      { reporterUserId: REPORTER, reportType: "user", reportedUserId: OUTSIDER, roomId: ROOM_B },
      deps()
    );
    expect(r).toEqual(notFound);
  });

  it("탈퇴한 신고자 → 403 account_withdrawn", async () => {
    const r = await resolveMessengerReportTarget(
      { reporterUserId: GONE, reportType: "user", reportedUserId: PEER },
      deps()
    );
    expect(r).toEqual({ ok: false, status: 403, error: "account_withdrawn" });
  });
});
