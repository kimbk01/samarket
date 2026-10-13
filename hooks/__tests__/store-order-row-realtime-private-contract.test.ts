import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract (Public access OFF): the store order detail row channel must join as private AND every
 * topic it can produce must be authorized by internal.cm_realtime_can_read_topic.
 */
const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const HOOK = "hooks/useSupabaseStoreOrderRowRealtime.ts";
const MIGRATION = "supabase/migrations/20270425120000_cm_realtime_store_order_row_private_topics.sql";

describe("store order row Realtime — private join ↔ read policy contract", () => {
  it("joins with private channel options", () => {
    const src = read(HOOK);
    const at = src.indexOf("storeOrderRowRealtimeChannelName({\n            domain,");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 300)).toContain("messengerPrivateBroadcastChannelOptions()");
  });

  for (const prefix of [
    "delivery-customer-order-row-rt:",
    "delivery-owner-order-row-rt:",
    "platform-admin-order-row-rt:",
  ]) {
    it(`${prefix} is authorized by internal.cm_realtime_can_read_topic`, () => {
      expect(read(MIGRATION)).toContain(`when p_topic like '${prefix}%' then`);
    });
  }

  it("migration keeps send policy untouched (SELECT-only change)", () => {
    expect(read(MIGRATION)).not.toContain("cm_realtime_can_send_topic(p_topic text)");
  });
});
