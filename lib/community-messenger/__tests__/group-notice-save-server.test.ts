/**
 * 그룹 공지 저장 — 서비스 롤 서버 경로. `community_messenger_update_group_notice` RPC 는 auth.uid() 기준이라
 * 서비스 롤 호출에서 항상 `unauthorized` 를 돌려줘 클라이언트가 로그인 창을 띄웠다(운영 2026-11-05 21:52 PHT).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type TableResult = { data: unknown; error: unknown };
const tables: Record<string, TableResult> = {};
const roomUpdates: Record<string, unknown>[] = [];
const rpcCalls: string[] = [];
const messageInserts: Record<string, unknown>[] = [];
let roomUpdateError: unknown = null;

function builder(table: string) {
  let updating = false;
  const result = () =>
    updating && roomUpdateError ? { data: null, error: roomUpdateError } : (tables[table] ?? { data: null, error: null });
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "neq", "is", "or", "filter", "match", "upsert", "delete"]) {
    b[m] = () => b;
  }
  b.insert = (payload: Record<string, unknown>) => {
    if (table === "community_messenger_messages") messageInserts.push(payload);
    return b;
  };
  b.update = (payload: Record<string, unknown>) => {
    if (table === "community_messenger_rooms") {
      roomUpdates.push(payload);
      updating = true;
    }
    return b;
  };
  b.maybeSingle = async () => result();
  b.single = async () => result();
  b.then = (resolve: (v: TableResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return b;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => builder(table),
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: null, error: null };
    },
  }),
}));

import { updateCommunityMessengerPrivateGroupNotice } from "@/lib/community-messenger/service";

const ROOM = "72a97f0f-65d9-4162-bae1-de33f0c30090";
const ME = "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc";

function setRoom(room: Record<string, unknown> | null, role: string | null) {
  tables.community_messenger_rooms = { data: room, error: null };
  tables.community_messenger_participants = { data: role ? { role } : null, error: null };
}

describe("updateCommunityMessengerPrivateGroupNotice (서비스 롤)", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    roomUpdates.length = 0;
    rpcCalls.length = 0;
    messageInserts.length = 0;
    roomUpdateError = null;
  });

  it("로그인 사용자 id 가 없으면 조회·저장 없이 unauthorized", async () => {
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: true }, "owner");
    expect(await updateCommunityMessengerPrivateGroupNotice({ userId: "  ", roomId: ROOM, noticeText: "x" })).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(roomUpdates).toHaveLength(0);
    expect(messageInserts).toHaveLength(0);
  });

  it("공지 UPDATE 실패면 시스템 메시지를 남기지 않는다 — 부분 저장 없음", async () => {
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: true }, "owner");
    roomUpdateError = { message: "write failed", code: "XX000" };
    const r = await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" });
    expect(r).toEqual({ ok: false, error: "write failed" });
    expect(messageInserts).toHaveLength(0);
  });

  it("방장은 저장된다 — notice_text·notice_updated_at·notice_updated_by 갱신, auth.uid() RPC 를 부르지 않는다", async () => {
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: true }, "owner");
    const r = await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "  b2b notice  " });
    expect(r).toEqual({ ok: true });
    const noticeUpdate = roomUpdates.find((u) => "notice_text" in u);
    expect(noticeUpdate).toMatchObject({ notice_text: "b2b notice", notice_updated_by: ME });
    expect(typeof noticeUpdate?.notice_updated_at).toBe("string");
    expect(rpcCalls).not.toContain("community_messenger_update_group_notice");
    expect(messageInserts).toEqual([expect.objectContaining({ room_id: ROOM, message_type: "system", sender_id: null })]);
  });

  it("관리자는 공지 수정 허용일 때만 저장된다", async () => {
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: true }, "admin");
    expect(await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" })).toEqual({ ok: true });

    roomUpdates.length = 0;
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: false }, "admin");
    expect(await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(roomUpdates.some((u) => "notice_text" in u)).toBe(false);
  });

  it("일반 멤버·비참가자·비공개 그룹 아님은 저장하지 않는다 (RPC 와 같은 오류 코드)", async () => {
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: true }, "member");
    expect(await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    setRoom({ id: ROOM, room_type: "private_group", allow_admin_edit_notice: true }, null);
    expect(await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" })).toEqual({
      ok: false,
      error: "room_not_found",
    });
    setRoom({ id: ROOM, room_type: "open_group", allow_admin_edit_notice: true }, "owner");
    expect(await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" })).toEqual({
      ok: false,
      error: "not_group_room",
    });
    expect(roomUpdates.some((u) => "notice_text" in u)).toBe(false);
  });

  it("조회 DB 오류는 저장하지 않고 오류로 돌려준다 — 로그인 필요 문구가 아니다", async () => {
    tables.community_messenger_rooms = { data: null, error: { message: "db down", code: "XX000" } };
    tables.community_messenger_participants = { data: { role: "owner" }, error: null };
    const r = await updateCommunityMessengerPrivateGroupNotice({ userId: ME, roomId: ROOM, noticeText: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/unauthorized|로그인이 필요/i);
    expect(roomUpdates.some((u) => "notice_text" in u)).toBe(false);
  });
});
