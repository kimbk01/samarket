import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("use-client-membership-state hot-path contract", () => {
  it("does not import or call ensureSessionHealthy", () => {
    const src = readSource("hooks/use-client-membership-state.ts");
    expect(src).not.toContain("ensureSessionHealthy");
    expect(src).not.toContain("dibay-session-manager");
  });

  it("resolves via resolveClientMembership and syncs profile cache on auth bind", () => {
    const src = readSource("hooks/use-client-membership-state.ts");
    expect(src).toContain("resolveClientMembership");
    expect(src).toContain("syncMembershipFromProfileCache");
    expect(src).toContain("TEST_AUTH_CHANGED_EVENT");
  });
});

describe("api-auth-recovery 401 path", () => {
  it("uses handleApi401 without membership hook dependency", () => {
    const src = readSource("lib/auth/api-auth-recovery.ts");
    expect(src).toContain("handleApi401");
    expect(src).not.toContain("useClientMembershipState");
    expect(src).not.toContain("resolveClientMembership");
  });
});

describe("AuthSessionBoundary guest vs optimistic", () => {
  it("blocks guest before optimistic checking bypass", () => {
    const src = readSource("components/auth/AuthSessionBoundary.tsx");
    const guestIdx = src.indexOf('membership.status === "guest" || isAuthExitNavigateStarted()');
    const checkingBypassIdx = src.indexOf('if (membership.status === "checking" && !optimisticMember)');
    expect(guestIdx).toBeGreaterThan(-1);
    expect(checkingBypassIdx).toBeGreaterThan(-1);
    expect(guestIdx).toBeLessThan(checkingBypassIdx);
  });
});
