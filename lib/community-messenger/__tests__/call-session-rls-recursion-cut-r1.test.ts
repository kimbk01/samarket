/**
 * Static contract: CUT-R1 call session RLS recursion migration must break the cycle.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = resolve(
  process.cwd(),
  "supabase/migrations/20261215120000_cm_call_session_rls_recursion_cut_r1.sql",
);

describe("CUT-R1 call session RLS recursion migration", () => {
  const sql = readFileSync(FILE, "utf8");

  it("adds SECURITY DEFINER helpers with locked search_path", () => {
    expect(sql).toContain("cm_is_call_session_participant");
    expect(sql).toContain("cm_is_call_session_initiator");
    expect(sql).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = public/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cm_is_call_session_participant(uuid) TO authenticated, service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cm_is_call_session_initiator(uuid) TO authenticated, service_role");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.cm_is_call_session_participant(uuid) FROM anon");
  });

  it("rewrites both policies without open-access policy body", () => {
    expect(sql).toContain("community_messenger_call_sessions_member_policy");
    expect(sql).toContain("community_messenger_call_session_participants_member_policy");
    const withoutComments = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(withoutComments.toUpperCase()).not.toContain("DISABLE ROW LEVEL SECURITY");
  });

  it("sessions policy uses participant helper; participants policy uses initiator+participant helpers", () => {
    const sessionsBlock = sql.slice(
      sql.indexOf("ON public.community_messenger_call_sessions"),
      sql.indexOf("ON public.community_messenger_call_session_participants"),
    );
    const participantsBlock = sql.slice(sql.indexOf("ON public.community_messenger_call_session_participants"));
    expect(sessionsBlock).toContain("cm_is_call_session_participant(id)");
    expect(sessionsBlock).not.toMatch(/FROM public\.community_messenger_call_session_participants/);
    expect(participantsBlock).toContain("cm_is_call_session_initiator(session_id)");
    expect(participantsBlock).toContain("cm_is_call_session_participant(session_id)");
    expect(participantsBlock).not.toMatch(/FROM public\.community_messenger_call_sessions s/);
  });
});
