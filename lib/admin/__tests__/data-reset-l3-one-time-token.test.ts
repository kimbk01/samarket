/**
 * L3 one-time token replay close — material binding + stateful claim.
 * No Production destructive runtime.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claimDataResetL3OneTimeToken,
  hashDataResetL3TokenForStorage,
  DATA_RESET_L3_TOKEN_CLAIMS_TABLE,
} from "@/lib/admin/data-reset/l3-one-time-token";
import {
  DATA_RESET_L3_TOKEN_CLAIMS_MIGRATION,
  issueDataResetOneTimeToken,
  verifyDataResetOneTimeToken,
} from "@/lib/admin/data-reset/types";
import { verifyDataResetL2ReauthProof } from "@/lib/admin/data-reset/l2-reauth";
import {
  assertDataResetFailClosedDomain,
  isDataResetProductionScopeEnabled,
} from "@/lib/admin/data-reset/production-enable-policy";

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

type ClaimRow = {
  token_hash: string;
  plan_id: string;
  plan_hash: string;
  actor_user_id: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string;
};

function mockClaimSb(store: { rows: ClaimRow[]; insertCalls: number }) {
  return {
    from(table: string) {
      expect(table).toBe(DATA_RESET_L3_TOKEN_CLAIMS_TABLE);
      return {
        insert(row: ClaimRow) {
          store.insertCalls += 1;
          const dupHash = store.rows.some((r) => r.token_hash === row.token_hash);
          const dupPlan = store.rows.some((r) => r.plan_id === row.plan_id);
          if (dupHash || dupPlan) {
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            });
          }
          store.rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      };
    },
  };
}

const base = {
  planId: "11111111-1111-4111-8111-111111111111",
  planHash: "abcd1234abcd1234abcd1234",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  issuedAt: "2026-09-09T18:00:00.000Z",
  expiresAt: "2026-09-09T18:15:00.000Z",
  nowMs: Date.parse("2026-09-09T18:05:00.000Z"),
};

describe("L3 one-time token material + consume", () => {
  it("migration SSOT exists and stores token_hash not raw token", () => {
    const sql = read(DATA_RESET_L3_TOKEN_CLAIMS_MIGRATION);
    expect(sql).toContain("data_reset_l3_token_claims");
    expect(sql).toContain("token_hash");
    expect(sql).toContain("consumed_at");
    expect(sql).toContain("UNIQUE (plan_id)");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql.toLowerCase()).not.toContain("raw_token");
  });

  it("storage hash never equals raw token material", () => {
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const stored = hashDataResetL3TokenForStorage(tok);
    expect(stored).not.toBe(tok);
    expect(stored).toHaveLength(64);
  });

  it("first valid token claim ALLOW", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const r = await claimDataResetL3OneTimeToken({
      sb: mockClaimSb(store) as never,
      rawToken: tok,
      ...base,
    });
    expect(r).toEqual({ ok: true });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.token_hash).toBe(hashDataResetL3TokenForStorage(tok));
    expect(store.rows[0]?.plan_id).toBe(base.planId);
  });

  it("same token second use BLOCK (replay)", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const sb = mockClaimSb(store) as never;
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    expect(await claimDataResetL3OneTimeToken({ sb, rawToken: tok, ...base })).toEqual({ ok: true });
    const replay = await claimDataResetL3OneTimeToken({ sb, rawToken: tok, ...base });
    expect(replay).toEqual({ ok: false, reason: "one_time_token_replay" });
    expect(store.rows).toHaveLength(1);
  });

  it("concurrent same token — only one claim succeeds", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    // Shared store simulates unique constraint across concurrent inserts
    const sb = mockClaimSb(store) as never;
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const [a, b] = await Promise.all([
      claimDataResetL3OneTimeToken({ sb, rawToken: tok, ...base }),
      claimDataResetL3OneTimeToken({ sb, rawToken: tok, ...base }),
    ]);
    const oks = [a, b].filter((x) => x.ok);
    const fails = [a, b].filter((x) => !x.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toEqual({ ok: false, reason: "one_time_token_replay" });
    expect(store.rows).toHaveLength(1);
  });

  it("different actor BLOCK", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const r = await claimDataResetL3OneTimeToken({
      sb: mockClaimSb(store) as never,
      rawToken: tok,
      ...base,
      actorUserId: "33333333-3333-4333-8333-333333333333",
    });
    expect(r).toEqual({ ok: false, reason: "one_time_token_invalid" });
    expect(store.rows).toHaveLength(0);
  });

  it("different plan BLOCK", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const r = await claimDataResetL3OneTimeToken({
      sb: mockClaimSb(store) as never,
      rawToken: tok,
      ...base,
      planId: "44444444-4444-4444-8444-444444444444",
    });
    expect(r).toEqual({ ok: false, reason: "one_time_token_invalid" });
  });

  it("different planHash BLOCK", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const r = await claimDataResetL3OneTimeToken({
      sb: mockClaimSb(store) as never,
      rawToken: tok,
      ...base,
      planHash: "zzzz9999zzzz9999zzzz9999",
    });
    expect(r).toEqual({ ok: false, reason: "one_time_token_invalid" });
  });

  it("expired BLOCK", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    const r = await claimDataResetL3OneTimeToken({
      sb: mockClaimSb(store) as never,
      rawToken: tok,
      ...base,
      nowMs: Date.parse("2026-09-09T18:20:00.000Z"),
    });
    expect(r).toEqual({ ok: false, reason: "one_time_token_expired" });
    expect(store.rows).toHaveLength(0);
  });

  it("missing / empty token BLOCK without insert", async () => {
    const store = { rows: [] as ClaimRow[], insertCalls: 0 };
    const r = await claimDataResetL3OneTimeToken({
      sb: mockClaimSb(store) as never,
      rawToken: "",
      ...base,
    });
    expect(r).toEqual({ ok: false, reason: "one_time_token_invalid" });
    expect(store.insertCalls).toBe(0);
  });

  it("material verify still binds actor/plan/hash", () => {
    const tok = issueDataResetOneTimeToken({
      planId: base.planId,
      planHash: base.planHash,
      actorUserId: base.actorUserId,
    });
    expect(
      verifyDataResetOneTimeToken(tok, {
        planId: base.planId,
        planHash: base.planHash,
        actorUserId: base.actorUserId,
      })
    ).toBe(true);
    expect(
      verifyDataResetOneTimeToken(tok, {
        planId: base.planId,
        planHash: "other",
        actorUserId: base.actorUserId,
      })
    ).toBe(false);
  });
});

describe("L3 claim wiring + L1/L2/finance unchanged", () => {
  it("execute claims before mutation; L3-only", () => {
    const execute = read("lib/admin/data-reset/execute.ts");
    const claimMod = read("lib/admin/data-reset/l3-one-time-token.ts");
    expect(execute).toContain("claimDataResetL3OneTimeToken");
    expect(execute).toContain("confirmationLevel >= 3");
    expect(claimMod).toContain("one_time_token_replay");
    expect(claimMod).toContain("one_time_token_invalid");
    // claim sits before runDbActions
    const claimIdx = execute.indexOf("claimDataResetL3OneTimeToken");
    const dbIdx = execute.indexOf("runDbActions");
    expect(claimIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeGreaterThan(claimIdx);
  });

  it("L1 path does not require L3 claim (confirmationLevel 1)", () => {
    const execute = read("lib/admin/data-reset/execute.ts");
    // L3 block is gated; L1 stays confirmationMatchesPlan only for level 1
    expect(execute).toContain("confirmationMatchesPlan");
    expect(execute).toContain("confirmationLevel === 2");
    expect(execute).toContain("confirmationLevel >= 3");
  });

  it("L2 remains SERVER_REAUTH_NOT_IMPLEMENTED / Production scope blocked", () => {
    const reauth = verifyDataResetL2ReauthProof({ actorUserId: "admin" });
    expect(reauth.ok).toBe(false);
    if (!reauth.ok) expect(reauth.reason).toBe("SERVER_REAUTH_NOT_IMPLEMENTED");
    expect(
      isDataResetProductionScopeEnabled({ domain: "chat", scope: "type", subtype: "general_direct" })
    ).toBe(false);
    expect(isDataResetProductionScopeEnabled({ domain: "friend", scope: "user" })).toBe(false);
  });

  it("finance / auth purge fail-closed unchanged", () => {
    expect(assertDataResetFailClosedDomain({ domain: "finance" })).toEqual({
      ok: false,
      reason: "FINANCIAL_HARD_RESET_BLOCKED",
    });
    expect(
      assertDataResetFailClosedDomain({ domain: "member", subtype: "auth_delete" })
    ).toEqual({ ok: false, reason: "AUTH_ACCOUNT_DELETE_BLOCKED" });
  });
});

describe("no in-memory-only consume authority", () => {
  it("claim module does not use process-global Set for authority", () => {
    const src = read("lib/admin/data-reset/l3-one-time-token.ts");
    expect(src).not.toMatch(/new Set\s*\(/);
    expect(src).toContain("data_reset_l3_token_claims");
    expect(src).toContain("insert");
  });
});
