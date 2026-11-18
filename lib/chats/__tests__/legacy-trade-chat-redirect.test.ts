/**
 * 레거시 거래 채팅 리다이렉트·메신저 홈 「거래 보기」 → 정규 메신저 방 id (2026-11-18).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viewer = { id: null as string | null };
const sbHolder = { sb: null as unknown };

vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => viewer.id,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => sbHolder.sb,
}));

import { resolveLegacyTradeChatRedirectHref } from "@/lib/chats/legacy-trade-chat-redirect-server";
import { resolveLegacyPurchaseDetailRedirectHref } from "@/lib/mypage/legacy-purchase-detail-redirect-server";

type Rows = Record<string, Array<Record<string, unknown>>>;
function fakeSb(tables: Rows) {
  function from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    let lim = Infinity;
    const run = () =>
      (tables[table] ?? [])
        .filter((row) =>
          filters.every(([op, col, val]) =>
            op === "eq" ? row[col] === val : op === "in" ? (val as unknown[]).includes(row[col]) : true
          )
        )
        .slice(0, lim);
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
    };
    return q;
  }
  return { from };
}

const CR = "11111111-1111-4111-8111-111111111111";
const PC = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const SELLER = "44444444-4444-4444-8444-444444444444";
const BUYER = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
const CM = "77777777-7777-4777-8777-777777777777";

const tables: Rows = {
  chat_rooms: [
    { id: CR, room_type: "item_trade", item_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: CM },
  ],
  product_chats: [{ id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: CM }],
  community_messenger_rooms: [{ id: CM, chat_domain: "trade", direct_key: `trade_item:${CR}`, room_type: "direct" }],
};

describe("resolveLegacyTradeChatRedirectHref", () => {
  beforeEach(() => {
    viewer.id = null;
    sbHolder.sb = fakeSb(tables);
  });

  it("판매자·구매자면 chat_rooms·product_chats id 모두 정규 메신저 방으로", async () => {
    viewer.id = BUYER;
    expect(await resolveLegacyTradeChatRedirectHref(CR, "chat_room")).toBe(`/community-messenger/rooms/${CM}?cm_list=trade`);
    viewer.id = SELLER;
    expect(await resolveLegacyTradeChatRedirectHref(PC, "product_chat")).toBe(`/community-messenger/rooms/${CM}?cm_list=trade`);
  });

  it("비로그인·비참여자·서버 설정 없음·이미 메신저 방 id 면 기존 경로", async () => {
    expect(await resolveLegacyTradeChatRedirectHref(CR, "chat_room")).toBe(
      `/community-messenger/rooms/${CR}?source=chat_room&cm_list=trade`
    );
    viewer.id = OTHER;
    expect(await resolveLegacyTradeChatRedirectHref(PC, null)).toBe(`/community-messenger/rooms/${PC}?cm_list=trade`);
    viewer.id = BUYER;
    expect(await resolveLegacyTradeChatRedirectHref(CM, null)).toBe(`/community-messenger/rooms/${CM}?cm_list=trade`);
    sbHolder.sb = null;
    expect(await resolveLegacyTradeChatRedirectHref(PC, "product_chat")).toBe(
      `/community-messenger/rooms/${PC}?source=product_chat&cm_list=trade`
    );
  });

  it("레거시 구매 상세도 같은 함수 — 결과 동일(#448 동작 유지)", async () => {
    viewer.id = BUYER;
    expect(await resolveLegacyPurchaseDetailRedirectHref(PC)).toBe(`/community-messenger/rooms/${CM}?cm_list=trade`);
    viewer.id = OTHER;
    expect(await resolveLegacyPurchaseDetailRedirectHref(PC)).toBe(
      `/community-messenger/rooms/${PC}?source=product_chat&cm_list=trade`
    );
    expect(await resolveLegacyPurchaseDetailRedirectHref("not a uuid/../x")).toBe("/community-messenger/trade-chats");
  });
});

describe("배선", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("거래 허브 방·compose?roomId 리다이렉트가 공용 해석을 거친다", () => {
    for (const p of ["app/(main)/mypage/trade/chat/[roomId]/page.tsx", "app/(main)/mypage/trade/chat/compose/page.tsx"]) {
      const src = read(p);
      expect(src).toContain("await resolveLegacyTradeChatRedirectHref(roomId, ");
      expect(src).not.toContain("tradeHubChatRoomHref(roomId");
    }
  });

  it("메신저 홈 「거래 보기」 — 거래 방은 행의 메신저 방 id 로 연다", () => {
    const src = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(src).toMatch(
      /if \(communityMessengerRoomIsTrade\(room\) && room\.id\?\.trim\(\)\) \{\s*router\.push\(\s*communityMessengerRoomHref\(room\.id, readMessengerEntryOriginFromLocation\(\), "trade"\)/
    );
  });
});
