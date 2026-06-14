import { afterEach, describe, expect, it, vi } from "vitest";
import { OAUTH_PROVIDER_PANEL_MS } from "@/lib/auth/oauth/oauth-provider-panel.client";

describe("OAuthProviderLoginPanel contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses 440ms panel duration aligned with main shell", () => {
    expect(OAUTH_PROVIDER_PANEL_MS).toBe(440);
  });
});
