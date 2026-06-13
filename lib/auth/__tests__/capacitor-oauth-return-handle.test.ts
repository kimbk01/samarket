import { afterEach, describe, expect, it, vi } from "vitest";

const browserClose = vi.fn(async () => undefined);

vi.mock("@capacitor/browser", () => ({
  Browser: {
    close: () => browserClose(),
  },
}));

import { handleCapacitorOAuthReturnUrl } from "@/lib/auth/capacitor-oauth-return";

describe("capacitor-oauth-return handleCapacitorOAuthReturnUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    browserClose.mockClear();
  });

  it("closes Custom Tab before bridging to WebView callback", async () => {
    const replace = vi.fn();
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { origin: "https://samarket.vercel.app", replace },
      sessionStorage: {
        setItem: (key: string, value: string) => storage.set(key, value),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
      },
    });

    const handled = await handleCapacitorOAuthReturnUrl(
      "dibay://auth/callback?code=abc&provider=google",
    );

    expect(handled).toBe(true);
    expect(browserClose).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "https://samarket.vercel.app/auth/callback?code=abc&provider=google",
    );
    expect(storage.get("dibay_native_oauth_callback_pending")).toBe("1");
    expect(storage.get("dibay_native_oauth_callback_provider")).toBe("google");
  });
});
