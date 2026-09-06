import { describe, expect, it } from "vitest";
import { projectPopupRuntimeDisplay } from "@/lib/admin/ads-exposure/popup-runtime-display";

describe("popup runtime display projection", () => {
  it("separates the current winner from eligible active campaigns", () => {
    const winners = new Set(["winner"]);
    expect(
      projectPopupRuntimeDisplay({
        opsStatus: "live",
        campaignId: "winner",
        winnerIds: winners,
      })
    ).toEqual({ status: "live_now", isRuntimeWinner: true });
    expect(
      projectPopupRuntimeDisplay({
        opsStatus: "live",
        campaignId: "waiting",
        winnerIds: winners,
      })
    ).toEqual({ status: "eligible_waiting", isRuntimeWinner: false });
  });

  it("keeps lifecycle states out of winner semantics", () => {
    expect(
      projectPopupRuntimeDisplay({
        opsStatus: "scheduled",
        campaignId: "scheduled",
        winnerIds: new Set(),
      }).status
    ).toBe("scheduled");
  });
});
