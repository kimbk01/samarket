/**
 * CUT I-P0-11 — Storage / Auth Pre-launch Reset targeted contracts.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashPlanPayload } from "@/lib/admin/prelaunch-reset/types";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import { PRELAUNCH_RESET_HARD_LOCK } from "@/lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock";
import { planPrelaunchResetAuthTargets } from "@/lib/admin/prelaunch-reset/storage-auth-plan";
import type { PrelaunchResetPlan } from "@/lib/admin/prelaunch-reset/types";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("CUT I-P0-11 Reset Storage/Auth", () => {
  it("P1 — Production execute remains ALWAYS BLOCKED", () => {
    expect(PRELAUNCH_RESET_HARD_LOCK.productionExecuteForbidden).toBe(true);
    const gate = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
      PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
    expect(gate.dryRunAllowed).toBe(true);
  });

  it("H1 — planHash includes Storage + Auth sets", () => {
    const base = {
      preset: "TEST_CONTENT_ONLY",
      selector: { memberIds: [], storeIds: [], contentIds: ["c1"], deliveryAdCampaignIds: [] },
      counts: { storage: 1 },
      deleteSteps: [],
      storageObjects: [
        { bucket: "post-images", path: "u1/a.jpg", sourceKind: "content", sourceId: "c1" },
      ],
      authTargets: [] as Array<{ userId: string; action: string }>,
      blockers: [],
    };
    const h1 = hashPlanPayload(base);
    const h2 = hashPlanPayload({
      ...base,
      storageObjects: [
        ...base.storageObjects,
        { bucket: "post-images", path: "u1/b.jpg", sourceKind: "content", sourceId: "c1" },
      ],
    });
    expect(h1).not.toBe(h2);
  });

  it("H2 — stale hash when Auth action set changes", () => {
    const a = hashPlanPayload({
      storageObjects: [{ bucket: "post-images", path: "a.webp" }],
      authTargets: [{ userId: "u1", action: "DELETE" }],
    });
    const b = hashPlanPayload({
      storageObjects: [{ bucket: "post-images", path: "a.webp" }],
      authTargets: [{ userId: "u1", action: "PRESERVE" }],
    });
    expect(a).not.toBe(b);
  });

  it("Auth plan — protected BLOCKED; safe manual.local DELETE; content preset PRESERVE", async () => {
    const protectedId = "admin-1";
    const safeId = "member-safe";
    const sb = {
      auth: {
        admin: {
          getUserById: async (id: string) => {
            if (id === safeId) {
              return { data: { user: { id, email: "qa1@manual.local" } }, error: null };
            }
            return { data: { user: { id, email: "real@example.com" } }, error: null };
          },
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    } as never;

    const memberPreset = await planPrelaunchResetAuthTargets(sb, {
      safeMemberIds: [protectedId, safeId, "member-real"],
      protectedIds: new Set([protectedId]),
      preset: "TEST_MEMBER_DATA",
      presetSpec: PRELAUNCH_RESET_PRESETS.TEST_MEMBER_DATA,
    });
    expect(memberPreset.find((t) => t.userId === protectedId)?.action).toBe("BLOCKED");
    expect(memberPreset.find((t) => t.userId === safeId)?.action).toBe("DELETE");
    expect(memberPreset.find((t) => t.userId === "member-real")?.action).toBe("BLOCKED");

    const contentPreset = await planPrelaunchResetAuthTargets(sb, {
      safeMemberIds: [safeId],
      protectedIds: new Set(),
      preset: "TEST_CONTENT_ONLY",
      presetSpec: PRELAUNCH_RESET_PRESETS.TEST_CONTENT_ONLY,
    });
    expect(contentPreset[0]?.action).toBe("PRESERVE");
  });

  it("S1/S2/A1/A2 — execute deletes planned storage+auth; unrelated path and current admin preserved", async () => {
    const removed: string[] = [];
    const deletedUsers: string[] = [];
    const actor = "current-admin";
    const targetUser = "safe-member";
    const targetPath = "safe/target.webp";
    const unrelatedPath = "other/keep.webp";

    const plan: PrelaunchResetPlan = {
      planId: "pr_test",
      preset: "TEST_MEMBER_DATA",
      selector: {
        memberIds: [targetUser],
        storeIds: [],
        contentIds: [],
        deliveryAdCampaignIds: [],
      },
      selectedScopes: ["members", "storage", "auth"],
      scopeImpact: [],
      resolved: [],
      protectedEntities: [],
      blockedEntities: [],
      warnings: [],
      blockers: [],
      counts: {
        members: 1,
        stores: 0,
        orders: 0,
        content: 0,
        ads: 0,
        messages: 0,
        notifications: 0,
        finance: 0,
        gift: 0,
        storage: 1,
        other: 0,
      },
      deleteSteps: [],
      storageSteps: [],
      storageObjects: [
        {
          bucket: "post-images",
          path: targetPath,
          sourceKind: "member",
          sourceId: targetUser,
          reference: "profiles.avatar_url",
        },
      ],
      authTargets: [
        {
          userId: targetUser,
          email: "qa1@manual.local",
          linkedEntity: `member:${targetUser}`,
          action: "DELETE",
          reason: "explicit_safe_manual_local_member",
        },
        {
          userId: actor,
          email: "admin@manual.local",
          linkedEntity: `member:${actor}`,
          action: "BLOCKED",
          reason: "protected_admin_or_current_user",
        },
      ],
      financialGuards: [],
      externalReferences: [],
      planHash: "hash",
      createdAt: new Date().toISOString(),
      createdBy: actor,
      environment: "local",
      executeAllowed: true,
      typedConfirmationPhrase: "RESET TEST DATA 2 hashxxxx",
    };

    vi.stubEnv("NEXT_PUBLIC_APP_DEPLOY_TIER", "local");
    vi.stubEnv("PRELAUNCH_RESET_ENABLED", "1");
    vi.stubEnv("NODE_ENV", "development");

    vi.doMock("@/lib/admin/prelaunch-reset/planner", () => ({
      revalidatePrelaunchResetPlan: async () => ({ ok: true as const, plan }),
      confirmationMatches: () => true,
      buildPrelaunchResetPlan: async () => plan,
    }));
    vi.doMock("@/lib/audit/append-audit-log", () => ({
      appendAuditLog: async () => undefined,
    }));

    const sb = {
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            for (const p of paths) removed.push(`${bucket}/${p}`);
            return { data: paths.map((name) => ({ name })), error: null };
          },
        }),
      },
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            deletedUsers.push(id);
            return { data: { user: null }, error: null };
          },
        },
      },
      from: () => ({
        delete: () => ({
          in: async () => ({ error: null, count: 0 }),
        }),
      }),
    };

    const { executePrelaunchReset } = await import("@/lib/admin/prelaunch-reset/execute");
    const result = await executePrelaunchReset({
      sb: sb as never,
      actorUserId: actor,
      preset: "TEST_MEMBER_DATA",
      selector: plan.selector,
      planId: plan.planId,
      expectedHash: plan.planHash,
      typedConfirmation: plan.typedConfirmationPhrase,
    });

    expect(result.overall).toBe("PASS");
    expect(removed).toContain(`post-images/${targetPath}`);
    expect(removed).not.toContain(`post-images/${unrelatedPath}`);
    expect(deletedUsers).toEqual([targetUser]);
    expect(deletedUsers).not.toContain(actor);
    expect(result.phases.find((p) => p.phase === "STORAGE")?.status).toBe("PASS");
    expect(result.phases.find((p) => p.phase === "AUTH")?.status).toBe("PASS");
  });

  it("source wiring — planner plans storageObjects/authTargets; no bucket wipe", () => {
    const planner = read("lib/admin/prelaunch-reset/planner.ts");
    const storageAuth = read("lib/admin/prelaunch-reset/storage-auth-plan.ts");
    expect(planner).toContain("planPrelaunchResetStorageObjects");
    expect(planner).toContain("planPrelaunchResetAuthTargets");
    expect(planner).toContain("storageObjects");
    expect(planner).toContain("authTargets");
    expect(storageAuth).not.toContain("listAll");
    expect(storageAuth).not.toContain("emptyBucket");
    expect(PRELAUNCH_RESET_HARD_LOCK.authUserDeleteDefaultForbidden).toBe(true);
  });
});
