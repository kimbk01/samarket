/**
 * P1-6 / OA-17 — Web OAuth callback passes this-login provider to policy and
 * persists identity with retry/log (no silent swallow).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "app/auth/callback/route.ts"), "utf8");

describe("auth callback this-login provider + identity persist contract", () => {
  it("passes callback ?provider= to enforceWebOAuthProviderPolicy", () => {
    expect(src).toMatch(
      /enforceWebOAuthProviderPolicy\(writeSb, mergedUser, \{[\s\S]*?loginProvider: req\.nextUrl\.searchParams\.get\("provider"\)/,
    );
  });

  it("every persistOAuthProviderIdentity call carries callbackAttemptId", () => {
    const calls = src.match(/persistOAuthProviderIdentity\([^)]*\{\s*callbackAttemptId,\s*\}\)/g) ?? [];
    const all = src.match(/await persistOAuthProviderIdentity\(/g) ?? [];
    expect(all.length).toBe(2);
    expect(calls.length).toBe(all.length);
  });
});
