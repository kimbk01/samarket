/**
 * R14 PRECHECK-B — setLiveRelease Owner Live eligibility (B-01..B-13).
 * Mocks Supabase at the service boundary; no Production Live mutation.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateOwnerLiveContentClass,
  OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
} from "@/lib/intro/live/owner-live-eligibility";
import { setLiveRelease } from "@/lib/intro/live/service";

const ROOT = process.cwd();
const USER = "11111111-1111-1111-1111-111111111111";
const REL_OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REL_QA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const DOC_OWNER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PACK = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type RevRow = {
  published_revision_id: string;
  pack_id: string | null;
  publish_state: string;
  source_draft_version: number;
  document_id: string | null;
};

type DocRow = {
  document_id: string;
  content_class: string | null;
};

type LiveRow = {
  singleton: boolean;
  live_kind: string;
  published_revision_id: string | null;
  pack_id: string | null;
};

function buildSb(opts: {
  rev?: RevRow | null;
  doc?: DocRow | null;
  liveBefore?: LiveRow;
  /** Capture upsert payloads */
  upserts?: unknown[];
}) {
  const liveState: LiveRow = opts.liveBefore ?? {
    singleton: true,
    live_kind: "NEVER_CONFIGURED",
    published_revision_id: null,
    pack_id: null,
  };
  const upserts = opts.upserts ?? [];

  const from = (table: string) => {
    if (table === "app_intro_revisions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.rev === undefined ? null : opts.rev,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "app_intro_documents") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.doc === undefined ? null : opts.doc,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "app_intro_live") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                live_kind: liveState.live_kind,
                published_revision_id: liveState.published_revision_id,
                pack_id: liveState.pack_id,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (payload: Record<string, unknown>) => {
          upserts.push(payload);
          liveState.live_kind = String(payload.live_kind);
          liveState.published_revision_id = payload.published_revision_id as string;
          liveState.pack_id = payload.pack_id as string;
          return { error: null };
        },
      };
    }
    if (table === "app_intro_packs") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                pack_id: PACK,
                manifest_integrity: "sha256:pack",
                storage_path: `authority/v1/packs/${PACK}/pack.json`,
                storage_bucket: "dibay-intro",
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "app_intro_sealed_assets") {
      return {
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      };
    }
    throw new Error(`unexpected_table:${table}`);
  };

  const storageFrom = () => ({
    createSignedUrl: async () => ({
      data: { signedUrl: "https://example.test/signed" },
      error: null,
    }),
    download: async () => ({
      data: {
        text: async () =>
          JSON.stringify({ schemaVersion: 14, integrity: "sha256:env", assets: {} }),
      },
      error: null,
    }),
  });

  return {
    sb: {
      from,
      storage: { from: storageFrom },
    } as unknown as Parameters<typeof setLiveRelease>[0],
    liveState,
    upserts,
  };
}

const ownerCommitted: RevRow = {
  published_revision_id: REL_OWNER,
  pack_id: PACK,
  publish_state: "COMMITTED",
  source_draft_version: 3,
  document_id: DOC_OWNER,
};

describe("PRECHECK-B owner-live-eligibility pure gate", () => {
  it("OWNER ok; QA/TEST/FIXTURE/SYSTEM/SYSTEM_BOOTSTRAP/unknown fail closed", () => {
    expect(evaluateOwnerLiveContentClass("OWNER").ok).toBe(true);
    for (const cls of [
      "QA",
      "TEST",
      "FIXTURE",
      "SYSTEM",
      "SYSTEM_BOOTSTRAP",
      "",
      null,
      undefined,
      1,
    ]) {
      const r = evaluateOwnerLiveContentClass(cls);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe(OWNER_LIVE_FORBIDDEN_CONTENT_CLASS);
      }
    }
    // Case-normalize only; persisted enum is OWNER.
    expect(evaluateOwnerLiveContentClass("owner").ok).toBe(true);
  });
});

