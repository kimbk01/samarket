import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("group rejoin leave-interval exclude (Room Unread A/B/C)", () => {
  it("migration opens leave interval and closes on restore without wiping unread", () => {
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20261014124000_dibay_group_rejoin_unread_baseline.sql"),
      "utf8"
    );
    expect(sql).toContain("cm_group_activate_member");
    expect(sql).toContain("community_messenger_membership_leave_intervals");
    expect(sql).toContain("community_messenger_open_leave_interval");
    expect(sql).toContain("room_unread_v1_leave_interval_exclude");
    expect(sql).toContain("SET rejoined_at = v_now");
    expect(sql).toContain("SET\n      left_at = NULL,\n      role = 'member'");
    expect(sql).not.toContain("unread_count = 0");
    expect(sql).not.toContain("last_read_message_id = v_tip_id");
    // restore UPDATE must not rewrite joined_at (insert-of-new-member may set joined_at)
    expect(sql).not.toMatch(/UPDATE public\.community_messenger_participants[\s\S]*?joined_at\s*=/);
  });

  it("canonical excludes closed leave intervals only", () => {
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20261014124000_dibay_group_rejoin_unread_baseline.sql"),
      "utf8"
    );
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.dibay_cm_canonical_unread_count");
    const body = sql.slice(start, start + 2500);
    expect(body).toContain("community_messenger_membership_leave_intervals");
    expect(body).toContain("g.rejoined_at IS NOT NULL");
    expect(body).toContain("m.created_at >= g.left_at");
    expect(body).toContain("m.created_at < g.rejoined_at");
  });

  it("repository reactivates via cm_group_activate_member only", () => {
    const src = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-repository.ts"),
      "utf8"
    );
    expect(src).toContain('rpc("cm_group_activate_member"');
    expect(src).not.toMatch(
      /\.update\(\{\s*left_at:\s*null,\s*role:\s*"member"\s*\}\)/
    );
  });
});
