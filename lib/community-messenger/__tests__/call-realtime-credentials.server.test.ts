import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  CALL_REALTIME_CREDENTIALS_RATE_LIMIT,
  CALL_REALTIME_CREDENTIALS_RATE_LIMIT_CODE,
  CALL_REALTIME_CREDENTIALS_RATE_LIMIT_KEY_PREFIX,
  REALTIME_CREDENTIAL_TTL_SECONDS,
  computeRealtimeCredentialExpiresAtIso,
  mintCommunityMessengerCallRealtimeCredentials,
} from "@/lib/community-messenger/call-realtime-credentials.server";

describe("call-realtime-credentials.server", () => {
  it("caps expiry at RFC TTL when session expires later", () => {
    const nowMs = Date.parse("2026-07-10T03:00:00.000Z");
    const sessionExpiresAtSeconds = Math.floor(
      (nowMs + REALTIME_CREDENTIAL_TTL_SECONDS * 2 * 1000) / 1000
    );
    expect(
      computeRealtimeCredentialExpiresAtIso({
        sessionExpiresAtSeconds,
        nowMs,
      })
    ).toBe("2026-07-10T03:15:00.000Z");
  });

  it("uses session expiry when sooner than RFC TTL", () => {
    const nowMs = Date.parse("2026-07-10T03:00:00.000Z");
    const sessionExpiresAtSeconds = Math.floor((nowMs + 120_000) / 1000);
    expect(
      computeRealtimeCredentialExpiresAtIso({
        sessionExpiresAtSeconds,
        nowMs,
      })
    ).toBe("2026-07-10T03:02:00.000Z");
  });

  it("matches Agora token rate limit class (45/min)", () => {
    expect(CALL_REALTIME_CREDENTIALS_RATE_LIMIT.limit).toBe(45);
    expect(CALL_REALTIME_CREDENTIALS_RATE_LIMIT.windowMs).toBe(60_000);
    expect(CALL_REALTIME_CREDENTIALS_RATE_LIMIT_KEY_PREFIX).toBe(
      "community-messenger:call-realtime-credentials:"
    );
    expect(CALL_REALTIME_CREDENTIALS_RATE_LIMIT_CODE).toBe(
      "community_messenger_call_realtime_credentials_rate_limited"
    );
  });

  it("mints accessToken and expiresAt without refresh_token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T03:00:00.000Z"));
    const getSession = vi.fn(async () => ({
      data: {
        session: {
          access_token: "supabase-access-token",
          expires_at: Math.floor(Date.parse("2026-07-10T04:00:00.000Z") / 1000),
          refresh_token: "must-not-leak",
        },
      },
      error: null,
    }));
    const supabase = {
      auth: { getSession },
    } as unknown as SupabaseClient;

    const result = await mintCommunityMessengerCallRealtimeCredentials(supabase);
    vi.useRealTimers();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accessToken).toBe("supabase-access-token");
    expect(result.expiresAt).toBe("2026-07-10T03:15:00.000Z");
    expect(result).not.toHaveProperty("refresh_token");
    expect(Object.keys(result).sort()).toEqual(["accessToken", "expiresAt", "ok"]);
  });

  it("returns session_unavailable when supabase client is missing", async () => {
    const result = await mintCommunityMessengerCallRealtimeCredentials(null);
    expect(result).toEqual({ ok: false, error: "session_unavailable" });
  });

  it("returns session_unavailable when access_token is missing", async () => {
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: "", expires_at: null, refresh_token: "x" } },
      error: null,
    }));
    const supabase = {
      auth: { getSession },
    } as unknown as SupabaseClient;

    const result = await mintCommunityMessengerCallRealtimeCredentials(supabase);
    expect(result).toEqual({ ok: false, error: "session_unavailable" });
  });
});
