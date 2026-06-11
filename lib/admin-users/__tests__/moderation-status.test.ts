import { describe, expect, it } from "vitest";
import { mapProfileStatusToModeration, moderationActionToProfilePatch } from "@/lib/admin-users/moderation-status";

describe("mapProfileStatusToModeration", () => {
  it("maps verified_user to normal", () => {
    expect(mapProfileStatusToModeration("verified_user", null, false)).toBe("normal");
  });

  it("maps suspended status", () => {
    expect(mapProfileStatusToModeration("suspended", null, false)).toBe("suspended");
  });

  it("maps deleted_at to banned", () => {
    expect(mapProfileStatusToModeration("verified_user", "2026-01-01T00:00:00Z", false)).toBe("banned");
  });

  it("maps recent warn flag", () => {
    expect(mapProfileStatusToModeration("verified_user", null, true)).toBe("warned");
  });
});

describe("moderationActionToProfilePatch", () => {
  it("returns null for warn", () => {
    expect(moderationActionToProfilePatch("warn")).toBeNull();
  });

  it("returns suspended patch", () => {
    expect(moderationActionToProfilePatch("suspend")).toEqual({ status: "suspended" });
  });

  it("clears deleted_at on restore", () => {
    expect(moderationActionToProfilePatch("restore")).toMatchObject({
      status: "verified_user",
      deleted_at: null,
    });
  });
});
