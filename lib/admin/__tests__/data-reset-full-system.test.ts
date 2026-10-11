/**
 * Full data reset system — server-side guards that do not need a database:
 * HMAC action tokens (binding, expiry, replay), legacy one-time token hardening, batched mutation
 * (no 5,000-row false success), migration / manifest invariants.
 * The SQL engine itself is covered by scripts/data-reset-local-test.sh (Postgres) and
 * supabase/tests/data-reset/prod_shape_test.py.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeFullResetActionToken,
  issueFullResetActionToken,
  verifyFullResetActionToken,
} from "@/lib/admin/data-reset/full/action-token";
import { deleteAllRowsInBatches, updateAllRowsInBatches } from "@/lib/admin/data-reset/batch-mutate";
import { issueDataResetOneTimeToken, verifyDataResetOneTimeToken } from "@/lib/admin/data-reset/types";
import { FULL_RESET_MANIFEST } from "@/lib/admin/data-reset/full/manifest";
import { fullResetPhrases } from "@/lib/admin/data-reset/full/service";
import { resolveDataResetExecutionTarget } from "@/lib/admin/data-reset/database-target-guard";

const SECRET = "test-only-data-reset-action-secret-0123456789abcdef";
const env = { DATA_RESET_ACTION_SECRET: SECRET } as NodeJS.ProcessEnv;
const ACTOR = "22222222-2222-4222-8222-222222222222";
const PLAN = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);
const T0 = Date.parse("2026-10-11T00:00:00Z");
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("full reset action token", () => {
  const binding = { action: "start_run" as const, actorUserId: ACTOR, planId: PLAN, planHash: HASH };

  it("fails closed without a server secret", () => {
    expect(issueFullResetActionToken(binding, T0, {} as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: "action_secret_not_configured" });
    expect(issueFullResetActionToken(binding, T0, { DATA_RESET_ACTION_SECRET: "short" } as NodeJS.ProcessEnv).ok).toBe(false);
  });

  it("verifies only the exact binding, before expiry", () => {
    const t = issueFullResetActionToken(binding, T0, env);
    if (!t.ok) throw new Error("issue failed");
    expect(verifyFullResetActionToken(t.token, binding, T0 + 1000, env).ok).toBe(true);
    expect(verifyFullResetActionToken(t.token, { ...binding, action: "approve_plan" }, T0, env)).toEqual({ ok: false, reason: "token_action_mismatch" });
    expect(verifyFullResetActionToken(t.token, { ...binding, actorUserId: PLAN }, T0, env)).toEqual({ ok: false, reason: "token_actor_mismatch" });
    expect(verifyFullResetActionToken(t.token, { ...binding, planHash: "b".repeat(64) }, T0, env)).toEqual({ ok: false, reason: "token_hash_mismatch" });
    expect(verifyFullResetActionToken(t.token, binding, T0 + 5 * 60 * 1000 + 1, env)).toEqual({ ok: false, reason: "token_expired" });
    expect(verifyFullResetActionToken(t.token, binding, T0, { DATA_RESET_ACTION_SECRET: SECRET + "x" } as NodeJS.ProcessEnv).ok).toBe(false);
  });

  it("rejects forged payloads", () => {
    const t = issueFullResetActionToken(binding, T0, env);
    if (!t.ok) throw new Error("issue failed");
    const [body, mac] = t.token.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.exp = T0 + 10 ** 9;
    const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url");
    expect(verifyFullResetActionToken(`${forgedBody}.${mac}`, binding, T0, env)).toEqual({ ok: false, reason: "token_signature_invalid" });
    expect(verifyFullResetActionToken("garbage", binding, T0, env).ok).toBe(false);
  });

  it("is single use: a replay and a parallel duplicate are refused by the claim insert", async () => {
    const prev = process.env.DATA_RESET_ACTION_SECRET;
    process.env.DATA_RESET_ACTION_SECRET = SECRET;
    const t = issueFullResetActionToken(binding, Date.now());
    if (!t.ok) throw new Error("issue failed");
    const nonces = new Set<string>();
    const sb = {
      from(table: string) {
        expect(table).toBe("data_reset_action_claims");
        return {
          insert(row: { nonce: string }) {
            if (nonces.has(row.nonce)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
            nonces.add(row.nonce);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const [a, b] = await Promise.all([consumeFullResetActionToken(sb, t.token, binding), consumeFullResetActionToken(sb, t.token, binding)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await consumeFullResetActionToken(sb, t.token, binding)).toEqual({ ok: false, reason: "token_replay" });
    process.env.DATA_RESET_ACTION_SECRET = prev;
  });
});

describe("legacy one-time token is no longer predictable", () => {
  const input = { planId: "p1", planHash: "h1", actorUserId: "u1" };
  afterEach(() => {
    process.env.DATA_RESET_ACTION_SECRET = SECRET;
  });
  it("is not the old unsigned sha256 and fails closed without a secret", () => {
    process.env.DATA_RESET_ACTION_SECRET = SECRET;
    const oldStyle = createHash("sha256").update(JSON.stringify({ kind: "data_reset_ot", ...input })).digest("hex").slice(0, 24);
    const tok = issueDataResetOneTimeToken(input);
    expect(tok).not.toBe(oldStyle);
    expect(verifyDataResetOneTimeToken(oldStyle, input)).toBe(false);
    expect(verifyDataResetOneTimeToken(tok, input)).toBe(true);
    delete process.env.DATA_RESET_ACTION_SECRET;
    expect(issueDataResetOneTimeToken(input)).toBe("");
    expect(verifyDataResetOneTimeToken(tok, input)).toBe(false);
  });
});

/** In-memory PostgREST stand-in: select/delete/update with .in/.eq/.is/.order/.limit and count. */
function fakeTable(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: String(i + 1).padStart(6, "0"), deleted_at: null as string | null }));
  let calls = 0;
  const sb = {
    from() {
      const f: { ids?: Set<string>; isNull?: boolean; mode: string; patch?: Record<string, unknown>; limit?: number; head?: boolean } = { mode: "select" };
      const match = () => rows.filter((r) => (!f.ids || f.ids.has(r.id)) && (!f.isNull || r.deleted_at === null));
      const q: Record<string, unknown> = {
        select(_c: string, o?: { head?: boolean }) { f.head = Boolean(o?.head); return q; },
        delete() { f.mode = "delete"; return q; },
        update(p: Record<string, unknown>) { f.mode = "update"; f.patch = p; return q; },
        in(_c: string, ids: string[]) { f.ids = new Set(ids); return q; },
        is() { f.isNull = true; return q; },
        eq() { return q; },
        order() { return q; },
        limit(l: number) { f.limit = l; return q; },
        then(res: (v: unknown) => void) {
          calls += 1;
          const m = match();
          if (f.mode === "delete") { for (const r of m) rows.splice(rows.indexOf(r), 1); return res({ error: null, count: m.length }); }
          if (f.mode === "update") { for (const r of m) Object.assign(r, f.patch); return res({ error: null, count: m.length }); }
          if (f.head) return res({ error: null, count: m.length });
          return res({ error: null, data: m.slice(0, f.limit ?? m.length) });
        },
      };
      return q;
    },
  };
  return { sb, rows, calls: () => calls };
}

