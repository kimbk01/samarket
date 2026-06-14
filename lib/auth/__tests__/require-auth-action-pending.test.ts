import { describe, expect, it, vi } from "vitest";

const profileCompletionMockState = vi.hoisted(() => ({
  capturedToken: null as string | null,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({
    id: "u1",
    email: "u1@test.local",
    nickname: "nick",
    display_name: "nick",
    avatar_url: null,
    temperature: 50,
    terms_accepted_at: "2026-01-01T00:00:00.000Z",
    terms_version: "2026-04-store-review",
    privacy_accepted_at: "2026-01-01T00:00:00.000Z",
    privacy_version: "2026-04-store-review",
  }),
}));

vi.mock("@/lib/auth/client-signup-gate", () => ({
  isClientSignupComplete: () => true,
}));

vi.mock("@/lib/profile/require-profile-completion.client", () => ({
  requireProfileCompletionClient: (
    _profile: unknown,
    _action: unknown,
    detail: { token?: string }
  ) => {
    profileCompletionMockState.capturedToken = detail.token ?? null;
    return Promise.resolve(false);
  },
}));

import {
  clearPendingAuthActions,
  consumePendingAuthAction,
  dismissPendingAuthAction,
  requireAuthAction,
} from "@/lib/auth/require-auth-action";

describe("dismissPendingAuthAction", () => {
  it("drops pending retry without executing action", async () => {
    clearPendingAuthActions();
    profileCompletionMockState.capturedToken = null;
    const ran = vi.fn();
    const ok = await requireAuthAction("trade_create_item", ran, { next: "/write/trade" });
    expect(ok).toBe(false);
    expect(ran).not.toHaveBeenCalled();
    const token = profileCompletionMockState.capturedToken;
    expect(token).toBeTruthy();
    dismissPendingAuthAction(token);
    const consumed = await consumePendingAuthAction(token);
    expect(consumed).toBe(false);
    expect(ran).not.toHaveBeenCalled();
  });
});
