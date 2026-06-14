import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredLoginRequiredDetail,
  DIBAY_LOGIN_REQUIRED_DISMISS_EVENT,
  DIBAY_LOGIN_REQUIRED_EVENT,
  dismissLoginRequiredSheet,
  getStoredLoginRequiredDetailForTests,
  openLoginRequiredSheet,
  reopenLoginRequiredSheet,
} from "@/lib/auth/require-auth-action";
import {
  handoffOAuthLoginShell,
  restoreOAuthLoginShellAfterFailure,
} from "@/lib/auth/oauth/oauth-login-shell.client";

describe("oauth login shell handoff", () => {
  afterEach(() => {
    clearStoredLoginRequiredDetail();
    vi.unstubAllGlobals();
  });

  it("stores detail on open and restores on reopen", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, CustomEvent });

    openLoginRequiredSheet({
      actionType: "trade_chat",
      next: "/market",
      token: "tok-1",
    });

    expect(getStoredLoginRequiredDetailForTests()).toEqual({
      actionType: "trade_chat",
      next: "/market",
      token: "tok-1",
    });

    reopenLoginRequiredSheet();

    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    const reopenEvent = dispatchEvent.mock.calls[1]?.[0] as CustomEvent;
    expect(reopenEvent.type).toBe(DIBAY_LOGIN_REQUIRED_EVENT);
    expect(reopenEvent.detail).toEqual({
      actionType: "trade_chat",
      next: "/market",
      token: "tok-1",
    });
  });

  it("handoff does not dismiss login sheet (in-app OAuth inline)", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, CustomEvent });

    openLoginRequiredSheet({ actionType: "messenger_open", next: "/community-messenger" });
    handoffOAuthLoginShell();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0]?.[0] as CustomEvent).type).toBe(DIBAY_LOGIN_REQUIRED_EVENT);
    expect(getStoredLoginRequiredDetailForTests()?.actionType).toBe("messenger_open");
  });

  it("restore after failure is no-op (AuthModal stays open)", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, CustomEvent });

    openLoginRequiredSheet({ actionType: "profile_edit" });
    restoreOAuthLoginShellAfterFailure();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("dismiss alone does not clear stored detail", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, CustomEvent });

    openLoginRequiredSheet({ actionType: "profile_edit" });
    dismissLoginRequiredSheet();

    expect(getStoredLoginRequiredDetailForTests()?.actionType).toBe("profile_edit");
    expect((dispatchEvent.mock.calls[1]?.[0] as CustomEvent).type).toBe(DIBAY_LOGIN_REQUIRED_DISMISS_EVENT);
  });
});
