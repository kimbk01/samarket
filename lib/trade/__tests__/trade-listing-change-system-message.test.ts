import { describe, expect, it } from "vitest";
import { formatSellerListingChangeNoticeBody } from "@/lib/chat/postSellerListingChangeNotice";
import {
  buildTradeListingChangeSystemMetadata,
  resolveTradeListingChangeSystemState,
} from "@/lib/trade/trade-listing-change-system-message";

describe("trade listing change system message (SYS-01)", () => {
  it("body no longer embeds a server-formatted timestamp", () => {
    const body = formatSellerListingChangeNoticeBody("예약중");
    expect(body).toBe("제품의 상태가 예약중으로 변경되었습니다.");
    expect(body).not.toContain("\n");
  });

  it("metadata wins over body", () => {
    expect(
      resolveTradeListingChangeSystemState({
        content: "제품의 상태가 예약중으로 변경되었습니다.",
        metadata: buildTradeListingChangeSystemMetadata("completed"),
      })
    ).toBe("completed");
  });

  it("legacy body with baked UTC time still resolves (time line discarded)", () => {
    expect(
      resolveTradeListingChangeSystemState({
        content: "제품의 상태가 예약중으로 변경되었습니다.\n2026. 10. 27. 오전 8:08",
        metadata: {},
      })
    ).toBe("reserved");
    expect(
      resolveTradeListingChangeSystemState({ content: "제품의 상태가 판매중으로 변경되었습니다.", metadata: null })
    ).toBe("inquiry");
    expect(
      resolveTradeListingChangeSystemState({ content: "제품의 상태가 거래완료으로 변경되었습니다.", metadata: null })
    ).toBe("completed");
  });

  it("other system messages are not treated as listing changes", () => {
    expect(resolveTradeListingChangeSystemState({ content: "그룹 권한이 변경되었습니다.", metadata: {} })).toBeNull();
    expect(
      resolveTradeListingChangeSystemState({
        content: "x",
        metadata: { domain: "store_order", kind: "listing_change", listingState: "reserved" },
      })
    ).toBeNull();
  });
});
