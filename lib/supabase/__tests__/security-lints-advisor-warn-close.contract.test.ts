import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION =
  "supabase/migrations/20270426120000_security_lints_advisor_warn_close.sql";

describe("security_lints_advisor_warn_close contract", () => {
  const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("locks service-role-only claim + terminal helpers (PUBLIC+anon+authenticated revoke)", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_notification_push_handoff(text[], integer, text, integer)"
    );
    expect(sql).toMatch(
      /claim_notification_push_handoff[\s\S]*?FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_notification_push_handoff[\s\S]*?TO service_role/
    );

    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.cm_store_order_room_is_terminal(uuid)"
    );
    expect(sql).toMatch(
      /cm_store_order_room_is_terminal[\s\S]*?FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.cm_store_order_room_is_terminal\(uuid\)\s+TO service_role;/
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.cm_store_order_room_is_terminal\(uuid\)\s+TO authenticated/
    );
  });

  it("closes anon EXECUTE on Realtime can_access helpers while keeping authenticated", () => {
    const helpers = [
      "trade_can_access_trade_chat_room",
      "trade_can_access_post_listing_broadcast",
      "trade_can_access_integrated_chat_room",
      "group_can_access_group_chat_room",
      "support_can_access_support_case",
      "store_can_access_store_realtime",
      "store_can_access_order_delivery_realtime",
    ] as const;

    for (const name of helpers) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(uuid)`);
      expect(sql).toMatch(
        new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.${name}\\(uuid\\)\\s+FROM anon;`
        )
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\(uuid\\)\\s+TO authenticated, service_role;`
        )
      );
    }
  });

  it("pins internal topic UUID parser search_path and revokes PUBLIC/anon", () => {
    expect(sql).toMatch(
      /ALTER FUNCTION internal\.cm_realtime_topic_suffix_uuid\(text, text\)\s+SET search_path TO '';/
    );
    expect(sql).toMatch(
      /ALTER FUNCTION internal\.cm_realtime_topic_first_uuid_after\(text, text\)\s+SET search_path TO '';/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION internal\.cm_realtime_topic_suffix_uuid\(text, text\)\s+FROM PUBLIC, anon;/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION internal\.cm_realtime_topic_first_uuid_after\(text, text\)\s+FROM PUBLIC, anon;/
    );
  });

  it("does not flip SECURITY mode or replace Realtime authorization bodies", () => {
    expect(sql).not.toMatch(/SECURITY\s+INVOKER/i);
    expect(sql).not.toMatch(/create or replace function public\.trade_can_access_/i);
    expect(sql).not.toMatch(/create or replace function public\.claim_notification_push_handoff/i);
    expect(sql).toMatch(/Dashboard only/i);
  });
});
