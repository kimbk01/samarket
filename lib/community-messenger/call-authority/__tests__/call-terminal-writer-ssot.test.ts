import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CALL_STALE_CANDIDATE_DETECT_RPC,
  CALL_TERMINAL_SESSION_WRITER,
  CALL_TERMINAL_STALE_CLEANUP_PATH,
} from "@/lib/community-messenger/call-authority/call-terminal-writer-authority";

const ROOT = join(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("CUT1 terminal writer SSOT", () => {
  it("exports single session terminal writer token", () => {
    expect(CALL_TERMINAL_SESSION_WRITER).toBe("updateCommunityMessengerCallSession");
    expect(CALL_TERMINAL_STALE_CLEANUP_PATH).toBe(
      "/api/community-messenger/calls/sessions/stale-cleanup",
    );
    expect(CALL_STALE_CANDIDATE_DETECT_RPC).toBe("cleanup_stale_community_messenger_call_sessions");
  });

  it("stale cleanup ends only via updateCommunityMessengerCallSession + both-stale", () => {
    const cleanup = read("lib/community-messenger/call-session-heartbeat.ts");
    expect(cleanup).toContain("updateCommunityMessengerCallSession");
    expect(cleanup).toContain("canEndActiveCallForPresenceStale");
    expect(cleanup).toContain("CALL_SERVER_HEARTBEAT_ENDED_REASON");
    expect(cleanup).not.toContain("isCallSessionOneSidedHeartbeatStale");
  });

  it("session updater uses status CAS for first-valid terminal wins", () => {
    const service = read("lib/community-messenger/service.ts");
    expect(service).toContain("export async function updateCommunityMessengerCallSession");
    // CAS: re-assert current status on terminal/accept writes
    expect(service).toMatch(/updateBuilder\s*=\s*updateBuilder\.eq\("status",\s*currentStatus\)/);
  });

  it("CUT1 migration is detect-only both-stale AND and unschedules mutating cron", () => {
    const cut1 = read("supabase/migrations/20261210120000_cm_call_terminal_writer_ssot_cut1.sql");
    expect(cut1).toContain("DO NOT mutate");
    expect(cut1).toMatch(/caller_last_heartbeat_at < stale_cutoff\s*\n\s*AND callee_last_heartbeat_at < stale_cutoff/);
    expect(cut1).not.toMatch(/SET\s+status\s*=\s*'ended'/i);
    expect(cut1).not.toMatch(/ended_reason\s*=\s*'heartbeat_timeout'/i);
    expect(cut1).toContain("unschedule");
    expect(cut1).toContain("cleanup_stale_cm_call_sessions");
  });

  it("no later migration reintroduces SQL terminal UPDATE on cleanup_stale function", () => {
    const dir = join(ROOT, "supabase/migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && f >= "20261210120000_cm_call_terminal_writer_ssot_cut1.sql")
      .sort();
    for (const file of files) {
      const body = readFileSync(join(dir, file), "utf8");
      if (!body.includes("cleanup_stale_community_messenger_call_sessions")) continue;
      expect(body, file).not.toMatch(/SET\s+status\s*=\s*'ended'/i);
      expect(body, file).not.toMatch(/ended_reason\s*=\s*'heartbeat_timeout'/i);
    }
  });

  it("vercel cron owns app stale-cleanup path", () => {
    const vercel = read("vercel.json");
    expect(vercel).toContain(CALL_TERMINAL_STALE_CLEANUP_PATH);
    const route = read("app/api/community-messenger/calls/sessions/stale-cleanup/route.ts");
    expect(route).toContain("cleanupStaleActiveCommunityMessengerCallSessions");
  });

  it("catchup script matches CUT1 detect-only contract", () => {
    const catchup = read("supabase/scripts/p4-call-heartbeat-catchup.sql");
    expect(catchup).toContain("CUT1");
    expect(catchup).not.toMatch(/SET\s+status\s*=\s*'ended'/i);
    expect(catchup).toMatch(
      /caller_last_heartbeat_at < stale_cutoff\s*\n\s*AND callee_last_heartbeat_at < stale_cutoff/,
    );
  });
});
