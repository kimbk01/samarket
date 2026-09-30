import { describe, expect, it } from "vitest";
import { mapProfileStatusToModeration, moderationActionToProfilePatch } from "@/lib/admin-users/moderation-status";
import { memberModerationActionsForStatus } from "@/lib/admin-users/member-moderation-cta";

describe("mapProfileStatusToModeration", () => {
  it("maps verified_user to normal", () => {
    expect(mapProfileStatusToModeration("verified_user", null, false)).toBe("normal");
  });

  it("maps suspended status", () => {
    expect(mapProfileStatusToModeration("suspended", null, false)).toBe("suspended");
  });

  it("maps blocked status independently of deleted_at", () => {
    expect(mapProfileStatusToModeration("blocked", null, false)).toBe("blocked");
  });

  it("maps deleted_at to withdrawn (not blocked)", () => {
    expect(mapProfileStatusToModeration("verified_user", "2026-01-01T00:00:00Z", false)).toBe(
      "withdrawn"
    );
    expect(mapProfileStatusToModeration("deleted", "2026-01-01T00:00:00Z", false)).toBe("withdrawn");
  });

  it("maps recent warn flag", () => {
    expect(mapProfileStatusToModeration("verified_user", null, true)).toBe("warned");
  });
});

describe("moderationActionToProfilePatch", () => {
  it("returns null for warn", () => {
    expect(moderationActionToProfilePatch("warn")).toBeNull();
  });

  it("returns suspended patch without expires_at", () => {
    const patch = moderationActionToProfilePatch("suspend");
    expect(patch).toEqual({ status: "suspended" });
    expect(patch).not.toHaveProperty("expires_at");
  });

  it("ban writes blocked with deleted_at null (not deleted)", () => {
    expect(moderationActionToProfilePatch("ban")).toEqual({
      status: "blocked",
      deleted_at: null,
    });
  });

  it("restore clears deleted_at and returns verified_user", () => {
    expect(moderationActionToProfilePatch("restore")).toMatchObject({
      status: "verified_user",
      deleted_at: null,
    });
  });
});

describe("memberModerationActionsForStatus", () => {
  it("withdrawn has no restore CTA", () => {
    expect(memberModerationActionsForStatus("withdrawn")).toEqual([]);
  });

  it("blocked offers restore only", () => {
    expect(memberModerationActionsForStatus("blocked")).toEqual(["restore"]);
  });

  it("suspended offers restore and ban", () => {
    expect(memberModerationActionsForStatus("suspended")).toEqual(["restore", "ban"]);
  });
});
