/**
 * S-2 H (Owner 2026-11-02) — 1:1 재참가 기록 하한 `cleared_at`. 규칙: created_at > cleared_at 만 보인다
 * (운영 RPC get_community_messenger_room_bootstrap_snapshot 과 동일). 모든 읽기 경로가 같은 함수를 쓰는지 고정한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMessageVisibleUnderHistoryFloor,
  participantHistoryFloorIso,
} from "@/lib/community-messenger/room/message-history-floor";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("history floor rule", () => {
  it("null floor → everything visible", () => {
    expect(participantHistoryFloorIso({ cleared_at: null })).toBeNull();
    expect(isMessageVisibleUnderHistoryFloor("2026-01-01T00:00:00Z", null)).toBe(true);
  });

  it("strictly after the floor only", () => {
    const floor = participantHistoryFloorIso({ cleared_at: "2026-11-02T06:00:00.000Z" });
    expect(isMessageVisibleUnderHistoryFloor("2026-11-02T05:59:59.999Z", floor)).toBe(false);
    expect(isMessageVisibleUnderHistoryFloor("2026-11-02T06:00:00.000Z", floor)).toBe(false);
    expect(isMessageVisibleUnderHistoryFloor("2026-11-02T06:00:00.001Z", floor)).toBe(true);
    expect(isMessageVisibleUnderHistoryFloor(null, floor)).toBe(false);
  });
});

describe("contract — every read path applies the floor", () => {
  const svc = read("lib/community-messenger/service.ts");

  it("floor is set only on rejoin of a general 1:1 that already has messages (1s skew margin)", () => {
    expect(svc).toContain("resolveGeneralDirectRejoinHistoryFloorIso(sb, rid)");
    expect(svc).toContain("for (const row of toInsert) row.cleared_at = rejoinFloorIso;");
    expect(svc).toContain("{ left_at: null, cleared_at: rejoinFloorIso }");
    expect(svc).toContain("new Date(Date.now() - 1000).toISOString()");
  });

  it("snapshot · before · latest · by-id · mutations · voice use the floor", () => {
    expect(svc).toContain("participantHistoryFloorIso(myRow ?? rawParticipantRows.find");
    expect(svc).toContain("applyHistoryFloorToMessageQuery(");
    expect(svc.match(/S-2 H: 내 기록 하한 이전 메시지는 나에게 없다/g)?.length).toBe(5);
    expect(svc).toContain("S-2 H: 기록 하한 이전 음성은 재생 불가");
    expect(svc).toContain("S-2 H: 하한 이전 메시지(답장 이동·링크)는 이 사람에게 없다");
    expect(svc).toContain("assertReplyTargetVisibleToSender(sb, roomId, input.userId, replyToMessageIdOpt)");
    expect(svc.match(/redactReplyQuotesBelowHistoryFloor\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(svc).toContain("roomLastMessageHiddenByFloor");
  });

  it("media route · bump snapshot · leave cleanup", () => {
    expect(read("app/api/community-messenger/rooms/[roomId]/messages/[messageId]/media/route.ts")).toContain(
      "isMessageVisibleUnderHistoryFloor"
    );
    expect(read("lib/community-messenger/server/publish-messenger-room-bump.ts")).toContain("messageSnapshot = null;");
    expect(read("lib/community-messenger/home/messenger-home-room-leave-client.ts")).toContain(
      "void invalidateLocalRoomSnapshot(rid);"
    );
  });

  it("migration covers after-RPC, lite bundle, unread count and RLS", () => {
    const sql = read("supabase/migrations/20271102130000_cm_direct_rejoin_history_floor.sql");
    expect(sql).toContain("FUNCTION public.community_messenger_room_messages_after");
    expect(sql).toContain("FUNCTION public.community_messenger_bootstrap_lite_my_rooms_bundle");
    expect(sql).toContain("(v_cleared_at IS NULL OR m.created_at > v_cleared_at)");
    expect(sql).toContain("ALTER POLICY community_messenger_messages_member_policy");
  });
});
