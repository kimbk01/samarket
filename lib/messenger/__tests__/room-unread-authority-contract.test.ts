import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC,
  DIBAY_MARK_ROOM_READ_ATOMIC_RPC,
  PHASE8B_MARK_READ_QUARANTINED,
  ROOM_UNREAD_AUTHORITY_SQL_MIGRATION,
  ROOM_UNREAD_BADGE_PROJECTION_CUTOVER,
  ROOM_UNREAD_BANNED_PATTERNS,
  ROOM_UNREAD_CURSOR_ORDER,
  ROOM_UNREAD_HEAL_FROZEN,
  ROOM_UNREAD_AUTHORITY_RUNTIME_PASS,
  assertBadgeCutoverBlockedUntilRoomUnreadPass,
  assertRoomUnreadAuthorityNotUsingPhase8BWiring,
  describeCanonicalUnreadFormula,
} from "@/lib/messenger/contracts/room-unread-authority";
import { PHASE8B_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import { D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-read-unread-badge";

const root = process.cwd();

describe("Room Unread Authority v1 contract", () => {
  it("locks cursor ordering without timestamp Authority", () => {
    expect(ROOM_UNREAD_CURSOR_ORDER.primary).toBe("created_at");
    expect(ROOM_UNREAD_CURSOR_ORDER.tieBreak).toBe("id");
    expect(ROOM_UNREAD_CURSOR_ORDER.timestampAuthority).toBe(false);
    expect(describeCanonicalUnreadFormula()).toContain("cursor");
  });

  it("quarantines Phase 8B production wiring", () => {
    expect(PHASE8B_MARK_READ_QUARANTINED).toBe(true);
    expect(PHASE8B_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING).toBe(false);
    assertRoomUnreadAuthorityNotUsingPhase8BWiring(PHASE8B_BADGE_PRODUCTION_WIRING);
  });

  it("blocks badge cutover until Room Unread Runtime PASS", () => {
    expect(ROOM_UNREAD_AUTHORITY_RUNTIME_PASS).toBe(false);
    expect(ROOM_UNREAD_BADGE_PROJECTION_CUTOVER).toBe(false);
    expect(ROOM_UNREAD_HEAL_FROZEN).toBe(true);
    expect(() =>
      assertBadgeCutoverBlockedUntilRoomUnreadPass(false, true)
    ).toThrow(/badge_cutover_requires_room_unread_runtime_pass/);
  });

  it("ships mark-read and append RPCs in migration", () => {
    const mig = readFileSync(join(root, ROOM_UNREAD_AUTHORITY_SQL_MIGRATION), "utf8");
    expect(mig).toContain(`CREATE OR REPLACE FUNCTION public.${DIBAY_MARK_ROOM_READ_ATOMIC_RPC}`);
    expect(mig).toContain(`CREATE OR REPLACE FUNCTION public.${DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC}`);
    expect(mig).toContain("dibay_cm_canonical_unread_count");
    expect(mig).toContain("recipient cursor PRESERVED");
    expect(mig).not.toContain("ELSE null\n    end,\n    last_read_message_id = case\n      when p.user_id = p_sender_id then p_read_at");
  });

  it("apply_unread no longer wipes recipient last_read_at", () => {
    const mig = readFileSync(join(root, ROOM_UNREAD_AUTHORITY_SQL_MIGRATION), "utf8");
    const start = mig.indexOf(
      "CREATE OR REPLACE FUNCTION public.community_messenger_apply_unread_for_text_message"
    );
    const body = mig.slice(start, start + 900);
    expect(body).toContain("ELSE p.last_read_at");
    expect(body).not.toMatch(/ELSE null/i);
  });

  it("send_text patch preserves recipient last_read_at", () => {
    const patch = readFileSync(
      join(root, "supabase/migrations/20261014121000_dibay_room_unread_send_text_cursor_preserve.sql"),
      "utf8"
    );
    const unreadBlock = patch.slice(
      patch.indexOf("UPDATE public.community_messenger_participants p"),
      patch.indexOf("SELECT coalesce(", patch.indexOf("UPDATE public.community_messenger_participants p"))
    );
    expect(unreadBlock).toContain("ELSE p.last_read_at");
    expect(unreadBlock).not.toMatch(/WHEN p\.user_id = p_sender_id THEN p_created_at\s+ELSE NULL/i);
  });

  it("documents banned patterns", () => {
    expect(ROOM_UNREAD_BANNED_PATTERNS.storeOrderPromiseAllRead).toMatch(/Promise\.all/);
    expect(ROOM_UNREAD_BANNED_PATTERNS.recipientCursorNullWipe).toMatch(/last_read_at/);
  });

  it("v1.1 null-sender migrations: optional force_null + system-only harden", () => {
    const v11 = readFileSync(
      join(root, "supabase/migrations/20261014122000_dibay_append_null_sender_system.sql"),
      "utf8"
    );
    const harden = readFileSync(
      join(root, "supabase/migrations/20261014123000_dibay_append_null_sender_system_only.sql"),
      "utf8"
    );
    expect(v11).toContain("p_force_null_message_sender");
    expect(harden).toContain("null_sender_forbidden");
    expect(harden).toContain("v_msg_type IS DISTINCT FROM 'system'");
  });
});
