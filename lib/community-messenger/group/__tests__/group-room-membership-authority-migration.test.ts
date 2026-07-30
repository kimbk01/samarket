import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261010120000_cm_group_membership_authority.sql"
);

describe("cm group membership authority migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("defines privileged update/insert guards and leave RPC", () => {
    expect(sql).toContain("cm_participants_guard_privileged_update");
    expect(sql).toContain("cm_participants_guard_privileged_insert");
    expect(sql).toContain("cm_participants_role_requires_server");
    expect(sql).toContain("cm_participants_leave_requires_server");
    expect(sql).toContain("community_messenger_leave_private_group");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.community_messenger_leave_private_group(uuid, uuid) TO service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.community_messenger_leave_private_group(uuid, uuid) FROM anon, authenticated");
  });

  it("enforces one active owner unique index with duplicate preflight", () => {
    expect(sql).toContain("community_messenger_participants_one_active_owner_uidx");
    expect(sql).toContain("cm_group_active_owner_duplicate");
    expect(sql).toMatch(/WHERE role = 'owner' AND left_at IS NULL/);
  });

  it("leave RPC orders successor by joined_at then user_id", () => {
    expect(sql).toContain("ORDER BY p.joined_at ASC NULLS LAST, p.user_id ASC");
    expect(sql).toContain("SET left_at = v_now");
    expect(sql).toContain("role = 'member'");
  });

  it("active admin helper ignores left participants", () => {
    expect(sql).toContain("AND p.left_at IS NULL");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cm_is_room_admin");
  });
});
