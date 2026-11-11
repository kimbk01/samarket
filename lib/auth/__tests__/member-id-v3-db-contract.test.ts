import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 회원 아이디 v3 1단계 DB 계약 — docs/audit/member-id-base-id-audit-design-2026-11-11.md §3·§4 */
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20271111160000_member_id_v3_state_search_qr.sql"),
  "utf8",
);

/** 설계안 §3.2 확정 단어 78개 */
const DESIGN_WORDS =
  "ace ant arc art awe bag bat bay bee bud bun bus cab cap car cat cub cup day den dew emu fan fun gem gum gym ham hat hen hue hug hut jam jar jay jet jug key map mat nap net new nut pad pan pea pen pet pup ram ray red rug run rye sap saw sea sky spa sub sum sun tag tan tea tub tug van vet wax way web yak yam yes".split(
    " ",
  );

function migrationWords(): string[] {
  const block = sql.slice(sql.indexOf("INSERT INTO public.dibay_id_wordlist"), sql.indexOf("ON CONFLICT (word) DO NOTHING"));
  return [...block.matchAll(/\('([a-z]+)'\)/g)].map((m) => m[1]!);
}

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$function$;", start);
  return sql.slice(start, end);
}

describe("member id v3 DB contract", () => {
  it("word list = design 78 words, 3 lowercase letters, no i/l/o, unique", () => {
    const words = migrationWords();
    expect(words).toEqual(DESIGN_WORDS);
    expect(words).toHaveLength(78);
    expect(new Set(words).size).toBe(78);
    for (const w of words) {
      expect(w).toMatch(/^[a-z]{3}$/);
      expect(w).not.toMatch(/[ilo]/);
    }
    expect(sql).toContain("CHECK (word ~ '^[a-z]{3}$' AND word !~ '[ilo]')");
  });

  it("auto id = 5 digits + word, issued only when the member has no id", () => {
    const fn = functionBody("assign_auto_dibay_id");
    expect(fn).toContain("lpad(floor(random() * 100000)::int::text, 5, '0') || v_word");
    expect(fn).toContain("v_max_attempts constant int := 48");
    expect(fn).toMatch(/IF v_row\.dibay_id IS NOT NULL AND btrim\(v_row\.dibay_id\) <> '' THEN\s+RETURN/);
    expect(fn).toContain("p.dibay_id_initial_key = v_candidate");
    expect(fn).toContain("lower(btrim(p.username)) = v_candidate");
  });

  it("5 digits + 3 letters is reserved for the system in member and admin changes", () => {
    const reserved = "'^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7}|[0-9]{5}[a-z]{3})$'";
    expect(functionBody("confirm_dibay_id")).toContain(reserved);
    expect(functionBody("admin_set_dibay_id")).toContain(reserved);
  });

  it("base id is immutable and unique, and blocks other members from taking it", () => {
    expect(sql).toContain("RAISE EXCEPTION 'dibay_id_initial_immutable'");
    expect(sql).toContain("BEFORE UPDATE OF dibay_id_initial ON public.profiles");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS profiles_dibay_id_initial_key_unique_idx");
    const cand = functionBody("dibay_id_candidate_error");
    expect(cand).toContain("p.dibay_id_initial_key = v_key");
    expect(cand).toContain("lower(btrim(p.dibay_id_initial)) = lower(btrim(p_normalized))");
  });

  it("state and change right are single DB judgments (generated columns)", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS dibay_id_state text");
    expect(sql).toContain("lower(btrim(dibay_id)) ~ '^[0-9]{5}[a-z]{3}$' THEN 'auto'");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS dibay_id_can_change boolean");
    expect(functionBody("admin_grant_dibay_id_change")).toContain("IF v_row.dibay_id_can_change THEN");
  });

  it("member search rules: auto by 5 digits, legacy exact only, custom 4+ chars, base id never used", () => {
    const fn = functionBody("cm_search_members");
    expect(fn).toContain("cand.cstate = 'auto' AND v_key ~ '^[0-9]{5}$' AND left(cand.ckey, 5) = v_key THEN 1");
    expect(fn).toContain("cand.cstate = 'custom' AND char_length(v_key) >= 4");
    expect(fn).not.toContain("dibay_id_initial");
    expect(fn).toContain("p.deleted_at IS NULL");
    expect(fn).toContain("s.allow_id_search = false");
    expect(fn).toContain("r.relation_type = 'blocked'");
  });

  it("QR add makes both friend rows in one function and records source qr", () => {
    const fn = functionBody("cm_add_friend_via_qr");
    expect(fn).toContain("pg_advisory_xact_lock");
    expect(fn).toContain("RETURN jsonb_build_object('ok', false, 'error', 'blocked_target')");
    expect(fn).toContain("s.allow_qr_add = false");
    expect(fn.match(/INSERT INTO public\.user_social_relations/g)).toHaveLength(2);
    expect(fn).toContain("'accepted', '', v_now, 'qr'");
  });

  it("every new function is service_role only", () => {
    for (const sig of [
      "admin_grant_dibay_id_change(uuid, uuid, text)",
      "cm_search_members(uuid, text, integer)",
      "cm_add_friend_via_qr(uuid, text)",
      "member_friend_qr_ensure(uuid)",
      "member_friend_qr_regenerate(uuid)",
      "member_friend_qr_resolve(text)",
      "member_friend_qr_new_token()",
      "dibay_id_candidate_error(uuid, text)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`);
    }
  });
});
