import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOAuthPending,
  confirmOAuthPendingLaunched,
  ensureOAuthPendingLifecycleListeners,
  getOAuthPendingProvider,
  notifyOAuthAppUrlOpenReceived,
  OAUTH_PENDING_RETURN_TIMEOUT_NATIVE_MS,
  OAUTH_PENDING_RETURN_TIMEOUT_WEB_MS,
  resetOAuthPendingLifecycleForTests,
  setOAuthPending,
} from "@/lib/auth/oauth-pending-lifecycle";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
}));

function stubDocumentVisibility(state: DocumentVisibilityState): void {
  vi.stubGlobal("document", {
    visibilityState: state,
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (event === "visibilitychange") {
        stubDocumentVisibility._handler = handler;
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      if (event.type === "visibilitychange") {
        stubDocumentVisibility._handler?.();
      }
      return true;
    }),
  });
}
stubDocumentVisibility._handler = null as (() => void) | null;

describe("oauth-pending-lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetOAuthPendingLifecycleForTests();
    stubDocumentVisibility("visible");
    ensureOAuthPendingLifecycleListeners();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetOAuthPendingLifecycleForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sets and clears pending on appUrlOpen", () => {
    setOAuthPending("google");
    expect(getOAuthPendingProvider()).toBe("google");

    notifyOAuthAppUrlOpenReceived("dibay://auth/callback?provider=google");
    expect(getOAuthPendingProvider()).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[oauth] pending_clear_app_url_open",
      expect.objectContaining({ provider: "google" }),
    );
  });

  it("clears pending on launch failure reason", () => {
    setOAuthPending("kakao");
    clearOAuthPending("launch_failed");
    expect(getOAuthPendingProvider()).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[oauth] pending_clear_launch_failed",
      expect.objectContaining({ provider: "kakao" }),
    );
  });

  it("clears pending after return timeout once launch is confirmed", async () => {
    const { isCapacitorNativePlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);

    setOAuthPending("apple");
    confirmOAuthPendingLaunched();

    vi.advanceTimersByTime(OAUTH_PENDING_RETURN_TIMEOUT_NATIVE_MS);
    expect(getOAuthPendingProvider()).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[oauth] pending_clear_timeout",
      expect.objectContaining({ provider: "apple" }),
    );
  });

  it("uses web timeout when not native", async () => {
    const { isCapacitorNativePlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);

    setOAuthPending("google");
    confirmOAuthPendingLaunched();

    vi.advanceTimersByTime(OAUTH_PENDING_RETURN_TIMEOUT_WEB_MS);
    expect(getOAuthPendingProvider()).toBeNull();
  });

  it("clears pending on foreground return after launch without appUrlOpen", () => {
    setOAuthPending("google");
    confirmOAuthPendingLaunched();

    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(300);
    expect(getOAuthPendingProvider()).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[oauth] pending_clear_cancel_or_foreground",
      expect.objectContaining({ provider: "google" }),
    );
  });

  it("does not clear on foreground when appUrlOpen already received", () => {
    setOAuthPending("google");
    confirmOAuthPendingLaunched();
    notifyOAuthAppUrlOpenReceived("dibay://auth/callback?provider=google");
    expect(getOAuthPendingProvider()).toBeNull();

    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(300);
    expect(getOAuthPendingProvider()).toBeNull();
  });
});
