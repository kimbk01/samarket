import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMARKET_REALTIME_TOKEN_REFRESH_EVENT } from "@/lib/supabase/realtime-auth-events";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("T4 TOKEN_REFRESHED realtime recovery", () => {
  it("browser client dispatches channel rebuild after TOKEN_REFRESHED setAuth", () => {
    const src = read("lib/supabase/client.ts");
    expect(src).toContain("dispatchSamarketRealtimeTokenRefreshed");
    expect(src).toMatch(/TOKEN_REFRESHED[\s\S]*dispatchSamarketRealtimeTokenRefreshed/);
    expect(src).toContain("realtime.setAuth");
  });

  it("home, room bundle, and read-ack resubscribe on the token refresh event", () => {
    const home = read("lib/community-messenger/use-community-messenger-realtime.ts");
    const bundle = read("lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts");
    const readAck = read("lib/community-messenger/realtime/cm-read-ack-broadcast-client.ts");
    expect(home).toContain("subscribeSamarketRealtimeTokenRefreshed");
    expect(home).toContain("token_refresh_rebind");
    expect(bundle).toContain("subscribeSamarketRealtimeTokenRefreshed");
    expect(bundle).toContain('lastBoundRoomIdsKey = ""');
    expect(readAck).toContain("subscribeSamarketRealtimeTokenRefreshed");
    expect(readAck).toContain("subscribeReadAckChannel");
  });

  it("token refresh event helpers exist and never log access_token", () => {
    const eventsSrc = read("lib/supabase/realtime-auth-events.ts");
    expect(eventsSrc).toContain("dispatchSamarketRealtimeTokenRefreshed");
    expect(eventsSrc).toContain("subscribeSamarketRealtimeTokenRefreshed");
    expect(eventsSrc).toContain(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT);
    expect(eventsSrc).not.toMatch(/console\.(?:log|info|debug|warn).*access_token/);
  });
});
