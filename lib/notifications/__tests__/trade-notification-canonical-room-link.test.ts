/**
 * 거래 상태 알림 → 정규 메신저 방 id (2026-11-18 Owner 승인 A).
 * - 가격 제안 수락: 저장된 메신저 방 링크를 meta.chat_room_id(chat_rooms.id)로 덮어쓰지 않는다.
 * - 관리자 구매 확정·가격 제안 수락 생성: FK·ensure 가 비면 같은 해석기 → 실패 때만 레거시 id.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapNotificationEventToInboxRow } from "@/lib/notifications/inbox-events-merge";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { resolveNotificationInboxHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveTradeNotificationMessengerRoomId } from "@/lib/notifications/trade-notification-room-id-server";

const CR = "11111111-1111-4111-8111-111111111111";
const PC = "22222222-2222-4222-8222-222222222222";
const CM = "77777777-7777-4777-8777-777777777777";

function offerAcceptedEvent(routeUrl: string | null) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    user_id: "55555555-5555-4555-8555-555555555555",
    type: "trade_status",
    category: "trade",
    room_id: null,
    title: "t",
    body: "b",
    unread: true,
    read_at: null,
    created_at: "2026-11-18T00:00:00Z",
    dedupe_key: "x",
    display_payload: {
      ...(routeUrl ? { routeUrl } : {}),
      legacyNotificationType: "status",
      legacyMeta: {
        kind: "trade_offer",
        event: "offer_accepted",
        product_id: "product-1",
        chat_room_id: CR,
        room_id: CR,
        room_source: "chat_room",
      },
    },
  };
}

describe("가격 제안 수락 알림 탭 목적지 (종·목록·상세·배너 공통)", () => {
  it("저장된 메신저 방 링크를 그대로 쓴다 (chat_rooms id 로 바꾸지 않음)", () => {
    const link = `/community-messenger/rooms/${CM}?source=chat_room&cm_list=trade`;
    const row = mapNotificationEventToInboxRow(offerAcceptedEvent(link) as never);
    expect(resolveNotificationDestination({ inboxRow: row as never }).href).toBe(link);
  });

  it("메신저 방 링크가 없을 때만 meta.chat_room_id 로 만든다", () => {
    expect(
      resolveNotificationInboxHref({
        notification_type: "status",
        link_url: null,
        meta: { kind: "trade_offer", event: "offer_accepted", chat_room_id: CR, room_source: "chat_room" },
      })
    ).toBe(`/community-messenger/rooms/${CR}?source=chat_room&cm_list=trade`);
    expect(
      resolveNotificationInboxHref({
        notification_type: "status",
        link_url: `/post/product-1`,
        meta: { kind: "trade_offer", event: "offer_accepted", chat_room_id: CR, room_source: "chat_room" },
      })
    ).toBe(`/community-messenger/rooms/${CR}?source=chat_room&cm_list=trade`);
  });

  it("외부 주소·다른 경로는 메신저 방 링크로 보지 않는다", () => {
    for (const link of [
      `https://evil.example/community-messenger/rooms/${CM}`,
      `//evil.example/community-messenger/rooms/${CM}`,
      `/community-messenger/rooms/${CM}/info`,
    ]) {
      expect(
        resolveNotificationInboxHref({
          notification_type: "status",
          link_url: link,
          meta: { kind: "trade_offer", event: "offer_accepted", chat_room_id: CR, room_source: "chat_room" },
        })
      ).toBe(`/community-messenger/rooms/${CR}?source=chat_room&cm_list=trade`);
    }
  });
});

type Rows = Record<string, Array<Record<string, unknown>>>;
function fakeSb(tables: Rows) {
  const calls: string[] = [];
  function from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    let lim = Infinity;
    const run = () => {
      calls.push(table);
      return (tables[table] ?? [])
        .filter((row) =>
          filters.every(([op, col, val]) =>
            op === "eq" ? row[col] === val : op === "in" ? (val as unknown[]).includes(row[col]) : true
          )
        )
        .slice(0, lim);
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push(["eq", col, val]), q),
      in: (col: string, val: unknown[]) => (filters.push(["in", col, val]), q),
      order: () => q,
      limit: (n: number) => ((lim = n), q),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: run(), error: null }),
      update: () => {
        throw new Error("write_not_allowed");
      },
      insert: () => {
        throw new Error("write_not_allowed");
      },
    };
    return q;
  }
  return { sb: { from } as never, calls };
}

describe("resolveTradeNotificationMessengerRoomId", () => {
  it("이미 아는 메신저 방 id 는 조회 없이 그대로", async () => {
    const { sb, calls } = fakeSb({});
    expect(await resolveTradeNotificationMessengerRoomId(sb, ` ${CM} `, PC)).toBe(CM);
    expect(calls).toHaveLength(0);
  });

  it("모르면 같은 해석기로 정규 방 id (trade_pc direct_key)", async () => {
    const { sb } = fakeSb({
      product_chats: [{ id: PC, post_id: "item", seller_id: "s", buyer_id: "b", community_messenger_room_id: null }],
      community_messenger_rooms: [{ id: CM, chat_domain: "trade", direct_key: `trade_pc:${PC}`, room_type: "direct" }],
    });
    expect(await resolveTradeNotificationMessengerRoomId(sb, null, PC)).toBe(CM);
  });

  it("해석 실패면 레거시 id 그대로", async () => {
    const { sb } = fakeSb({});
    expect(await resolveTradeNotificationMessengerRoomId(sb, "", PC)).toBe(PC);
  });
});

describe("알림 생성처 배선", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("관리자 구매 확정 알림이 해석기를 거친다", () => {
    const src = read("app/api/admin/trade-flow/confirm-buyer/route.ts");
    expect(src).toContain("await resolveTradeNotificationMessengerRoomId(");
    expect(src).not.toContain(".trim() || roomId,");
  });
});
