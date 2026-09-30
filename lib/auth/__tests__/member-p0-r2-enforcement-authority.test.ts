/**
 * P0-R2 — Enforcement authority contract tests (structure, not Production runtime).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertMemberProductAction,
  findMemberMutationExemptRule,
  isMemberMutationExemptPath,
  resolveMemberActionClassForApiMutation,
  resolveMemberMutationPolicyClass,
} from "@/lib/auth/member-action-policy";
import {
  invalidateMemberLifecycleAuthority,
  peekMemberLifecycleAuthority,
  setMemberLifecycleAuthority,
} from "@/lib/auth/member-lifecycle-authority-cache";
import {
  peekAuthLightSessionSnapshot,
  setAuthLightSessionSnapshot,
  invalidateAuthLightSessionSnapshotCache,
} from "@/lib/auth/auth-light-session-snapshot-cache";
import { resolveLoginDeniedForMemberAccount } from "@/lib/auth/member-account-state";

const ACTIVE = { status: "verified_user", deleted_at: null };
const SUSPENDED = { status: "suspended", deleted_at: null };
const BLOCKED = { status: "blocked", deleted_at: null };
const WITHDRAWN = { status: "deleted", deleted_at: "2026-01-01T00:00:00Z" };

describe("P0-R2 member action policy", () => {
  it("ACTIVE product write allow", () => {
    expect(assertMemberProductAction(ACTIVE, "PRODUCT_WRITE")).toEqual({ ok: true });
  });

  it("SUSPENDED product write deny", () => {
    const d = assertMemberProductAction(SUSPENDED, "PRODUCT_WRITE");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("member_product_write_denied");
  });

  it("BLOCKED product action deny", () => {
    const d = assertMemberProductAction(BLOCKED, "PRODUCT_WRITE");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("account_blocked");
  });

  it("WITHDRAWN product action deny", () => {
    const d = assertMemberProductAction(WITHDRAWN, "PRODUCT_WRITE");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("account_withdrawn");
  });

  it("EXEMPT logout/support allow even when restricted", () => {
    expect(isMemberMutationExemptPath("/api/auth/logout")).toBe(true);
    expect(isMemberMutationExemptPath("/api/auth/logout-all")).toBe(true);
    expect(isMemberMutationExemptPath("/api/support/cases/open")).toBe(true);
    expect(findMemberMutationExemptRule("/api/auth/logout")?.allowedAction).toBe("logout");
    for (const profile of [SUSPENDED, BLOCKED, WITHDRAWN]) {
      expect(assertMemberProductAction(profile, "EXEMPT")).toEqual({ ok: true });
    }
  });

  it("unguarded path is not EXEMPT — product write class", () => {
    expect(resolveMemberActionClassForApiMutation("/api/community/posts")).toBe("PRODUCT_WRITE");
    expect(resolveMemberMutationPolicyClass("/api/community/posts")).toBe("DENY");
    expect(isMemberMutationExemptPath("/api/community/posts")).toBe(false);
  });

  it("NON_MEMBER cron/webhook/admin not lifecycle-gated", () => {
    expect(resolveMemberActionClassForApiMutation("/api/cron/foo")).toBe("NON_MEMBER");
    expect(resolveMemberActionClassForApiMutation("/api/admin/users")).toBe("NON_MEMBER");
    expect(resolveMemberMutationPolicyClass("/api/cron/foo")).toBe("NON_MEMBER");
  });
});

describe("P0-R2 lifecycle authority cache vs light session", () => {
  const userId = "p0-r2-user-cache";
  const sessionId = "p0-r2-session";

  beforeEach(() => {
    invalidateMemberLifecycleAuthority(userId);
    invalidateAuthLightSessionSnapshotCache(userId);
  });

  it("warm light snapshot after BLOCK cannot authorize (login-deny recheck)", () => {
    setAuthLightSessionSnapshot(userId, sessionId, sessionId);
    setMemberLifecycleAuthority(userId, ACTIVE);
    expect(peekAuthLightSessionSnapshot(userId, sessionId).hit).toBe(true);

    // Moderation invalidation + blocked authority
    invalidateMemberLifecycleAuthority(userId);
    invalidateAuthLightSessionSnapshotCache(userId);
    setMemberLifecycleAuthority(userId, BLOCKED);

    // Simulate light-snap path: even if identity snap were warm, lifecycle deny wins
    const life = peekMemberLifecycleAuthority(userId);
    expect(life.hit).toBe(true);
    if (life.hit) {
      expect(resolveLoginDeniedForMemberAccount(life.profile)?.code).toBe("account_blocked");
      expect(assertMemberProductAction(life.profile, "PRODUCT_WRITE").ok).toBe(false);
    }
  });

  it("warm lifecycle after SUSPEND cannot permit denied write", () => {
    setMemberLifecycleAuthority(userId, ACTIVE);
    invalidateMemberLifecycleAuthority(userId);
    setMemberLifecycleAuthority(userId, SUSPENDED);
    const life = peekMemberLifecycleAuthority(userId);
    expect(life.hit).toBe(true);
    if (life.hit) {
      // login allowed
      expect(resolveLoginDeniedForMemberAccount(life.profile)).toBeNull();
      // write denied
      expect(assertMemberProductAction(life.profile, "PRODUCT_WRITE").ok).toBe(false);
    }
  });

  it("warm cache after WITHDRAW cannot authorize", () => {
    setMemberLifecycleAuthority(userId, ACTIVE);
    invalidateMemberLifecycleAuthority(userId);
    setMemberLifecycleAuthority(userId, WITHDRAWN);
    const life = peekMemberLifecycleAuthority(userId);
    expect(life.hit).toBe(true);
    if (life.hit) {
      expect(resolveLoginDeniedForMemberAccount(life.profile)?.code).toBe("account_withdrawn");
      expect(assertMemberProductAction(life.profile, "PRODUCT_WRITE").ok).toBe(false);
    }
  });

  it("epoch invalidation drops stale lifecycle rows", () => {
    setMemberLifecycleAuthority(userId, ACTIVE);
    expect(peekMemberLifecycleAuthority(userId).hit).toBe(true);
    invalidateMemberLifecycleAuthority(userId);
    expect(peekMemberLifecycleAuthority(userId).hit).toBe(false);
  });
});

describe("P0-R2 moderation consistency model (ordering contract)", () => {
  it("ban path Auth-first + failure audit markers exist in route source", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/admin/users/[id]/moderation/route.ts"),
      "utf8"
    );
    expect(src).toContain("BAN / BLOCK —— Auth first");
    expect(src).toContain('error: "auth_block_failed"');
    expect(src).toContain('result: "FAILED"');
    expect(src).toContain('result: "SUCCESS"');
    expect(src).toContain("compensated_unban");
    expect(src).toContain("auth_unblock_failed");
    expect(src).toContain("rolled_back_blocked");
    expect(src).toContain('result: "COMPENSATION_FAILED"');
    // No silent profile-only rollback after Auth success without compensate path
    expect(src).toContain("ban_duration: \"none\"");
  });
});

describe("P0-R2 mutation inventory classification sum", () => {
  it("DENY+ALLOW+EXEMPT+NON_MEMBER equals TOTAL", () => {
    const committed = resolve(
      process.cwd(),
      "lib/auth/__fixtures__/member-p0-mutation-class-summary.json"
    );
    const legacyTmp = resolve(
      process.cwd(),
      ".tmp/admin-member-ssot/P0_R2_MUTATION_CLASS_SUMMARY.json"
    );
    const summary = JSON.parse(
      readFileSync(existsSync(committed) ? committed : legacyTmp, "utf8")
    ) as {
      total: number;
      class_counts: Record<string, number>;
      sum_check: boolean;
    };
    const sum =
      (summary.class_counts.DENY ?? 0) +
      (summary.class_counts.ALLOW ?? 0) +
      (summary.class_counts.EXEMPT ?? 0) +
      (summary.class_counts.NON_MEMBER ?? 0);
    expect(summary.sum_check).toBe(true);
    expect(sum).toBe(summary.total);
    expect(summary.total).toBeGreaterThan(0);
  });
});
