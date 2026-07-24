import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bumpChatRoomTargetFromMessengerParticipant,
  bumpNotificationTarget,
} from "@/lib/notifications/notification-targets";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20261008120000_notification_targets_domain_snapshot.sql"
);

/** Append-only idempotency migration (Boot/IO Authority) — supersedes the void RPC body. */
const IDEMPOTENT_MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20261009120000_notification_targets_idempotent_bump.sql"
);

describe("upsert_notification_target_unread Domain snapshot RPC contract", () => {
  it("migration drops 6-arg overload and creates 7-arg with p_room_id", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb)"
    );
    expect(sql).toContain("p_room_id uuid DEFAULT NULL");
    expect(sql).toContain("community_messenger_rooms");
    expect(sql).toContain("domain_identity_key");
    expect(sql).toMatch(/chat_domain IS NULL\s+AND domain_identity_key IS NULL/);
    expect(sql).toContain("notification_target_domain_mismatch");
    expect(sql).not.toMatch(/DEFAULT\s+'general_direct'/i);
    expect(sql).not.toMatch(/infer.*domain|peer pair/i);
  });

  it("migration ADD COLUMN IF NOT EXISTS for repo/prod parity", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS chat_domain text NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS domain_identity_key text NULL");
  });
});

describe("upsert_notification_target_unread idempotency (append-only)", () => {
  it("recreates the 7-arg function as RETURNS boolean", () => {
    const sql = readFileSync(IDEMPOTENT_MIGRATION, "utf8");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid)"
    );
    expect(sql).toMatch(/RETURNS boolean/);
  });

  it("skips the physical UPDATE when the row is already unread and nothing changes", () => {
    const sql = readFileSync(IDEMPOTENT_MIGRATION, "utf8");
    // guard reads existing unread/scope/store and returns false before UPDATE
    expect(sql).toContain("v_existing_unread");
    expect(sql).toMatch(/v_existing_unread IS TRUE/);
    expect(sql).toMatch(/RETURN false;/);
    // domain fill + mismatch log preserved (LOCK: meaning unchanged)
    expect(sql).toContain("notification_target_domain_mismatch");
    expect(sql).toMatch(/chat_domain IS NULL\s+AND domain_identity_key IS NULL/);
    expect(sql).not.toMatch(/DEFAULT\s+'general_direct'/i);
  });

  it("does not edit the frozen 20261008120000 migration body", () => {
    const frozen = readFileSync(MIGRATION, "utf8");
    // frozen file still declares the original void signature
    expect(frozen).toMatch(/RETURNS void/);
  });
});

describe("bumpNotificationTarget passes p_room_id", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockSb() {
    return {
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient<any>;
  }

  it("forwards roomId to RPC", async () => {
    const sb = mockSb();
    await bumpNotificationTarget(sb, {
      userId: "u1",
      targetType: "trade",
      targetId: "post:seller:buyer",
      roomId: " room-uuid ",
    });
    expect(sb.rpc).toHaveBeenCalledWith(
      "upsert_notification_target_unread",
      expect.objectContaining({
        p_user_id: "u1",
        p_target_type: "trade",
        p_target_id: "post:seller:buyer",
        p_room_id: "room-uuid",
      })
    );
  });

  it("chat_room participant bump always includes roomId", async () => {
    const sb = mockSb();
    await bumpChatRoomTargetFromMessengerParticipant(sb, {
      userId: "u1",
      roomId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(sb.rpc).toHaveBeenCalledWith(
      "upsert_notification_target_unread",
      expect.objectContaining({
        p_target_type: "chat_room",
        p_target_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        p_room_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      })
    );
  });

  it("omits domain invent — null roomId stays null", async () => {
    const sb = mockSb();
    await bumpNotificationTarget(sb, {
      userId: "u1",
      targetType: "store_review",
      targetId: "rev-1",
    });
    expect(sb.rpc).toHaveBeenCalledWith(
      "upsert_notification_target_unread",
      expect.objectContaining({ p_room_id: null })
    );
  });
});
