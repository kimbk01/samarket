import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIG = (name: string) => readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");

describe("2027-05-05 messenger DB parity migrations (A-3 / C-9 / C-6)", () => {
  it("A-3 removes only the legacy friendships branch from following_blocked, guarded by live hashes", () => {
    const sql = MIG("20270505120000_cm_full_snapshot_following_blocked_ssot_parity.sql");
    expect(sql).toContain("md5(v_old) <> 'c54f986680b580c0813d8d0afacd3c0c'");
    expect(sql).toContain("md5(v_new) <> '5f437ce297f1643b6c7c8f1f1fa304c0'");
    expect(sql).toContain("FROM public.community_messenger_friendships f");
    expect(sql).toContain("SELECT sr.target_user_id AS blocked_id");
    // 데이터 무변경
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT)\s+(FROM|INTO\s+)?public\./i);
  });

  it("C-9 after RPC excludes deleted rows and keeps the cursor semantics", () => {
    const sql = MIG("20270505121000_cm_room_messages_after_exclude_deleted.sql");
    expect(sql).toContain("and m.deleted_at is null");
    expect(sql).toContain("STABLE SECURITY DEFINER");
    expect(sql).toContain("limit least(greatest(coalesce(p_limit, 50), 1), 100)");
    expect(sql).toMatch(/\(\s*m\.created_at,\s*m\.id\s*\)\s*>/);
  });

  it("C-6 canonical unread counts system rows only for store_order / trade rooms", () => {
    const sql = MIG("20270505122000_cm_canonical_unread_exclude_non_counting_system.sql");
    expect(sql).toContain("r.chat_domain IN ('store_order', 'trade')");
    expect(sql).toContain("(v_count_system OR m.message_type IS DISTINCT FROM 'system')");
    // 기존 조건 유지
    expect(sql).toContain("m.deleted_at IS NULL");
    expect(sql).toContain("m.sender_id IS DISTINCT FROM p_viewer_id");
    expect(sql).toContain("g.rejoined_at IS NOT NULL");
  });
});
