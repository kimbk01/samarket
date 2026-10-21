import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deliverNativeOAuthReturnUrl,
  OAUTH_COMPLETING_EVENT,
  resetNativeOAuthReturnBridgeForTests,
} from "@/lib/auth/oauth/native-oauth-return-bridge";

/** 성공 복귀 시 로그인 폼을 다시 띄우지 않고 "로그인 중" 상태 유지 (깜빡임 방지) */
describe("native OAuth return — completing vs pending clear", () => {
  afterEach(() => {
    resetNativeOAuthReturnBridgeForTests();
    vi.unstubAllGlobals();
  });

  function stubWindow() {
    const events: string[] = [];
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { replace },
      dispatchEvent: (e: Event) => {
        events.push(e.type);
        return true;
      },
    });
    vi.stubGlobal("CustomEvent", class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    });
    return { events, replace };
  }

  it("code 복귀 → completing 이벤트만, pending clear 없음, /auth/callback 이동", () => {
    const { events, replace } = stubWindow();
    const r = deliverNativeOAuthReturnUrl("dibay://auth/callback?code=abc", "app_url_open");
    expect(r.ok).toBe(true);
    expect(events).toContain(OAUTH_COMPLETING_EVENT);
    expect(events).not.toContain("dibay:oauth-pending-clear");
    expect(replace).toHaveBeenCalledWith("/auth/callback?code=abc");
  });

  it("error 복귀 → pending clear (폼 복귀)", () => {
    const { events } = stubWindow();
    deliverNativeOAuthReturnUrl("dibay://auth/callback?error=access_denied", "app_url_open");
    expect(events).toContain("dibay:oauth-pending-clear");
    expect(events).not.toContain(OAUTH_COMPLETING_EVENT);
  });
});
