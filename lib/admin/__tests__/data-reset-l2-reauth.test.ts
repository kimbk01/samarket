/**
 * Data Reset L2 first divergence — server re-auth fail-closed contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DATA_RESET_L2_REAUTH,
  verifyDataResetL2ReauthProof,
} from "@/lib/admin/data-reset/l2-reauth";
import { isDataResetProductionScopeEnabled } from "@/lib/admin/data-reset/production-enable-policy";
import { confirmationMatchesPlan } from "@/lib/admin/data-reset/planner";
import {
  issueDataResetOneTimeToken,
  verifyDataResetOneTimeToken,
  type DataResetPlan,
} from "@/lib/admin/data-reset/types";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("L2 re-auth authority inventory", () => {
  it("no Admin password/step-up SSOT — implemented false", () => {
    expect(DATA_RESET_L2_REAUTH.implemented).toBe(false);
    expect(DATA_RESET_L2_REAUTH.sessionIsNotReauth).toBe(true);
    expect(DATA_RESET_L2_REAUTH.authorityFunction).toBe("verifyDataResetL2ReauthProof");
  });
});

describe("L2 server enforcement", () => {
  it("typed phrase only is insufficient — reauth proof always fails while unimplemented", () => {
    const plan = {
      typedConfirmationPhrase: "CHAT RESET abcdef12",
      confirmationLevel: 2,
    } as DataResetPlan;
    expect(confirmationMatchesPlan(plan, "CHAT RESET abcdef12")).toBe(true);
    expect(
      verifyDataResetL2ReauthProof({ actorUserId: "admin", reauthProof: null }).ok
    ).toBe(false);
    const missing = verifyDataResetL2ReauthProof({
      actorUserId: "admin",
      reauthProof: undefined,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("SERVER_REAUTH_NOT_IMPLEMENTED");
  });

  it("invalid reauth proof → BLOCK", () => {
    const r = verifyDataResetL2ReauthProof({
      actorUserId: "admin",
      reauthProof: "not-a-real-password",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("SERVER_REAUTH_NOT_IMPLEMENTED");
  });

  it("valid reauth + typed ALLOW path unavailable until REAUTH AUTHORITY exists", () => {
    // Decision C: no ALLOW path without inventing auth. Both “valid-looking” and empty fail.
    expect(DATA_RESET_L2_REAUTH.implemented).toBe(false);
    expect(
      verifyDataResetL2ReauthProof({ actorUserId: "admin", reauthProof: "correct-looking" }).ok
    ).toBe(false);
  });

  it("execute wires L2 check before L3 token and blocks on SERVER_REAUTH_NOT_IMPLEMENTED", () => {
    const execute = read("lib/admin/data-reset/execute.ts");
    expect(execute).toContain("verifyDataResetL2ReauthProof");
    expect(execute).toContain("confirmationLevel === 2");
    expect(execute).toContain("reauth.reason");
    expect(read("lib/admin/data-reset/l2-reauth.ts")).toContain("SERVER_REAUTH_NOT_IMPLEMENTED");
    const l2Idx = execute.indexOf("confirmationLevel === 2");
    const l3Idx = execute.indexOf("confirmationLevel >= 3");
    expect(l2Idx).toBeGreaterThan(-1);
    expect(l3Idx).toBeGreaterThan(l2Idx);
  });
});

describe("L2 Production allowlist fail-closed", () => {
  it("chat:type and friend:user Production ENABLE removed", () => {
    expect(isDataResetProductionScopeEnabled({ domain: "chat", scope: "type" })).toBe(false);
    expect(isDataResetProductionScopeEnabled({ domain: "friend", scope: "user" })).toBe(false);
  });
});

describe("L1 / L3 preserved", () => {
  it("L1 scopes remain Production-enabled (single)", () => {
    expect(
      isDataResetProductionScopeEnabled({ domain: "community", scope: "single" })
    ).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "chat", scope: "single" })).toBe(true);
  });

  it("L3 one-time token contract unchanged", () => {
    const tok = issueDataResetOneTimeToken({
      planId: "p1",
      planHash: "h1",
      actorUserId: "u1",
    });
    expect(
      verifyDataResetOneTimeToken(tok, { planId: "p1", planHash: "h1", actorUserId: "u1" })
    ).toBe(true);
    expect(
      verifyDataResetOneTimeToken(tok, { planId: "p1", planHash: "h2", actorUserId: "u1" })
    ).toBe(false);
  });
});

describe("finance/auth/truncate still blocked", () => {
  it("Production matrix still blocks finance and auth purge", () => {
    expect(isDataResetProductionScopeEnabled({ domain: "finance", scope: "all" })).toBe(false);
    expect(
      isDataResetProductionScopeEnabled({
        domain: "member",
        scope: "user",
        subtype: "auth_delete",
      })
    ).toBe(false);
  });
});
