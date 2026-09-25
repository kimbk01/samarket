/**
 * FD1 contract: columns/ops expected by user-session-registry writers
 * must match restore migration 20270120130000.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20270120130000_restore_user_sessions_session_registry.sql"
);

const REQUIRED_COLUMNS = [
  "id",
  "user_id",
  "session_id",
  "device_info",
  "login_identifier",
  "device_key",
  "browser_key",
  "ip_address",
  "active",
  "last_seen_at",
  "invalidated_at",
  "invalidation_reason",
  "created_at",
] as const;

describe("FD1 user_sessions restore migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("creates user_sessions with registry columns + UNIQUE session_id", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.user_sessions/i);
    expect(sql).toMatch(/session_id text NOT NULL UNIQUE/i);
    for (const col of REQUIRED_COLUMNS) {
      expect(sql).toContain(col);
    }
  });

  it("enables FORCE RLS and denies anon/authenticated client grants", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.user_sessions FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.user_sessions TO service_role/i);
  });

  it("does not execute DROP/RENAME of unrelated tables", () => {
    const withoutComments = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(withoutComments).not.toMatch(/DROP\s+TABLE/i);
    expect(withoutComments).not.toMatch(/RENAME\s+TO/i);
  });
});