describe("batched mutation replaces limit(5000)", () => {
  it("deletes every row of a 12,345-row table and verifies none remain", async () => {
    const t = fakeTable(12_345);
    const r = await deleteAllRowsInBatches(t.sb, "posts");
    expect(r).toMatchObject({ affected: 12_345, remaining: 0, error: null });
    expect(r.batches).toBe(13);
    expect(t.rows.length).toBe(0);
  });
  it("soft-updates until no row matches", async () => {
    const t = fakeTable(6_001);
    const r = await updateAllRowsInBatches(t.sb, "community_messenger_rooms", { deleted_at: "x" }, { filter: (q) => q.is("deleted_at", null) });
    expect(r).toMatchObject({ affected: 6_001, remaining: 0, error: null });
  });
  it("reports no progress instead of success", async () => {
    const sb = {
      from() {
        const q: Record<string, unknown> = {
          select: () => q, delete: () => q, in: () => q, order: () => q, limit: () => q,
          then: (res: (v: unknown) => void) => res({ error: null, data: [{ id: "1" }], count: 0 }),
        };
        return q;
      },
    };
    const r = await deleteAllRowsInBatches(sb, "posts");
    expect(r.error).toBe("posts:delete_made_no_progress");
  });
  it("old engine no longer carries limit(5000)", () => {
    expect(read("lib/admin/data-reset/execute.ts")).not.toMatch(/\.limit\(5000\)/);
  });
});

