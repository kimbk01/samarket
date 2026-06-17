import { describe, expect, it } from "vitest";
import { buildCallPeerDisplayLabel } from "@/lib/community-messenger/call-history/call-peer-display-label";

describe("buildCallPeerDisplayLabel", () => {
  it("formats nickname and public id", () => {
    expect(buildCallPeerDisplayLabel({ peerLabel: "누나", peerPublicId: "noona_id" })).toBe("누나 (@noona_id)");
  });

  it("returns nickname only when id matches display", () => {
    expect(buildCallPeerDisplayLabel({ peerLabel: "noona_id", peerPublicId: "noona_id" })).toBe("noona_id");
  });

  it("falls back to @id when nickname missing", () => {
    expect(buildCallPeerDisplayLabel({ peerLabel: "", peerPublicId: "dibay_user" })).toBe("@dibay_user");
  });
});
