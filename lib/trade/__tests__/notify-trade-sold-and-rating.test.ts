import { beforeEach, describe, expect, it, vi } from "vitest";

const append = vi.fn(async () => undefined);
const ratingCtx = vi.fn();

vi.mock("@/lib/notifications/append-user-notification", () => ({ appendUserNotification: append }));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "en"),
}));
vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(async () => new Map([["seller-1", "Kim"]])),
}));
vi.mock("@/lib/trade/trade-rating", () => ({ loadTradeRatingContext: ratingCtx }));

const { notifyTradeSoldToEligibleCounterparts, notifyTradeRatingReceived } = await import(
  "../notify-trade-sold-and-rating.server"
);

function fakeSb(rows: unknown[] | unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.limit = async () => ({ data: rows, error: null });
  chain.maybeSingle = async () => ({ data: rows, error: null });
  return { from: () => chain } as never;
}

const rooms = [
  { id: "pc-1", seller_id: "seller-1", buyer_id: "buyer-ok", community_messenger_room_id: "cm-1" },
  { id: "pc-2", seller_id: "seller-1", buyer_id: "buyer-short", community_messenger_room_id: "cm-2" },
  { id: "pc-3", seller_id: "seller-1", buyer_id: "buyer-noroom", community_messenger_room_id: null },
  { id: "pc-4", seller_id: "seller-1", buyer_id: "seller-1", community_messenger_room_id: "cm-4" },
];

describe("감사 P3 ① 판매완료 알림", () => {
  beforeEach(() => {
    append.mockClear();
    ratingCtx.mockReset();
    ratingCtx.mockImplementation(async (_sb: unknown, chatId: string) => ({
      eligibility: { eligible: chatId === "pc-1" },
    }));
  });

  it("평가 자격이 되는 대화 상대에게만 보낸다 (대화 부족·방 없음·판매자 본인 제외)", async () => {
    const sent = await notifyTradeSoldToEligibleCounterparts(fakeSb(rooms), {
      postId: "post-1",
      sellerUserId: "seller-1",
      postTitle: "Bike",
    });
    expect(sent).toBe(1);
    expect(append).toHaveBeenCalledTimes(1);
    const row = (append.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(row.user_id).toBe("buyer-ok");
    expect(row.push_kind).toBe("trade");
    expect(row.dedupe_key).toBe("trade-sold:post-1:buyer-ok");
    expect(String(row.body)).toContain("Bike");
    expect(String(row.link_url)).toContain("cm-1");
  });

  it("한 사람 실패가 다른 사람 알림을 막지 않는다", async () => {
    ratingCtx.mockImplementation(async (_sb: unknown, chatId: string) => {
      if (chatId === "pc-1") throw new Error("boom");
      return { eligibility: { eligible: true } };
    });
    const sent = await notifyTradeSoldToEligibleCounterparts(fakeSb(rooms), {
      postId: "post-1",
      sellerUserId: "seller-1",
      postTitle: null,
    });
    expect(sent).toBe(1);
    expect(((append.mock.calls[0] as unknown[])[1] as Record<string, unknown>).user_id).toBe("buyer-short");
  });
});

describe("감사 P3 ③ 평가 도착 알림", () => {
  beforeEach(() => append.mockClear());

  it("받은 사람에게 평가 내용 없이 보낸다", async () => {
    const ok = await notifyTradeRatingReceived(
      fakeSb({ id: "pc-1", post_id: "post-1", community_messenger_room_id: "cm-1" }),
      { productChatId: "pc-1", reviewerId: "seller-1", revieweeId: "buyer-ok" }
    );
    expect(ok).toBe(true);
    const row = (append.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(row.user_id).toBe("buyer-ok");
    expect(row.dedupe_key).toBe("trade-rating:pc-1:buyer-ok");
    expect(String(row.body)).toContain("Kim");
    expect(JSON.stringify(row.meta)).not.toMatch(/good|bad|normal/);
  });

  it("자기 자신·방 없음이면 보내지 않는다", async () => {
    expect(
      await notifyTradeRatingReceived(fakeSb({ id: "pc-1", post_id: "p", community_messenger_room_id: "cm" }), {
        productChatId: "pc-1",
        reviewerId: "u",
        revieweeId: "u",
      })
    ).toBe(false);
    expect(
      await notifyTradeRatingReceived(fakeSb({ id: "pc-1", post_id: "p", community_messenger_room_id: null }), {
        productChatId: "pc-1",
        reviewerId: "a",
        revieweeId: "b",
      })
    ).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });
});