describe("PRECHECK-B setLiveRelease B-01..B-13", () => {
  it("B-01 OWNER committed release can become Live", async () => {
    const { sb, upserts } = buildSb({
      rev: ownerCommitted,
      doc: { document_id: DOC_OWNER, content_class: "OWNER" },
    });
    const live = await setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER });
    expect(live.kind).toBe("LIVE");
    expect(upserts).toHaveLength(1);
  });

  it("B-02 QA committed release cannot become Owner Live", async () => {
    const { sb, upserts, liveState } = buildSb({
      rev: { ...ownerCommitted, published_revision_id: REL_QA },
      doc: { document_id: DOC_OWNER, content_class: "QA" },
      liveBefore: {
        singleton: true,
        live_kind: "COMMITTED_LIVE",
        published_revision_id: REL_OWNER,
        pack_id: PACK,
      },
    });
    await expect(
      setLiveRelease(sb, { releaseId: REL_QA, userId: USER }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(OWNER_LIVE_FORBIDDEN_CONTENT_CLASS),
      status: 403,
      code: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
    });
    expect(upserts).toHaveLength(0);
    expect(liveState.published_revision_id).toBe(REL_OWNER);
  });

  it("B-03 TEST/FIXTURE cannot become Owner Live", async () => {
    for (const cls of ["TEST", "FIXTURE"]) {
      const { sb, upserts } = buildSb({
        rev: ownerCommitted,
        doc: { document_id: DOC_OWNER, content_class: cls },
      });
      await expect(
        setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER }),
      ).rejects.toMatchObject({
        code: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
        status: 403,
      });
      expect(upserts).toHaveLength(0);
    }
  });

  it("B-04 SYSTEM_BOOTSTRAP / SYSTEM cannot become Owner Live", async () => {
    for (const cls of ["SYSTEM_BOOTSTRAP", "SYSTEM"]) {
      const { sb, upserts } = buildSb({
        rev: ownerCommitted,
        doc: { document_id: DOC_OWNER, content_class: cls },
      });
      await expect(
        setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER }),
      ).rejects.toMatchObject({ code: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS });
      expect(upserts).toHaveLength(0);
    }
  });

  it("B-05 uncommitted OWNER rejected", async () => {
    const { sb, upserts } = buildSb({
      rev: { ...ownerCommitted, publish_state: "DRAFT" },
      doc: { document_id: DOC_OWNER, content_class: "OWNER" },
    });
    await expect(
      setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER }),
    ).rejects.toThrow("release_not_committed");
    expect(upserts).toHaveLength(0);
  });

  it("B-06 nonexistent release rejected", async () => {
    const { sb, upserts } = buildSb({ rev: null });
    await expect(
      setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER }),
    ).rejects.toThrow("release_not_found");
    expect(upserts).toHaveLength(0);
  });

  it("B-07 caller-supplied OWNER cannot spoof persisted QA class", async () => {
    const { sb, upserts } = buildSb({
      rev: ownerCommitted,
      doc: { document_id: DOC_OWNER, content_class: "QA" },
    });
    await expect(
      setLiveRelease(sb, {
        releaseId: REL_OWNER,
        userId: USER,
        contentClass: "OWNER",
      }),
    ).rejects.toMatchObject({
      message: `${OWNER_LIVE_FORBIDDEN_CONTENT_CLASS}:QA`,
      code: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
    });
    expect(upserts).toHaveLength(0);
  });

  it("B-08 service-role QA caller rejected (same primitive; role not consulted)", async () => {
    // Domain gate does not inspect auth role — service_role client still fails closed.
    const { sb, upserts } = buildSb({
      rev: ownerCommitted,
      doc: { document_id: DOC_OWNER, content_class: "QA" },
    });
    const serviceRoleSb = sb; // stand-in for service_role client
    await expect(
      setLiveRelease(serviceRoleSb, { releaseId: REL_OWNER, userId: "service-role-qa" }),
    ).rejects.toMatchObject({ code: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS, status: 403 });
    expect(upserts).toHaveLength(0);
  });

  it("B-09 stale draftVersion rejected", async () => {
    const { sb, upserts } = buildSb({
      rev: ownerCommitted,
      doc: { document_id: DOC_OWNER, content_class: "OWNER" },
    });
    await expect(
      setLiveRelease(sb, {
        releaseId: REL_OWNER,
        userId: USER,
        expectedSourceDraftVersion: 99,
      }),
    ).rejects.toMatchObject({
      message: "stale_release_for_current_draft",
      status: 409,
    });
    expect(upserts).toHaveLength(0);
  });

  it("B-10 canonical Apply still calls setLiveRelease after OWNER gate", () => {
    const applySrc = readFileSync(join(ROOT, "lib/intro/live/apply-service.ts"), "utf8");
    const gateIdx = applySrc.indexOf(
      "throw new Error(`apply_forbidden_content_class:${contentClass}`)",
    );
    const liveIdx = applySrc.indexOf("await setLiveRelease");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(liveIdx).toBeGreaterThan(gateIdx);
    const serviceSrc = readFileSync(join(ROOT, "lib/intro/live/service.ts"), "utf8");
    expect(serviceSrc).toContain("evaluateOwnerLiveContentClass");
    expect(serviceSrc).toContain("ownerLiveForbiddenError");
  });

  it("B-11 failed unauthorized promotion leaves prior Live unchanged", async () => {
    const { sb, upserts, liveState } = buildSb({
      rev: ownerCommitted,
      doc: { document_id: DOC_OWNER, content_class: "QA" },
      liveBefore: {
        singleton: true,
        live_kind: "COMMITTED_LIVE",
        published_revision_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        pack_id: PACK,
      },
    });
    const prior = liveState.published_revision_id;
    await expect(
      setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER }),
    ).rejects.toMatchObject({ code: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS });
    expect(upserts).toHaveLength(0);
    expect(liveState.published_revision_id).toBe(prior);
    expect(liveState.live_kind).toBe("COMMITTED_LIVE");
  });

  it("B-12 retry/idempotency still holds (OWNER re-set same release)", async () => {
    const { sb, upserts } = buildSb({
      rev: ownerCommitted,
      doc: { document_id: DOC_OWNER, content_class: "OWNER" },
      liveBefore: {
        singleton: true,
        live_kind: "COMMITTED_LIVE",
        published_revision_id: REL_OWNER,
        pack_id: PACK,
      },
    });
    const a = await setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER });
    const b = await setLiveRelease(sb, { releaseId: REL_OWNER, userId: USER });
    expect(a.kind).toBe("LIVE");
    expect(b.kind).toBe("LIVE");
    expect(upserts).toHaveLength(2);
  });

  it("B-13 no alternate product writer bypasses canonical guard", () => {
    const writers: string[] = [];
    const scanRoots = [
      "lib",
      "app",
      "scripts",
      "components",
    ];
    const skipDir = new Set([
      "node_modules",
      ".tmp",
      ".git",
      "dist",
      ".next",
      "android",
      "ios",
    ]);

    function walk(dir: string) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (skipDir.has(name)) continue;
        const p = join(dir, name);
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx|js|mjs)$/.test(name)) continue;
        if (p.includes("/__tests__/") || p.includes(".test.")) continue;
        if (p.includes("owner-live-eligibility-set-live")) continue;
        const src = readFileSync(p, "utf8");
        if (
          /from\([`'"]app_intro_live[`'"]\)/.test(src) &&
          /\.(upsert|insert|update)\(/.test(src)
        ) {
          writers.push(p.replace(ROOT + "/", ""));
        }
      }
    }
    for (const r of scanRoots) walk(join(ROOT, r));

    // Sole mutation writer must be lib/intro/live/service.ts setLiveRelease
    expect(writers).toEqual(["lib/intro/live/service.ts"]);

    const serviceSrc = readFileSync(join(ROOT, "lib/intro/live/service.ts"), "utf8");
    expect(serviceSrc).toContain("evaluateOwnerLiveContentClass");

    // Admin independent Live set route retired
    const liveSet = readFileSync(
      join(ROOT, "app/api/admin/intro/live/set/route.ts"),
      "utf8",
    );
    expect(liveSet).not.toContain("setLiveRelease");
    expect(liveSet).toContain("live_set_retired");

    // Obsolete 13th QA must not call setLiveRelease
    for (const qa of [
      "scripts/qa/intro-13th-v1-prove-live.ts",
      "scripts/qa/intro-13th-forensic-publish-apply-1scene.test.ts",
      "scripts/qa/intro-13th-owner-grand-opening.test.ts",
    ]) {
      const src = readFileSync(join(ROOT, qa), "utf8");
      expect(src).not.toMatch(/await\s+setLiveRelease\s*\(/);
      expect(src).toMatch(/OBSOLETE_13TH_QA|LIVE_MUTATION_RETIRED/);
    }
  });
});

// silence unused vi import if tree-shaken differently
void vi;
