import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markAuthBootstrapInitialSessionDone,
  resetAuthBootstrapStateForTests,
} from "@/lib/auth/auth-bootstrap-state";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import type { Profile } from "@/lib/types/profile";
import {
  peekClientMembershipStateForTests,
  publishMembershipFromReconcile,
  resetClientMembershipStoreForTests,
} from "@/hooks/use-client-membership-state";
import { resolveClientMembership } from "@/lib/auth/resolve-client-profile-session";
import { resetGuestAuthStateForTests } from "@/lib/auth/guest-auth-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(() => null),
}));

const memberProfile: Profile = {
  id: "user-1",
  email: "u@example.com",
  nickname: "u",
  avatar_url: null,
  temperature: 50,
  auth_provider: null,
};

describe("membership bootstrap recovery", () => {
  beforeEach(() => {
    resetClientMembershipStoreForTests();
    resetGuestAuthStateForTests();
    resetAuthBootstrapStateForTests();
    setSupabaseProfileCache(null);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetClientMembershipStoreForTests();
    resetGuestAuthStateForTests();
    resetAuthBootstrapStateForTests();
    setSupabaseProfileCache(null);
    vi.restoreAllMocks();
  });

  it("publishMembershipFromReconcile publishes member from profile cache immediately", () => {
    vi.mocked(getCurrentUser).mockReturnValue(memberProfile);
    publishMembershipFromReconcile("test");
    const state = peekClientMembershipStateForTests();
    expect(state.status).toBe("member");
    if (state.status === "member") {
      expect(state.profile.id).toBe("user-1");
    }
  });

  it("resolveClientMembership returns pending before bootstrap completes", async () => {
    const result = await resolveClientMembership("bootstrap-pending-test");
    expect(result.status).toBe("pending");
  });

  it("resolveClientMembership skips guest shortcut before bootstrap completes", async () => {
    markAuthBootstrapInitialSessionDone(false);
    resetGuestAuthStateForTests();
    const { establishGuestAuthState } = await import("@/lib/auth/guest-auth-state");
    establishGuestAuthState("test");
    resetAuthBootstrapStateForTests();
    const result = await resolveClientMembership("bootstrap-guest-shortcut-test");
    expect(result.status).toBe("pending");
  });
});
