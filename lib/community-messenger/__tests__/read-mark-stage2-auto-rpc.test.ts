/**
 * 2026-11-22 읽음 2단계 — 방 종류·끝 메시지·중복 방지 키를 DB 함수 안에서.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage2-design-2026-11-22.md
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildCmMarkReadIdempotencyKey,
  markRoomReadAtomicAuto,
} from "@/lib/community-messenger/room-unread-authority-rpc";

function sbReturning(res: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => res);
  return { sb: { rpc } as never, rpc };
}

describe("markRoomReadAtomicAuto", () => {
  it("인자 3개로 1번 부르고 결과를 기존과 같은 모양으로", async () => {
    const { sb, rpc } = sbReturning({
      data: { ok: true, lastReadMessageId: "m1", lastReadAt: "t", unreadCount: 0, duplicateSkipped: false, lastReadAdvanced: true },
      error: null,
    });
    const r = await markRoomReadAtomicAuto(sb, { viewerId: "u", roomId: "r", readThroughMessageId: null });
    expect(rpc).toHaveBeenCalledWith("dibay_mark_room_read_atomic_auto", {
      p_viewer_id: "u",
      p_room_id: "r",
      p_read_through_message_id: null,
    });
    expect(r).toEqual({
      kind: "done",
      result: {
        ok: true,
        lastReadMessageId: "m1",
        lastReadAt: "t",
        unreadCount: 0,
        duplicateSkipped: false,
        replayed: false,
        lastReadAdvanced: true,
        regressionBlocked: false,
      },
    });
  });
  it("unsupported_domain → unsupported(이전 경로)", async () => {
    const { sb } = sbReturning({ data: { ok: false, error: "unsupported_domain" }, error: null });
    expect(await markRoomReadAtomicAuto(sb, { viewerId: "u", roomId: "r", readThroughMessageId: null })).toEqual({ kind: "unsupported" });
  });
  it("함수 없음(DB 적용 전) → missing(지금 3번 경로)", async () => {
    for (const error of [
      { code: "PGRST202", message: "Could not find the function public.dibay_mark_room_read_atomic_auto" },
      { code: "42883", message: "function dibay_mark_room_read_atomic_auto(uuid, uuid, uuid) does not exist" },
    ]) {
      const { sb } = sbReturning({ data: null, error });
      expect(await markRoomReadAtomicAuto(sb, { viewerId: "u", roomId: "r", readThroughMessageId: null })).toEqual({ kind: "missing" });
    }
  });
  it("그 밖의 거절·오류는 기존처럼 ok:false", async () => {
    const { sb } = sbReturning({ data: { ok: false, error: "forbidden" }, error: null });
    expect(await markRoomReadAtomicAuto(sb, { viewerId: "u", roomId: "r", readThroughMessageId: "m" })).toEqual({
      kind: "done",
      result: { ok: false, error: "forbidden" },
    });
  });
});

describe("DB 함수 키 형식 = 서버 키 형식", () => {
  const sql = readFileSync(`${process.cwd()}/supabase/migrations/20271122100000_dibay_mark_room_read_atomic_auto.sql`, "utf8");
  it("열기: cm_mark_read:<사용자>:<방>:open:<끝 메시지|empty>", () => {
    expect(buildCmMarkReadIdempotencyKey({ userId: "U", roomId: "R", openTail: true, requestedLastReadMessageId: "", tipMessageId: "" })).toBe(
      "cm_mark_read:U:R:open:empty"
    );
    expect(sql).toContain("'cm_mark_read:' || p_viewer_id::text || ':' || p_room_id::text || ':open:' || coalesce(nullif(v_tip, ''), 'empty')");
  });
  it("커서: cm_mark_read:<사용자>:<방>:<메시지 id>", () => {
    expect(buildCmMarkReadIdempotencyKey({ userId: "U", roomId: "R", openTail: false, requestedLastReadMessageId: "M", tipMessageId: "" })).toBe(
      "cm_mark_read:U:R:M"
    );
    expect(sql).toContain("'cm_mark_read:' || p_viewer_id::text || ':' || p_room_id::text || ':' || p_read_through_message_id::text");
  });
  it("끝 메시지 조건이 서버 조회와 같다(삭제 안 됨 · created_at desc, id desc)", () => {
    expect(sql).toContain("m.room_id = p_room_id and m.deleted_at is null");
    expect(sql).toContain("order by m.created_at desc, m.id desc");
    expect(sql).toContain("v_domain not in ('general_direct', 'group', 'trade')");
    expect(sql).toContain("grant execute on function public.dibay_mark_room_read_atomic_auto(uuid, uuid, uuid) to service_role");
  });
});

describe("서버 읽음 경로", () => {
  const src = readFileSync(`${process.cwd()}/lib/community-messenger/service.ts`, "utf8");
  it("새 함수 먼저 · missing 일 때만 방 조회·끝 메시지 조회", () => {
    const i = src.indexOf("const auto = await markRoomReadAtomicAuto(");
    const j = src.indexOf('} else if (auto.kind === "missing") {');
    const k = src.indexOf("await loadRoomDomainForUnreadAuthority(sb as any, roomId)");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(j);
  });
});