describe("full reset database contract", () => {
  const sql = read("supabase/migrations/20270425120000_data_reset_full_system.sql");
  it("never opts Production in and is service_role only", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.data_reset_db_guard/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.%s FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/data_reset_windows_two_people CHECK \(approved_by IS NULL OR approved_by <> requested_by\)/);
    expect(sql).toMatch(/data_reset_plans_two_people CHECK \(approved_by IS NULL OR approved_by <> confirmed_by\)/);
    expect(sql).toMatch(/data_reset_audit_events_append_only/);
    expect(sql).toMatch(/manifest_missing_tables/);
  });
  it("manifest covers the audited 398 tables with explicit SPLIT predicates", () => {
    const t = FULL_RESET_MANIFEST.tables;
    expect(Object.keys(t).length).toBe(398);
    for (const [name, e] of Object.entries(t)) if (e.class === "SPLIT") expect(e.split, name).toBeTruthy();
    expect(t.orders?.class ?? "KEEP").not.toBe("DELETE");
  });
  it("typed phrases bind to the plan hash", () => {
    expect(fullResetPhrases(HASH)).toEqual({ confirm: "CONFIRM aaaaaaaa", approve: "APPROVE aaaaaaaa", start: "RESET aaaaaaaa" });
  });
});

describe("QA allowlist on top of the Production block", () => {
  const PROD = "https://ckdosyydvgzqwpbwuhon.supabase.co";
  const QA = "https://abcdefghijklmnopqrst.supabase.co";
  const OTHER = "https://zyxwvutsrqponmlkjihg.supabase.co";
  const e = (o: Record<string, string>) => o as NodeJS.ProcessEnv;
  it("refuses when the allowlist is missing or empty", () => {
    expect(resolveDataResetExecutionTarget(e({ NEXT_PUBLIC_SUPABASE_URL: QA })).reason).toBe("qa_allowlist_missing");
    expect(resolveDataResetExecutionTarget(e({ NEXT_PUBLIC_SUPABASE_URL: QA, DATA_RESET_QA_SUPABASE_REFS: " , bad" })).allowed).toBe(false);
  });
  it("admits only the listed QA ref", () => {
    const allow = { DATA_RESET_QA_SUPABASE_REFS: "abcdefghijklmnopqrst" };
    expect(resolveDataResetExecutionTarget(e({ NEXT_PUBLIC_SUPABASE_URL: QA, ...allow })).allowed).toBe(true);
    expect(resolveDataResetExecutionTarget(e({ NEXT_PUBLIC_SUPABASE_URL: OTHER, ...allow })).reason).toBe("database_target_not_in_qa_allowlist");
    expect(resolveDataResetExecutionTarget(e({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", ...allow })).allowed).toBe(false);
  });
  it("never admits Production, even if listed", () => {
    const r = resolveDataResetExecutionTarget(e({ NEXT_PUBLIC_SUPABASE_URL: PROD, DATA_RESET_QA_SUPABASE_REFS: "ckdosyydvgzqwpbwuhon" }));
    expect(r).toMatchObject({ allowed: false, reason: "database_target_production" });
  });
});
