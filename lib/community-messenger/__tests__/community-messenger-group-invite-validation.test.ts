import { describe, expect, it } from "vitest";
import { validateCommunityMessengerGroupTargets } from "@/lib/community-messenger/service";

describe("validateCommunityMessengerGroupTargets", () => {
  it("returns members_required when no peer ids remain after filtering self", async () => {
    await expect(validateCommunityMessengerGroupTargets("user-a", [])).resolves.toEqual({
      ok: false,
      error: "members_required",
    });
    await expect(validateCommunityMessengerGroupTargets("user-a", ["user-a"])).resolves.toEqual({
      ok: false,
      error: "members_required",
    });
  });

  it("returns invalid_target when target profile is not available", async () => {
    const result = await validateCommunityMessengerGroupTargets("user-a", ["00000000-0000-4000-8000-000000000099"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_target");
    }
  });
});
