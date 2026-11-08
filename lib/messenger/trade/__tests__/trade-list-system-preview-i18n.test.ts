/**
 * 언어 SSOT B3 — 거래 목록 미리보기: 저장 시스템 문장을 종류 코드 메타로 보는 사람 언어로.
 * 메타가 없거나 저장 글자와 맞지 않으면 지금과 같은 저장 글자.
 */
import { describe, expect, it } from "vitest";
import { cmRoomLastMessageMetaFromMessage } from "@/lib/community-messenger/system-message-i18n";
import { translate } from "@/lib/i18n/messages";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { resolveTradeListItemPreview } from "@/lib/messenger/trade/preview";
import { buildTradeListViewModel, buildTradeListViewModelForLanguage } from "@/lib/messenger/trade/row-model";
import { buildTradeListSnapshot, buildTradeIdentity, TRADE_DOMAIN } from "@/lib/messenger/trade";
import type { TradeRoomInput } from "@/lib/messenger/trade/types";

const SELLER = "seller-1";
const BUYER = "buyer-1";
const LISTING_BODY = "제품의 상태가 예약중으로 변경되었습니다.";
const KEYED_BODY = "배달이 완료되었어요.";

function tradeRoom(partial: Partial<TradeRoomInput>): TradeRoomInput {
  return {
    roomId: "r1",
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: buildTradeIdentity({ itemId: "item-a", sellerUserId: SELLER, counterpartyUserId: BUYER })
      .identityKey,
    itemId: "item-a",
    sellerUserId: SELLER,
    counterpartyUserId: BUYER,
    itemTitle: "Item",
    itemImageUrl: null,
    peerDisplayName: "Peer",
    peerAvatarUrl: null,
    lastMessage: "hello",
    lastMessageAt: "2026-07-14T12:00:00.000Z",
    lastMessageIsSystem: false,
    unreadCount: 0,
    tradeStatusLabel: "예약중",
    ...partial,
  };
}

function rowsFor(room: TradeRoomInput) {
  const listed = buildTradeListSnapshot({ viewerUserId: SELLER, generation: "1", rooms: [room] });
  if (!listed.ok) throw new Error(listed.error);
  return listed.snapshot.rows;
}

describe("B3 trade list — stored system preview in viewer language", () => {
  it("listing_change meta → English / Korean key text (row, hub, preview agree)", () => {
    const meta = cmRoomLastMessageMetaFromMessage(LISTING_BODY, {
      domain: "trade",
      kind: "listing_change",
      listingState: "reserved",
    });
    const rows = rowsFor(
      tradeRoom({ lastMessage: LISTING_BODY, lastMessageType: "system", lastMessageIsSystem: true, lastMessageMeta: meta })
    );
    expect(rows[0]!.lastMessageMeta).toEqual(meta);
    const expectedEn = `${translate("en", "trade_listing_change_system_title")} · ${translate("en", "trade_listing_step_reserved")}`;
    const expectedKo = `${translate("ko", "trade_listing_change_system_title")} · ${translate("ko", "trade_listing_step_reserved")}`;
    expect(resolveTradeListItemPreview(rows[0]!, "en").text).toBe(expectedEn);
    expect(resolveTradeListItemPreview(rows[0]!, "ko").text).toBe(expectedKo);
    const vmEn = buildTradeListViewModelForLanguage(rows[0]!, "en");
    expect(vmEn.previewText).toBe(expectedEn);
    expect(vmEn.previewIsSystemEvent).toBe(true);
    expect(buildTradeListViewModelForLanguage(rows[0]!, "ko").previewText).toBe(expectedKo);
    expect(buildTradeHubViewModel(rows, "en").previewText).toBe(expectedEn);
  });

  it("message_key meta → key text in each language", () => {
    const meta = cmRoomLastMessageMetaFromMessage(KEYED_BODY, { message_key: "order_event_delivered" });
    const rows = rowsFor(
      tradeRoom({ lastMessage: KEYED_BODY, lastMessageType: "system", lastMessageIsSystem: true, lastMessageMeta: meta })
    );
    expect(resolveTradeListItemPreview(rows[0]!, "en").text).toBe(translate("en", "order_event_delivered"));
    expect(resolveTradeListItemPreview(rows[0]!, "ko").text).toBe(translate("ko", "order_event_delivered"));
  });

  it("meta absent → same as before (stored text, Korean status normalization kept)", () => {
    const rows = rowsFor(tradeRoom({ lastMessage: LISTING_BODY, lastMessageType: "system", lastMessageIsSystem: true }));
    expect(rows[0]!).not.toHaveProperty("lastMessageMeta");
    expect(resolveTradeListItemPreview(rows[0]!, "en").text).toBe(LISTING_BODY);
    expect(buildTradeListViewModelForLanguage(rows[0]!, "en").previewText).toBe("상태 변경 · 예약중");
    expect(buildTradeListViewModel(rows[0]!).previewText).toBe("상태 변경 · 예약중");
  });

  it("meta text mismatch (stale meta from an older message) → stored text", () => {
    const meta = cmRoomLastMessageMetaFromMessage("다른 메시지", { message_key: "order_event_delivered" });
    const rows = rowsFor(
      tradeRoom({ lastMessage: KEYED_BODY, lastMessageType: "system", lastMessageIsSystem: true, lastMessageMeta: meta })
    );
    expect(resolveTradeListItemPreview(rows[0]!, "en").text).toBe(KEYED_BODY);
  });

  it("non-system message with meta → untouched", () => {
    const meta = cmRoomLastMessageMetaFromMessage("hello", { message_key: "order_event_delivered" });
    const rows = rowsFor(tradeRoom({ lastMessage: "hello", lastMessageType: "text", lastMessageMeta: meta }));
    expect(resolveTradeListItemPreview(rows[0]!, "en").text).toBe("hello");
  });
});
