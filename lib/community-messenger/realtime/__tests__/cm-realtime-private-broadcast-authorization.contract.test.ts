import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { tradePostListingBroadcastChannelName } from "@/lib/trade/trade-post-listing-broadcast-channel";

const MIGRATION =
  "supabase/migrations/20270422120000_cm_realtime_private_broadcast_authorization.sql";

describe("cm realtime private broadcast authorization contract", () => {
  it("migration creates internal helpers and calls public.cm_can_access_messenger_room", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(sql).toContain("create schema if not exists internal");
    expect(sql).toContain("public.cm_can_access_messenger_room");
    expect(sql).not.toMatch(/internal\.cm_can_access_messenger_room/);
    expect(sql).toContain("cm_realtime_private_broadcast_select");
    expect(sql).toContain("cm_realtime_private_broadcast_insert");
    expect(sql).toContain("to authenticated");
    expect(sql).toMatch(/Allow public access to channels.*DISABLED/i);
  });

  it("migration authorizes trade typing/presence/listing topics via public trade helpers", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(sql).toContain("public.trade_can_access_trade_chat_room");
    expect(sql).toContain("public.trade_can_access_post_listing_broadcast");
    expect(sql).toContain("trade-chat-typing:%");
    expect(sql).toContain("trade-chat-presence:%");
    expect(sql).toContain("samarket:trade-post-listing:%");
    expect(sql).toMatch(/when p_topic like 'trade-chat-typing:%'[\s\S]*trade_can_access_trade_chat_room/);
    expect(sql).toMatch(
      /when p_topic like 'samarket:trade-post-listing:%'[\s\S]*trade_can_access_post_listing_broadcast/
    );
    const tradeFn = sql.slice(
      sql.indexOf("create or replace function public.trade_can_access_trade_chat_room"),
      sql.indexOf("create or replace function public.trade_can_access_post_listing_broadcast")
    );
    expect(tradeFn).not.toMatch(/cm_can_access_messenger_room\s*\(/);
  });

  it("web channel options force private:true", () => {
    const opts = messengerPrivateBroadcastChannelOptions({ ack: false });
    expect(opts.config.private).toBe(true);
  });

  it("Android upgrade RT join uses private true constant (source)", () => {
    const java = readFileSync(
      join(
        process.cwd(),
        "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallUpgradeRealtimeClient.java"
      ),
      "utf8"
    );
    expect(java).toContain("BROADCAST_CHANNEL_PRIVATE = true");
    expect(java).toContain('config.put("private", BROADCAST_CHANNEL_PRIVATE)');
    expect(java).not.toContain('config.put("private", false)');
  });

  it("trade typing/presence/listing clients use private channel options (source)", () => {
    const typing = readFileSync(join(process.cwd(), "lib/chats/use-trade-chat-room-typing.ts"), "utf8");
    const presence = readFileSync(join(process.cwd(), "lib/chats/use-trade-chat-room-presence.ts"), "utf8");
    const listingClient = readFileSync(
      join(process.cwd(), "lib/chats/use-trade-post-listing-broadcast.ts"),
      "utf8"
    );
    const listingServer = readFileSync(
      join(process.cwd(), "lib/trade/trade-post-listing-broadcast-server.ts"),
      "utf8"
    );
    expect(typing).toContain("messengerPrivateBroadcastChannelOptions");
    expect(typing).not.toMatch(/channel\([^)]*\{\s*config:\s*\{\s*broadcast/);
    expect(presence).toContain("channelOptions: messengerPrivateBroadcastChannelOptions");
    expect(listingClient).toContain("channelOptions: messengerPrivateBroadcastChannelOptions");
    expect(listingServer).toContain("publishMessengerPrivateBroadcastFromServer");
    expect(listingServer).not.toContain("getSupabaseServer");
    expect(listingServer).not.toContain("waitForChannelSubscribed");
    expect(tradePostListingBroadcastChannelName("9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8")).toBe(
      "samarket:trade-post-listing:9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8"
    );
  });
});
