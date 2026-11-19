import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { partitionMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";
import { partitionTradeStoreOrderUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";
import {
  memberUnreadRoomInputsToLoaderInput,
  stableFactsKey,
  type MemberUnreadRoomInputRow,
} from "@/lib/notifications/member-unread-room-inputs";

/** D2 2단계 2-a·2-b — 쓰기 시점 입력 표 → 기존 판정 함수에 같은 입력 */
const U = "11111111-1111-1111-1111-111111111111";
const row = (p: Partial<MemberUnreadRoomInputRow>): MemberUnreadRoomInputRow => ({
  user_id: U,
  room_id: "r",
  unread_count: 1,
  chat_domain: "general_direct",
  domain_identity_key: null,
  room_deleted: false,
  last_message_has_content: true,
  order_id: null,
  order_buyer_user_id: null,
  order_store_id: null,
  store_owner_user_id: null,
  ...p,
});

const rows: MemberUnreadRoomInputRow[] = [
  row({ room_id: "gd1", domain_identity_key: "general_direct:a:b", unread_count: 3 }),
  row({ room_id: "g1", chat_domain: "group", domain_identity_key: "group:g1" }),
  row({ room_id: "empty", last_message_has_content: false }),
  row({ room_id: "del", room_deleted: true }),
  row({ room_id: "t1", chat_domain: "trade", domain_identity_key: "trade_pc:p1" }),
  row({ room_id: "so1", chat_domain: "store_order", domain_identity_key: "store_order:o1", order_id: "o1", order_buyer_user_id: U, order_store_id: "s1", store_owner_user_id: "owner" }),
  row({ room_id: "so2", chat_domain: "store_order", domain_identity_key: "store_order:o2", order_id: "o2", order_buyer_user_id: "buyer", order_store_id: "s2", store_owner_user_id: U, unread_count: 5 }),
  row({ room_id: "so3", chat_domain: "store_order", domain_identity_key: "store_order:o3", order_id: "o3" }),
];

describe("입력 표 → 기존 로더 입력", () => {
  it("DB 로더가 읽는 것과 같은 입력이면 판정 결과가 같다", () => {
    const { loaded, orderMaps } = memberUnreadRoomInputsToLoaderInput(rows);
    if (!loaded.ok) throw new Error("unexpected");
    // DB 로더가 읽었을 원래 입력(같은 행): 삭제·빈 메시지는 원문 그대로
    const dbParts = rows.map((r) => ({ room_id: r.room_id, unread_count: r.unread_count, left_at: null }));
    const dbRooms = rows.map((r) => ({
      id: r.room_id,
      chat_domain: r.chat_domain,
      deleted_at: r.room_deleted ? "2026-11-19T00:00:00Z" : null,
      last_message: r.last_message_has_content ? "  hello " : " \u3000 ",
      domain_identity_key: r.domain_identity_key,
    }));
    const viaTable = partitionMessengerUnreadRoomFactsFromParticipants(loaded.parts as never, loaded.rooms as never);
    const viaDb = partitionMessengerUnreadRoomFactsFromParticipants(dbParts as never, dbRooms as never);
    expect(stableFactsKey(viaTable)).toBe(stableFactsKey(viaDb));

    const tradeRooms = (r: Array<{ chat_domain: unknown }>) => r.filter((x) => ["trade", "store_order"].includes(String(x.chat_domain)));
    const tTable = partitionTradeStoreOrderUnreadRoomFactsFromParticipants({
      userId: U, parts: loaded.parts as never, rooms: tradeRooms(loaded.rooms as never) as never, ...orderMaps,
    });
    const tDb = partitionTradeStoreOrderUnreadRoomFactsFromParticipants({
      userId: U, parts: dbParts as never, rooms: tradeRooms(dbRooms) as never,
      orderBuyerById: { o1: U, o2: "buyer" }, orderStoreById: { o1: "s1", o2: "s2" }, storeOwnerById: { s1: "owner", s2: U },
    });
    expect(stableFactsKey(tTable)).toBe(stableFactsKey(tDb));
    expect(tTable.storeOrderBuyerDeliveryUnread).toBe(1);
    expect(tTable.storeOrderOwnerChatUnread).toBe(1);
  });

  it("주문이 없는 행(o3)은 지도에 키를 만들지 않는다 — 기존 조회와 같음", () => {
    const { orderMaps } = memberUnreadRoomInputsToLoaderInput(rows);
    expect(orderMaps.orderBuyerById.o3).toBeUndefined();
  });
});

describe("계약", () => {
  it("배지 계산은 표본에서만 비교하고 응답 뒤 실행", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"), "utf8");
    expect(src).toContain('console.warn("[unread-inputs-shadow]"');
    expect(src).toMatch(/if \(unreadFacts\.viaInputs && Math\.random\(\) < resolveMemberBadgeCounterShadowRate\(\)\) \{\s*keepAliveAfterResponse\(/);
  });

  it("2-c: 입력 표 1회 → 같은 로더, 실패하면 이전 경로(participants·rooms)", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"), "utf8");
    expect(src).toContain("const inputRows = await loadMemberUnreadRoomInputs(sb, uid);");
    expect(src).toContain("loadTradeStoreOrderUnreadRoomFactsFromParticipants(sb, uid, loaded, orderMaps)");
    expect(src).toMatch(/if \(inputRows\) \{[\s\S]*?\}\s*\/\*\* S2[\s\S]*?const unreadParticipantRoomRows = loadUnreadParticipantRoomRows\(sb, uid\);/);
  });

  it("마이그레이션: 메시지마다 숫자만 바꾸는 빠른 경로 · service_role 전용 · 매장 주인 변경 반영", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20271119200000_member_unread_room_inputs.sql"), "utf8");
    expect(sql).toContain("set unread_count = new.unread_count, updated_at = now()");
    expect(sql).toContain("grant execute on function public.get_member_unread_room_inputs(uuid) to service_role;");
    expect(sql).toContain("after update of owner_user_id on public.stores");
    expect(sql).not.toMatch(/to (anon|authenticated)\b/);
  });
});
