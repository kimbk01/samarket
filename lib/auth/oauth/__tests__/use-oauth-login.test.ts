import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchOAuthPendingClear,
  getOAuthPendingSnapshotForTests,
  OAUTH_PENDING_CLEAR_EVENT,
  OAUTH_PENDING_TIMEOUT_MS,
  resolveOAuthPendingAfterClear,
  setOAuthPendingForTests,
} from "@/lib/auth/oauth/use-oauth-login";

describe("useOAuthLogin pending helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setOAuthPendingForTests(null);
  });

  it("clears any provider for appUrlOpen/exchange/timeout events", () => {
    expect(resolveOAuthPendingAfterClear("google", "app_url_open")).toBeNull();
    expect(resolveOAuthPendingAfterClear("kakao", "exchange_success")).toBeNull();
    expect(resolveOAuthPendingAfterClear("apple", "timeout")).toBeNull();
  });

  it("uses a 30 second pending timeout", () => {
    expect(OAUTH_PENDING_TIMEOUT_MS).toBe(30_000);
  });

  it("dispatches the shared pending clear event", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, CustomEvent });

    dispatchOAuthPendingClear("app_url_open");

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(OAUTH_PENDING_CLEAR_EVENT);
    expect(event.detail).toEqual({ reason: "app_url_open" });
  });

  it("shares one pending provider store", () => {
    setOAuthPendingForTests("google");
    expect(getOAuthPendingSnapshotForTests()).toBe("google");
    setOAuthPendingForTests(null);
    expect(getOAuthPendingSnapshotForTests()).toBeNull();
  });
});
