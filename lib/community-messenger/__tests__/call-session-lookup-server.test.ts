/**
 * 통화 세션 조회 서버 분류 — DB 일시 오류는 부재(404)가 아니다.
 * `lookupCommunityMessengerCallSessionById`: found / not_found(행 없음·잘못된 id) / forbidden(참여자 아님) / error(DB 오류).
 * `getCommunityMessengerCallSessionById` 는 다른 호출자용 기존 계약(세션 | null) 유지.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type TableResult = { data: unknown; error: unknown };
const tables: Record<string, TableResult> = {};
const queried: string[] = [];

function builder(table: string) {
  const result = () => tables[table] ?? { data: [], error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "neq", "is", "or", "filter", "match"]) {
    b[m] = () => b;
  }
  b.maybeSingle = async () => result();
  b.single = async () => result();
  b.then = (resolve: (v: TableResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return b;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      queried.push(table);
      return builder(table);
    },
  }),
}));

import {
  getCommunityMessengerCallSessionById,
  lookupCommunityMessengerCallSessionById,
} from "@/lib/community-messenger/service";

const SID = "6f106d55-77aa-4b18-b2c8-efe5311751ed";
const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function sessionRow(extra?: Record<string, unknown>) {
  return {
    id: SID,
    room_id: "44444444-4444-4444-8444-444444444444",
    initiator_user_id: ME,
    recipient_user_id: PEER,
    session_mode: "direct",
    max_participants: 2,
    call_kind: "voice",
    status: "active",
    started_at: "2026-11-05T10:00:00Z",
    answered_at: "2026-11-05T10:00:05Z",
    connected_at: null,
    ended_at: null,
    ended_reason: null,
    created_at: "2026-11-05T10:00:00Z",
    ...extra,
  };
}

function participantRows(userIds: string[]) {
  return userIds.map((user_id, i) => ({
    id: `p${i}`,
    session_id: SID,
    room_id: "44444444-4444-4444-8444-444444444444",
    user_id,
    participation_status: "joined",
    joined_at: "2026-11-05T10:00:05Z",
    left_at: null,
    created_at: "2026-11-05T10:00:00Z",
  }));
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  queried.length = 0;
});

describe("lookupCommunityMessengerCallSessionById", () => {
  it("DB 오류 → error (개발용 메모리 상태로 대체해 not_found 로 만들지 않는다)", async () => {
    tables.community_messenger_call_sessions = { data: null, error: { message: "timeout" } };
    const r = await lookupCommunityMessengerCallSessionById(ME, SID);
    expect(r.kind).toBe("error");
    expect(await getCommunityMessengerCallSessionById(ME, SID)).toBeNull();
  });

  it("행 없음 → not_found", async () => {
    tables.community_messenger_call_sessions = { data: null, error: null };
    expect((await lookupCommunityMessengerCallSessionById(ME, SID)).kind).toBe("not_found");
  });

  it("uuid 아닌 id → 조회 없이 not_found (DB 형식 오류를 일시 오류로 만들지 않는다)", async () => {
    const r = await lookupCommunityMessengerCallSessionById(ME, "not-a-uuid");
    expect(r.kind).toBe("not_found");
    expect(queried).toEqual([]);
    expect((await lookupCommunityMessengerCallSessionById(ME, "  ")).kind).toBe("not_found");
  });

  it("참여자 아님 → forbidden", async () => {
    tables.community_messenger_call_sessions = { data: sessionRow(), error: null };
    tables.community_messenger_call_session_participants = { data: participantRows([ME, PEER]), error: null };
    expect((await lookupCommunityMessengerCallSessionById(OTHER, SID)).kind).toBe("forbidden");
  });

  it("그룹 세션에서 참여자 조회만 실패 → forbidden 이 아니라 error", async () => {
    tables.community_messenger_call_sessions = { data: sessionRow({ session_mode: "group" }), error: null };
    tables.community_messenger_call_session_participants = { data: null, error: { message: "timeout" } };
    expect((await lookupCommunityMessengerCallSessionById(ME, SID)).kind).toBe("error");
  });

  it("1:1 발신·수신자는 참여자 조회가 실패해도 found (기존 동작 유지)", async () => {
    tables.community_messenger_call_sessions = { data: sessionRow(), error: null };
    tables.community_messenger_call_session_participants = { data: null, error: { message: "timeout" } };
    const r = await lookupCommunityMessengerCallSessionById(PEER, SID);
    expect(r.kind).toBe("found");
  });

  it("정상 · terminal 세션도 found (종료는 status 로 판단 — 404 아님)", async () => {
    tables.community_messenger_call_sessions = {
      data: sessionRow({ status: "ended", ended_at: "2026-11-05T10:05:00Z" }),
      error: null,
    };
    tables.community_messenger_call_session_participants = { data: participantRows([ME, PEER]), error: null };
    const r = await lookupCommunityMessengerCallSessionById(ME, SID);
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.session.status).toBe("ended");
    expect((await getCommunityMessengerCallSessionById(ME, SID))?.status).toBe("ended");
  });
});
