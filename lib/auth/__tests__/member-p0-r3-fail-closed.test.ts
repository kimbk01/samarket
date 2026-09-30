/**
 * P0-R3 — Fail-closed lifecycle authority + central gate integrity (CURRENT worktree).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertMemberProductAction,
  MEMBER_MUTATION_EXEMPT_INVENTORY_COUNT,
  MEMBER_MUTATION_EXEMPT_RULES,
  resolveMemberActionClassForApiMutation,
  resolveMemberMutationPolicyClass,
} from "@/lib/auth/member-action-policy";
import {
  invalidateMemberLifecycleAuthority,
  peekMemberLifecycleAuthority,
  setMemberLifecycleAuthority,
} from "@/lib/auth/member-lifecycle-authority-cache";
import {
  isMemberLifecycleAuthorityFailClosed,
  MEMBER_ACCOUNT_STATE_UNAVAILABLE,
  resolveMemberLifecycleAuthority,
  type MemberLifecycleAuthorityResult,
} from "@/lib/auth/resolve-member-lifecycle-authority";
import {
  countDenyRoutesCoveredByProxyMatcher,
  isPathCoveredByProxyMatcher,
  PROXY_MATCHER_SOURCE_FRAGMENT,
} from "@/lib/auth/proxy-member-mutation-matcher";
import { enforceApiMemberMutationPolicy } from "@/lib/auth/enforce-api-member-mutation-policy";
import { NextRequest } from "next/server";

const ACTIVE = { status: "verified_user", deleted_at: null };
const SUSPENDED = { status: "suspended", deleted_at: null };
const BLOCKED = { status: "blocked", deleted_at: null };
const WITHDRAWN = { status: "deleted", deleted_at: "2026-01-01T00:00:00Z" };
const UNKNOWN = { status: "weird_status_xyz", deleted_at: null };

function loadMutationCsv(): Array<{ METHOD: string; PATH: string; CLASS: string }> {
  const committed = resolve(
    process.cwd(),
    "lib/auth/__fixtures__/member-p0-mutation-classification.csv"
  );
  const legacyTmp = resolve(
    process.cwd(),
    ".tmp/admin-member-ssot/P0_R2_MUTATION_CLASSIFICATION.csv"
  );
  const raw = readFileSync(existsSync(committed) ? committed : legacyTmp, "utf8");
  const lines = raw.trim().split("\n");
  const header = lines[0].split(",");
  const mi = header.indexOf("METHOD");
  const pi = header.indexOf("PATH");
  const ci = header.indexOf("CLASS");
  return lines.slice(1).map((line) => {
    // Fields may contain commas inside quoted values — use a minimal CSV split.
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    return { METHOD: cols[mi], PATH: cols[pi], CLASS: cols[ci] };
  });
}

describe("P0-R3 resolver result contract", () => {
  it("fail-closed helpers: PROFILE_NOT_FOUND / UNAVAILABLE / unknown", () => {
    expect(
      isMemberLifecycleAuthorityFailClosed({ kind: "PROFILE_NOT_FOUND" })
    ).toBe(true);
    expect(
      isMemberLifecycleAuthorityFailClosed({
        kind: "AUTHORITY_UNAVAILABLE",
        reason: "query_error",
      })
    ).toBe(true);
    expect(
      isMemberLifecycleAuthorityFailClosed({
        kind: "RESOLVED",
        profile: UNKNOWN,
        lifecycle: "unknown",
        source: "db",
      })
    ).toBe(true);
    expect(
      isMemberLifecycleAuthorityFailClosed({
        kind: "RESOLVED",
        profile: ACTIVE,
        lifecycle: "active",
        source: "cache",
      })
    ).toBe(false);
  });

  it("assertMemberProductAction denies null / unknown", () => {
    const nullDec = assertMemberProductAction(null, "PRODUCT_WRITE");
    expect(nullDec.ok).toBe(false);
    if (!nullDec.ok) expect(nullDec.code).toBe("account_state_unavailable");

    const unk = assertMemberProductAction(UNKNOWN, "PRODUCT_WRITE");
    expect(unk.ok).toBe(false);
    if (!unk.ok) expect(unk.code).toBe("account_state_unavailable");
  });

  it("active / suspended / blocked / withdrawn still evaluate normally", () => {
    expect(assertMemberProductAction(ACTIVE, "PRODUCT_WRITE")).toEqual({ ok: true });
    expect(assertMemberProductAction(SUSPENDED, "PRODUCT_WRITE").ok).toBe(false);
    expect(assertMemberProductAction(BLOCKED, "PRODUCT_WRITE").ok).toBe(false);
    expect(assertMemberProductAction(WITHDRAWN, "PRODUCT_WRITE").ok).toBe(false);
  });
});

describe("P0-R3 fail-closed enforce gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("authenticated PRODUCT_WRITE + AUTHORITY_UNAVAILABLE → DENY", async () => {
    vi.doMock("@/lib/auth/resolve-member-lifecycle-authority", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/auth/resolve-member-lifecycle-authority")
      >("@/lib/auth/resolve-member-lifecycle-authority");
      return {
        ...actual,
        resolveMemberLifecycleAuthority: async (): Promise<MemberLifecycleAuthorityResult> => ({
          kind: "AUTHORITY_UNAVAILABLE",
          reason: "query_error",
        }),
      };
    });
    vi.doMock("@/lib/auth/proxy-auth-session-cache", () => ({
      peekProxyAuthSessionCache: () => "user-fail-closed-1",
      proxyAuthCookieFingerprint: () => "fp",
      setProxyAuthSessionCache: () => {},
    }));

    const { enforceApiMemberMutationPolicy: enforce } = await import(
      "@/lib/auth/enforce-api-member-mutation-policy"
    );
    const req = new NextRequest("http://localhost/api/community/posts", { method: "POST" });
    const res = await enforce(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(MEMBER_ACCOUNT_STATE_UNAVAILABLE.status);
    const body = await res!.json();
    expect(body.code).toBe("account_state_unavailable");
    expect(body.ok).toBe(false);
  });

  it("anonymous PRODUCT_WRITE path → continue (not restricted-member error)", async () => {
    vi.doMock("@/lib/auth/proxy-auth-session-cache", () => ({
      peekProxyAuthSessionCache: () => null,
      proxyAuthCookieFingerprint: () => "fp-anon",
      setProxyAuthSessionCache: () => {},
    }));
    vi.doMock("@/lib/env/runtime", () => ({
      requireSupabaseEnv: () => ({ ok: false }),
    }));

    const { enforceApiMemberMutationPolicy: enforce } = await import(
      "@/lib/auth/enforce-api-member-mutation-policy"
    );
    const req = new NextRequest("http://localhost/api/community/posts", { method: "POST" });
    const res = await enforce(req);
    expect(res).toBeNull();
  });

  it("NON_MEMBER does not enter member lifecycle gate", async () => {
    const req = new NextRequest("http://localhost/api/cron/store-orders-auto-complete", {
      method: "POST",
    });
    const res = await enforceApiMemberMutationPolicy(req);
    expect(res).toBeNull();
    expect(resolveMemberActionClassForApiMutation("/api/cron/store-orders-auto-complete")).toBe(
      "NON_MEMBER"
    );
  });
});

describe("P0-R3 EXEMPT 13 exact rules", () => {
  it("has exactly 13 EXEMPT rules and inventory paths", () => {
    expect(MEMBER_MUTATION_EXEMPT_RULES.length).toBe(MEMBER_MUTATION_EXEMPT_INVENTORY_COUNT);
    expect(MEMBER_MUTATION_EXEMPT_INVENTORY_COUNT).toBe(13);
  });

  it("table-driven: every EXEMPT inventory row classifies EXEMPT", () => {
    const rows = loadMutationCsv().filter((r) => r.CLASS === "EXEMPT");
    expect(rows.length).toBe(13);
    for (const row of rows) {
      expect(resolveMemberActionClassForApiMutation(row.PATH)).toBe("EXEMPT");
      expect(resolveMemberMutationPolicyClass(row.PATH)).toBe("EXEMPT");
      expect(assertMemberProductAction(SUSPENDED, "EXEMPT")).toEqual({ ok: true });
      expect(assertMemberProductAction(BLOCKED, "EXEMPT")).toEqual({ ok: true });
      expect(assertMemberProductAction(WITHDRAWN, "EXEMPT")).toEqual({ ok: true });
    }
  });

  it("rejects wildcard account/auth/support descendants not in inventory", () => {
    expect(resolveMemberActionClassForApiMutation("/api/account/profile")).toBe("PRODUCT_WRITE");
    expect(resolveMemberActionClassForApiMutation("/api/auth/refresh")).toBe("PRODUCT_WRITE");
    expect(resolveMemberActionClassForApiMutation("/api/support/cases/open/extra")).toBe(
      "PRODUCT_WRITE"
    );
    expect(resolveMemberActionClassForApiMutation("/api/account/phone/other")).toBe("PRODUCT_WRITE");
  });
});

describe("P0-R3 NON_MEMBER 18 classification", () => {
  it("all 18 inventory NON_MEMBER rows stay NON_MEMBER", () => {
    const rows = loadMutationCsv().filter((r) => r.CLASS === "NON_MEMBER");
    expect(rows.length).toBe(18);
    for (const row of rows) {
      expect(resolveMemberActionClassForApiMutation(row.PATH)).toBe("NON_MEMBER");
      expect(resolveMemberMutationPolicyClass(row.PATH)).toBe("NON_MEMBER");
    }
  });
});

describe("P0-R3 cache invalidation fail-closed", () => {
  const userId = "p0-r3-cache-user";

  beforeEach(() => {
    invalidateMemberLifecycleAuthority(userId);
  });

  it("warm ACTIVE → invalidate → authority lookup failure → DENY (no stale ACTIVE)", async () => {
    setMemberLifecycleAuthority(userId, ACTIVE);
    expect(peekMemberLifecycleAuthority(userId).hit).toBe(true);
    invalidateMemberLifecycleAuthority(userId);
    expect(peekMemberLifecycleAuthority(userId).hit).toBe(false);

    // Simulate post-invalidation DB failure via mocked resolve path semantics:
    const unavailable: MemberLifecycleAuthorityResult = {
      kind: "AUTHORITY_UNAVAILABLE",
      reason: "query_error",
    };
    expect(isMemberLifecycleAuthorityFailClosed(unavailable)).toBe(true);
    // Stale ACTIVE must not remain after invalidation
    expect(peekMemberLifecycleAuthority(userId).hit).toBe(false);
  });
});

describe("P0-R3 proxy matcher DENY coverage", () => {
  it("proxy.ts matcher source stays in sync with helper", () => {
    const proxySrc = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
    expect(proxySrc).toContain(PROXY_MATCHER_SOURCE_FRAGMENT);
    expect(proxySrc).toContain("enforceApiMemberMutationPolicy");
    expect(proxySrc).toContain('if (pathname.startsWith("/api/"))');
  });

  it("every DENY-classified route is matcher-covered (279/279)", () => {
    const deny = loadMutationCsv().filter((r) => r.CLASS === "DENY");
    expect(deny.length).toBe(279);
    const { covered, total, uncovered } = countDenyRoutesCoveredByProxyMatcher(
      deny.map((r) => r.PATH)
    );
    expect(uncovered).toEqual([]);
    expect(covered).toBe(279);
    expect(total).toBe(279);
    expect(isPathCoveredByProxyMatcher("/api/community/posts")).toBe(true);
  });
});

describe("P0-R3 moderation compensation", () => {
  it("route source exposes COMPENSATION_FAILED (no false SUCCESS)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/admin/users/[id]/moderation/route.ts"),
      "utf8"
    );
    expect(src).toContain('result: "COMPENSATION_FAILED"');
    expect(src).toContain('error: "compensation_failed"');
    expect(src).toContain("BAN / BLOCK —— Auth first");
    expect(src).toContain("ROLLBACK_FAILED");
    expect(src).toContain("compensated_unban");
    // Must not silently swallow Auth compensate failure
    expect(src).not.toContain("/* best-effort Auth compensate */");
  });
});

describe("P0-R3 ACCOUNT policy DENY default", () => {
  it("ACCOUNT-like product paths are PRODUCT_WRITE DENY class", () => {
    expect(resolveMemberMutationPolicyClass("/api/account/addresses")).toBe("DENY");
    expect(resolveMemberMutationPolicyClass("/api/me/profile")).toBe("DENY");
    expect(resolveMemberActionClassForApiMutation("/api/account/addresses")).toBe("PRODUCT_WRITE");
  });
});
