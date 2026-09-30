import { describe, expect, it } from "vitest";
import {
  isBlockedMemberAccount,
  isLoginDeniedMemberAccount,
  isProductWriteDeniedMemberAccount,
  isSuspendedMemberAccount,
  isWithdrawnMemberAccount,
  resolveLoginDeniedForMemberAccount,
  resolveMemberAccountLifecycle,
} from "@/lib/auth/member-account-state";

describe("member-account-state P0", () => {
  it("keeps BLOCKED ≠ WITHDRAWN ≠ SUSPENDED", () => {
    const blocked = { status: "blocked", deleted_at: null };
    const suspended = { status: "suspended", deleted_at: null };
    const withdrawn = { status: "deleted", deleted_at: "2026-01-01T00:00:00Z" };

    expect(isBlockedMemberAccount(blocked)).toBe(true);
    expect(isWithdrawnMemberAccount(blocked)).toBe(false);
    expect(isSuspendedMemberAccount(blocked)).toBe(false);

    expect(isSuspendedMemberAccount(suspended)).toBe(true);
    expect(isBlockedMemberAccount(suspended)).toBe(false);
    expect(isWithdrawnMemberAccount(suspended)).toBe(false);

    expect(isWithdrawnMemberAccount(withdrawn)).toBe(true);
    expect(isBlockedMemberAccount(withdrawn)).toBe(false);
    expect(isSuspendedMemberAccount(withdrawn)).toBe(false);
  });

  it("denies login for blocked and withdrawn, allows suspended", () => {
    expect(isLoginDeniedMemberAccount({ status: "blocked", deleted_at: null })).toBe(true);
    expect(isLoginDeniedMemberAccount({ status: "deleted", deleted_at: "2026-01-01T00:00:00Z" })).toBe(
      true
    );
    expect(isLoginDeniedMemberAccount({ status: "suspended", deleted_at: null })).toBe(false);
    expect(isLoginDeniedMemberAccount({ status: "verified_user", deleted_at: null })).toBe(false);

    expect(resolveLoginDeniedForMemberAccount({ status: "blocked" })?.code).toBe("account_blocked");
    expect(resolveLoginDeniedForMemberAccount({ status: "deleted", deleted_at: "x" })?.code).toBe(
      "account_withdrawn"
    );
    expect(resolveLoginDeniedForMemberAccount({ status: "suspended" })).toBeNull();
  });

  it("denies product writes for suspended, blocked, and withdrawn", () => {
    expect(isProductWriteDeniedMemberAccount({ status: "suspended" })).toBe(true);
    expect(isProductWriteDeniedMemberAccount({ status: "blocked" })).toBe(true);
    expect(isProductWriteDeniedMemberAccount({ status: "deleted", deleted_at: "x" })).toBe(true);
    expect(isProductWriteDeniedMemberAccount({ status: "verified_user" })).toBe(false);
  });

  it("resolves lifecycle with withdrawn precedence over status noise", () => {
    expect(resolveMemberAccountLifecycle({ status: "blocked", deleted_at: null })).toBe("blocked");
    expect(resolveMemberAccountLifecycle({ status: "suspended", deleted_at: null })).toBe("suspended");
    expect(
      resolveMemberAccountLifecycle({ status: "verified_user", deleted_at: "2026-01-01T00:00:00Z" })
    ).toBe("withdrawn");
    expect(resolveMemberAccountLifecycle({ status: "verified_user", deleted_at: null })).toBe("active");
  });
});
