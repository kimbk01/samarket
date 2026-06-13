import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
}));

import {
  clearOAuthPending,
  confirmOAuthPendingLaunched,
  ensureOAuthPendingListeners,
  getOAuthPendingProvider,
  notifyOAuthAppUrlOpenReceived,
  resetOAuthPendingForTests,
  setOAuthPending,
} from "@/lib/auth/oauth/pending";

describe("oauth pending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetOAuthPendingForTests();
    ensureOAuthPendingListeners();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetOAuthPendingForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sets and clears on appUrlOpen", () => {
    setOAuthPending("google");
    notifyOAuthAppUrlOpenReceived("dibay://auth/callback?provider=google");
    expect(getOAuthPendingProvider()).toBeNull();
  });

  it("clears on launch failure", () => {
    setOAuthPending("kakao");
    clearOAuthPending("launch_failed");
    expect(getOAuthPendingProvider()).toBeNull();
  });

  it("clears after native timeout once launched", () => {
    setOAuthPending("apple");
    confirmOAuthPendingLaunched();
    vi.advanceTimersByTime(60_000);
    expect(getOAuthPendingProvider()).toBeNull();
  });
});
