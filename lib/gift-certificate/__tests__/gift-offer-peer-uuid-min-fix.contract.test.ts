import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FIX_ID = "20270118120000_gift_certificate_offer_peer_uuid_min_fix";

describe("gift_certificate_offer peer uuid min fix", () => {
  it("migration replaces min(uuid) with uuid-safe peer select", () => {
    const path = resolve(process.cwd(), `supabase/migrations/${FIX_ID}.sql`);
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.gift_certificate_offer");
    expect(sql).not.toMatch(/min\(\s*p\.user_id\s*\)/);
    expect(sql).toContain("ORDER BY p.user_id::text");
    expect(sql).toContain("LIMIT 1");
  });
});
