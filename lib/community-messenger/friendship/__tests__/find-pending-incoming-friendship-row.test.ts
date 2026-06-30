import { describe, expect, it, vi } from "vitest";
import { findPendingIncomingFriendshipRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

describe("findPendingIncomingFriendshipRow", () => {
  it("queries pending row for requester→addressee pair", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "req-1",
        requester_user_id: "aaaaaaaa-1111-1111-1111-111111111111",
        addressee_user_id: "bbbbbbbb-2222-2222-2222-222222222222",
        status: "pending",
        created_at: "2026-06-30T00:00:00.000Z",
        updated_at: "2026-06-30T00:00:00.000Z",
      },
      error: null,
    });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqAddressee = vi.fn(() => ({ eq: eqStatus }));
    const eqRequester = vi.fn(() => ({ eq: eqAddressee }));
    const select = vi.fn(() => ({ eq: eqRequester }));
    const from = vi.fn(() => ({ select }));
    const sb = { from };

    const row = await findPendingIncomingFriendshipRow(
      sb,
      "bbbbbbbb-2222-2222-2222-222222222222",
      "aaaaaaaa-1111-1111-1111-111111111111"
    );

    expect(row?.id).toBe("req-1");
    expect(eqRequester).toHaveBeenCalledWith("requester_user_id", "aaaaaaaa-1111-1111-1111-111111111111");
    expect(eqAddressee).toHaveBeenCalledWith("addressee_user_id", "bbbbbbbb-2222-2222-2222-222222222222");
    expect(eqStatus).toHaveBeenCalledWith("status", "pending");
  });
});
