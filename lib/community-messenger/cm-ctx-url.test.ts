import { describe, expect, it } from "vitest";
import {
  buildCommunityMessengerRoomUrlWithContext,
  decodeCommunityMessengerRoomCmCtx,
  encodeCommunityMessengerRoomCmCtx,
} from "@/lib/community-messenger/cm-ctx-url";

describe("cm_ctx url", () => {
  it("encode + decode round-trips", () => {
    const meta = {
      v: 1 as const,
      kind: "trade" as const,
      headline: "한글 제목",
      priceLabel: "₱99",
      stepLabel: "결제",
    };
    const enc = encodeCommunityMessengerRoomCmCtx(meta);
    expect(decodeCommunityMessengerRoomCmCtx(enc)).toEqual(meta);
  });

  it("buildCommunityMessengerRoomUrlWithContext parses back", () => {
    const meta = { v: 1 as const, kind: "delivery" as const, headline: "배달" };
    const url = buildCommunityMessengerRoomUrlWithContext("room-uuid-1", meta);
    const u = new URL(url, "https://example.com");
    const raw = u.searchParams.get("cm_ctx");
    expect(raw).toBeTruthy();
    expect(decodeCommunityMessengerRoomCmCtx(raw!)).toEqual(meta);
  });
});
