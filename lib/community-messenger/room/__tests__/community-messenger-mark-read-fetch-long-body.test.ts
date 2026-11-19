/**
 * 2026-11-19 결함 재현 — 거래·주문 채팅 「모두 읽음」 「일부 채팅을 읽음으로 바꾸지 못했어요」.
 * Xiaomi zxzx11 (1.2.7 (79)) 10:12 PHT: 고객 주문 채팅 44방 — 서버(운영 DB)는 44방 모두 읽음, 화면은 실패.
 * 성공 응답의 `badgeAck.explainMatrix` 에 안 읽은 방 ID 목록이 들어가 2048자를 넘으면
 * 예전 해석(2048자 미리보기를 JSON.parse)이 깨져 `ok` 가 없어지고 클라가 실패로 보고 숫자를 되돌렸다.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBadgeExplainMatrix } from "@/lib/notifications/badge-explain-matrix";
import {
  COMMUNITY_MESSENGER_MARK_READ_PREVIEW_MAX,
  parseCommunityMessengerMarkReadResponse,
} from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";

function okResponseWithUnreadCustomerRooms(n: number): Response {
  const explainMatrix = buildBadgeExplainMatrix({
    generalDirectRoomIds: [randomUUID()],
    groupRoomIds: [],
    tradeRoomIds: [],
    customerOrderRoomIds: Array.from({ length: n }, () => randomUUID()),
    ownerOrderRoomIds: [],
    orphanMissedCallCount: 0,
  });
  const body = {
    ok: true,
    lastReadAt: "2026-11-19T02:12:35.386Z",
    lastReadMessageId: randomUUID(),
    roomReadFollowUp: "skip",
    badgeAck: { authority: "domain_badge", explainMatrix },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("mark_read 응답 해석 — 본문 전체", () => {
  it("2048자를 넘는 성공 응답(안 읽은 주문 채팅 44방)도 ok:true · badgeAck 를 그대로 읽는다", async () => {
    const res = okResponseWithUnreadCustomerRooms(44);
    const parsed = await parseCommunityMessengerMarkReadResponse(res);
    expect(parsed.okHttp).toBe(true);
    expect(parsed.json.ok).toBe(true);
    expect(parsed.json.roomReadFollowUp).toBe("skip");
    expect(parsed.json.badgeAck?.authority).toBe("domain_badge");
    /** 로그용 미리보기만 자른다 */
    expect(parsed.rawPreview.length).toBe(COMMUNITY_MESSENGER_MARK_READ_PREVIEW_MAX + 1);
  });

  it("짧은 성공 응답은 미리보기도 원문 그대로", async () => {
    const parsed = await parseCommunityMessengerMarkReadResponse(
      new Response(JSON.stringify({ ok: true, lastReadMessageId: null }), { status: 200 })
    );
    expect(parsed.json.ok).toBe(true);
    expect(parsed.rawPreview).toBe('{"ok":true,"lastReadMessageId":null}');
  });

  it("실패 응답은 실패 그대로", async () => {
    const parsed = await parseCommunityMessengerMarkReadResponse(
      new Response(JSON.stringify({ ok: false, error: "room_read_failed" }), { status: 400 })
    );
    expect(parsed.okHttp).toBe(false);
    expect(parsed.json.ok).toBe(false);
  });
});
