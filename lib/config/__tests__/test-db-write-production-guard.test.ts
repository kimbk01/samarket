/**
 * C-48 — every real-DB writer test / QA script must refuse a Production target by project ref
 * (actual URL host), never by env var name.
 *
 * - vitest DB writers + Playwright service-role clients → `assertNonProductionDbTarget`
 *   (tests/helpers/assert-non-production-db-target.ts → lib/admin/data-reset/database-target-guard.ts)
 * - Playwright specs that mutate through the app → `assertPlaywrightMutationTargetNonProduction`
 * - Node QA scripts → `assertQaWriteTarget` / `resolveQaWriteTarget` (scripts/lib/db-target-guard.mjs, F-13)
 * - Node QA scripts that mutate through a live app over HTTP (no DB credentials) →
 *   `assertQaHttpWriteTarget(<base URL>)` (same module; decided by the request URL host)
 *
 * (a) unit-tests the test helper, (b) statically scans the repo so a new writer cannot skip the guard.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertNonProductionDbTarget,
  assertPlaywrightMutationTargetNonProduction,
  collectLocalAppSupabaseUrls,
} from "@/tests/helpers/assert-non-production-db-target";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";

const ROOT = process.cwd();
const PROD = "ckdosyydvgzqwpbwuhon";
const OTHER = "abcdefghijklmnopqrst";

describe("assertNonProductionDbTarget", () => {
  it("Production ref → throws", () => {
    expect(() => assertNonProductionDbTarget(`https://${PROD}.supabase.co`)).toThrow(/database_target_production/);
    expect(() => assertNonProductionDbTarget(`https://${PROD}.supabase.co/rest/v1`)).toThrow(/REFUSING/);
  });

  it("userinfo / prefix tricks are classified by the real host", () => {
    expect(() => assertNonProductionDbTarget(`http://localhost@${PROD}.supabase.co`)).toThrow(/production/);
    expect(() =>
      assertNonProductionDbTarget(`http://localhost@${PROD}.supabase.co`, { loopbackOnly: true })
    ).toThrow(/REFUSING/);
  });

  it("unknown / custom host, unparsable and missing → throws (fail-closed)", () => {
    expect(() => assertNonProductionDbTarget("https://db.example.com")).toThrow(/unrecognized_host/);
    expect(() => assertNonProductionDbTarget("https://api.dibay.app")).toThrow(/REFUSING/);
    expect(() => assertNonProductionDbTarget("not a url")).toThrow(/unparsable/);
    expect(() => assertNonProductionDbTarget("")).toThrow(/missing/);
    expect(() => assertNonProductionDbTarget(undefined)).toThrow(/missing/);
  });

  it("env var names do not matter — only the URL value", () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    try {
      expect(() => assertNonProductionDbTarget(`https://${PROD}.supabase.co`)).toThrow();
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });

  it("loopback and a non-Production ref → ok", () => {
    expect(assertNonProductionDbTarget("http://127.0.0.1:54321").reason).toBe("database_target_loopback");
    expect(assertNonProductionDbTarget("http://localhost:54399").target).toBe("non_production");
    expect(assertNonProductionDbTarget("http://[::1]:54321").target).toBe("non_production");
    expect(assertNonProductionDbTarget(`https://${OTHER}.supabase.co`).projectRef).toBe(OTHER);
  });

  it("loopbackOnly rejects a remote non-Production ref", () => {
    expect(() => assertNonProductionDbTarget(`https://${OTHER}.supabase.co`, { loopbackOnly: true })).toThrow(
      /loopback database required/
    );
    expect(assertNonProductionDbTarget("http://localhost:54321", { loopbackOnly: true }).target).toBe(
      "non_production"
    );
  });

  it("DATA_RESET_PRODUCTION_SUPABASE_REFS can only add Production refs", () => {
    const prev = process.env.DATA_RESET_PRODUCTION_SUPABASE_REFS;
    process.env.DATA_RESET_PRODUCTION_SUPABASE_REFS = OTHER;
    try {
      expect(() => assertNonProductionDbTarget(`https://${OTHER}.supabase.co`)).toThrow(/production/);
      expect(() => assertNonProductionDbTarget(`https://${PROD}.supabase.co`)).toThrow(/production/);
    } finally {
      if (prev === undefined) delete process.env.DATA_RESET_PRODUCTION_SUPABASE_REFS;
      else process.env.DATA_RESET_PRODUCTION_SUPABASE_REFS = prev;
    }
  });
});

describe("assertPlaywrightMutationTargetNonProduction", () => {
  let dir = "";
  let prevUrl: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pw-guard-"));
    prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  });

  it("Production app host → throws", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(() => assertPlaywrightMutationTargetNonProduction("https://samarket.vercel.app", dir)).toThrow(
      /Production app host/
    );
  });

  it("non-loopback app host (Preview etc.) → throws (DB unverifiable)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(() => assertPlaywrightMutationTargetNonProduction("https://samarket-git-x.vercel.app", dir)).toThrow(
      /not loopback/
    );
  });

  it("loopback app wired to Production in .env.local → throws", () => {
    writeFileSync(join(dir, ".env.local"), `NEXT_PUBLIC_SUPABASE_URL="https://${PROD}.supabase.co"\n`);
    expect(() => assertPlaywrightMutationTargetNonProduction("http://localhost:3000", dir)).toThrow(/production/);
  });

  it("process env local but a Next env file Production → throws (every source checked)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    writeFileSync(join(dir, ".env"), `NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co\n`);
    expect(collectLocalAppSupabaseUrls(dir).map((s) => s.source)).toEqual(["process.env", ".env"]);
    expect(() => assertPlaywrightMutationTargetNonProduction("http://127.0.0.1:3000", dir)).toThrow(/production/);
  });

  it("loopback app without any Supabase URL → throws", () => {
    expect(() => assertPlaywrightMutationTargetNonProduction("http://localhost:3000", dir)).toThrow(/missing/);
  });

  it("loopback app on local Supabase / non-Production ref → ok", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(() => assertPlaywrightMutationTargetNonProduction("http://localhost:3000", dir)).not.toThrow();
    writeFileSync(join(dir, ".env.local"), `NEXT_PUBLIC_SUPABASE_URL=https://${OTHER}.supabase.co\n`);
    expect(() => assertPlaywrightMutationTargetNonProduction("http://127.0.0.1:3020", dir)).not.toThrow();
  });
});

// ———————————————————————— static repo scan ————————————————————————

const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && existsSync(resolve(ROOT, f)));

/** vitest suites + Playwright service-role clients that write to a real Supabase / PostgREST. */
const TEST_DB_WRITERS = [
  "lib/promotion/__tests__/community-paid-exposure-runtime.e2e.test.ts",
  "lib/community-operator-import/__tests__/bplus-e2e.staging.test.ts",
  "lib/push/dispatch/__tests__/a-web-isolated-integration.staging.test.ts",
  "tests/e2e/member-feed-ad-banner-ui.spec.ts",
  "tests/e2e/revenue-final-regression-gate.spec.ts",
  "tests/e2e/community-import-admin.staging.spec.ts",
  "tests/e2e/community-import-diagnose.staging.spec.ts",
  "tests/e2e/community-import-sites.staging.spec.ts",
];

/** Playwright specs that create / update / delete / send / apply through the app under test. */
const PLAYWRIGHT_MUTATION_SPECS = [
  "tests/e2e/member-feed-ad-banner-ui.spec.ts",
  "tests/e2e/revenue-final-regression-gate.spec.ts",
  "tests/e2e/trade-category-form-runtime-closure.spec.ts",
  "tests/e2e/community-ia-runtime-cases.spec.ts",
  "tests/e2e/business-ops-browser-final-close.spec.ts",
  "tests/e2e/community-messenger-call-smoke.spec.ts",
  "tests/e2e/community-messenger-call-terminal-flows.spec.ts",
  "tests/e2e/cm-room-qa-pass.spec.ts",
  "tests/e2e/bootstrap-structure-verification.spec.ts",
  "tests/e2e/messenger-scenario-perf-capture.spec.ts",
  "tests/e2e/trade-c2c-perf-baseline-capture.spec.ts",
  "tests/e2e/i18n-my-profile-language.spec.ts",
  "tests/e2e/community-import-admin.staging.spec.ts",
  "tests/e2e/community-import-diagnose.staging.spec.ts",
  "tests/e2e/community-import-sites.staging.spec.ts",
];

/** Node QA / runtime-proof scripts outside the F-13 financial set that write with service role / pg. */
const SCRIPT_DB_WRITERS = [
  "scripts/qa/admin-campaign-android-image-runtime.mjs",
  "scripts/qa/admin-campaign-d1-idempotency-runtime.mjs",
  "scripts/qa/admin-campaign-repeat-probe.mjs",
  "scripts/qa/admin-campaign-runtime-gates.mjs",
  "scripts/qa/admin-finance-data-contract-stores-outstanding.mjs",
  "scripts/qa/admin-finance-product-ui-r1-r6-visual.mjs",
  "scripts/qa/admin-settlement-cash-reject-runtime.mjs",
  "scripts/qa/admin-settlement-ops-close.mjs",
  "scripts/qa/admin-settlement-ops-runtime.mjs",
  "scripts/qa/admin-settlement-point-runtime.mjs",
  "scripts/qa/ads-r2-creative-registration-production-proof.mjs",
  "scripts/qa/ads-r4-operations-control-production-proof.mjs",
  "scripts/qa/app-icon-case-c-product-logout.mjs",
  "scripts/qa/community-operator-import-phase-f-production-e2e.mjs",
  "scripts/qa/customer-center-board-ui-prod-runtime.mjs",
  "scripts/qa/feed-banner-r6-fixture-20260810.mjs",
  "scripts/qa/gift-u3-1-accept-readback-runtime.mjs",
  "scripts/qa/group-chat-p0-adb-qa.mjs",
  "scripts/qa/image-platform-production-http-e2e.mjs",
  "scripts/qa/kakao-open-call-block-policy-qa.mjs",
  "scripts/qa/member-admin-full-ssot-l4.mjs",
  "scripts/qa/mypage-store-entry-cold-runtime.mjs",
  "scripts/qa/owner-gift-care-ux-final-proof.mjs",
  "scripts/qa/owner-store-os-native-runtime-proof.mjs",
  "scripts/qa/owner-store-os-order-finance-surfaces-proof.mjs",
  "scripts/qa/owner-store-os-orders-complete-process-proof.mjs",
  "scripts/qa/owner-store-os-product-complete-process-proof.mjs",
  "scripts/qa/owner-store-os-product-lifecycle-proof.mjs",
  "scripts/qa/owner-store-os-store-dashboard-customer-proof.mjs",
  "scripts/qa/ptr-reveal-restricted-activate-verify.mjs",
  "scripts/qa/stores-discovery-scale-cut5-backfill-shadow-proof.mts",
  "scripts/badge-lifecycle-transition-runtime.ts",
  "scripts/ensure-e2e-aaaa-manual-auth.mjs",
  "scripts/native-cold-resume-surface-gate.ts",
  "scripts/pds1-prod-deploy-sync-verify.mjs",
  "scripts/perf/cm-r15-row-not-found-fixture-validate.mjs",
  "scripts/perf/cm-r16-row-not-found-harness-validate.mjs",
  "scripts/phase-b-price-offer-mixed-product-gate.ts",
  "scripts/room-unread-authority-runtime-matrix.mjs",
  "scripts/runtime-business-ops-step56-qa.ts",
  "scripts/verify-cm-bootstrap-lite-bundle-active-membership.mjs",
  "scripts/verify-p4-call-heartbeat-remote.mjs",
];

/** Isolated-local-DB scripts: resolver result must be loopback (shared F-13 resolver, by URL host). */
const LOOPBACK_ONLY_SCRIPTS = [
  "scripts/staging-e2e/seed-ui-admin.mjs",
  "scripts/qa/stores-discovery-scale-cut7-100k-planner-proof.mjs",
];

const CLIENT_RE = /createClient\(|new\s+PostgrestClient\(|new\s+(?:pg\.)?(?:Client|Pool)\(|spawnSync\(\s*PSQL/;
const CRED_RE =
  /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|DIBAY_INTEG_JWT|DATABASE_URL|SUPABASE_DB_URL|SUPABASE_POOLER_URL/;
/** Read-only RPC name shapes (snapshots, counts, predicates). Anything else is treated as a writer. */
const READ_RPC =
  /^(?:get_|count_|list_|search_|resolve_|is_|has_|can_|check_|community_messenger_bootstrap|gift_certificate_instance_allows_checkout_store|gift_certificate_store_revenue_available|dibay_cm_canonical_unread_count|store_discovery_coverage_origin_covered)/;

function hasDbWrite(src: string): boolean {
  for (const seg of src.split(/(?=\.from\()/)) {
    if (!seg.startsWith(".from(")) continue;
    if (/\.(insert|update|upsert|delete)\(/.test(seg.slice(0, 600))) return true;
  }
  if (/auth\.admin\.(?:createUser|updateUserById|deleteUser)\(/.test(src)) return true;
  if (/\b(?:INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?[a-z_]+/i.test(src)) return true;
  if (/\bUPDATE\s+(?:public\.)?[a-z_]+\s+SET\b/i.test(src)) return true;
  for (const m of src.matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g)) if (!READ_RPC.test(m[1])) return true;
  return /\b(?:creditUserPoints|apply[A-Z]\w*)\(\s*sb\b/.test(src);
}

const firstClientIndex = (src: string) => {
  const i = src.search(CLIENT_RE);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
};

function isTestFile(rel: string): boolean {
  return (
    /\.(test|spec)\.(ts|tsx|mts|js|mjs|cjs)$/.test(rel) ||
    /(^|\/)__tests__\//.test(rel) ||
    rel.startsWith("tests/") ||
    rel.startsWith("e2e/")
  );
}

/** Script names that are tests / QA / runtime proofs (operational apply/backfill/seed tools are not). */
function isQaLikeScript(rel: string): boolean {
  if (!/^scripts\/.*\.(mjs|mts|ts|js|cjs)$/.test(rel) || /\/lib\//.test(rel) || /\/__tests__\//.test(rel)) {
    return false;
  }
  if (rel.startsWith("scripts/qa/") || rel.startsWith("scripts/perf/") || rel.startsWith("scripts/staging-e2e/")) {
    return true;
  }
  const name = basename(rel);
  if (/^(apply|backfill|seed|fix|publish|realign|import|generate|add|refresh)-/.test(name)) return false;
  // Operational Production data tools (backfill / migration apply) are not tests.
  if (/(backfill|migration)/.test(name)) return false;
  return /(runtime|e2e|proof|qa|harness|fixture|gate|smoke|probe|verify|matrix|signoff)/.test(name);
}

describe("C-48 static: real-DB writer tests reference the shared guard", () => {
  it("helper delegates to the database-target-guard SSOT (no own ref list / bypass)", () => {
    const src = read("tests/helpers/assert-non-production-db-target.ts");
    expect(src).toContain('from "@/lib/admin/data-reset/database-target-guard"');
    expect(src).toContain("resolveDataResetDatabaseTarget(");
    expect(src).not.toMatch(/[a-z0-9]{20}\.supabase/);
    expect(src).not.toContain(PROD);
    expect(src).not.toMatch(/ALLOW_PROD|FORCE|BYPASS|SKIP_GUARD|OVERRIDE|I_KNOW/i);
  });

  it("listed vitest / Playwright DB writers call assertNonProductionDbTarget before creating a client", () => {
    const offenders = TEST_DB_WRITERS.filter((rel) => {
      const src = read(rel);
      const call = src.search(/assertNonProductionDbTarget\(/);
      return call < 0 || call > firstClientIndex(src);
    });
    expect(offenders).toEqual([]);
    for (const rel of TEST_DB_WRITERS) expect(read(rel)).not.toContain(PROD);
  });

  it("listed Playwright mutation specs install the base-URL guard for every test", () => {
    const offenders = PLAYWRIGHT_MUTATION_SPECS.filter(
      (rel) => !read(rel).includes("test.beforeAll(() => assertPlaywrightMutationTargetNonProduction());")
    );
    expect(offenders).toEqual([]);
  });

  it("listed QA scripts call assertQaWriteTarget() before any client", () => {
    const offenders = SCRIPT_DB_WRITERS.filter((rel) => {
      const src = read(rel);
      if (!/import\s*\{[^}]*\bassertQaWriteTarget\b[^}]*\}\s*from\s*["'][./]+(?:lib\/)?db-target-guard\.mjs["']/.test(src)) {
        return true;
      }
      const call = src.indexOf("assertQaWriteTarget();");
      return call < 0 || call > firstClientIndex(src);
    });
    expect(offenders).toEqual([]);
  });

  it("loopback-only scripts classify via resolveQaWriteTarget before any client", () => {
    const offenders = LOOPBACK_ONLY_SCRIPTS.filter((rel) => {
      const src = read(rel);
      const call = src.indexOf("resolveQaWriteTarget(");
      return call < 0 || !src.includes('target !== "loopback"') || call > firstClientIndex(src);
    });
    expect(offenders).toEqual([]);
  });

  it("glob: any test file with a service-role credential + real client + write references the guard", () => {
    const offenders = tracked.filter((rel) => {
      if (!isTestFile(rel) || !/\.(ts|tsx|mts|mjs|js|cjs)$/.test(rel)) return false;
      if (rel === "lib/config/__tests__/test-db-write-production-guard.test.ts") return false;
      const src = read(rel);
      if (!CRED_RE.test(src) || !CLIENT_RE.test(src) || !hasDbWrite(src)) return false;
      return !src.includes("assertNonProductionDbTarget") && !src.includes("assertQaWriteTarget");
    });
    expect(offenders).toEqual([]);
  });

  it("glob: any QA-like script with a DB credential + real client + write references db-target-guard", () => {
    const offenders = tracked.filter((rel) => {
      if (!isQaLikeScript(rel)) return false;
      const src = read(rel);
      if (!CRED_RE.test(src) || !CLIENT_RE.test(src) || !hasDbWrite(src)) return false;
      return !/db-target-guard\.mjs["']/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("no hard-coded Production pooler / URL default in guarded writers", () => {
    const offenders = [...SCRIPT_DB_WRITERS, ...LOOPBACK_ONLY_SCRIPTS, ...TEST_DB_WRITERS].filter((rel) =>
      new RegExp(`postgres\\.${PROD}|//${PROD}\\.supabase\\.co(?!/storage/v1/object/public)`).test(read(rel))
    );
    expect(offenders).toEqual([]);
  });
});

// ———————————————————————— HTTP-mutating QA scripts ————————————————————————

type HttpGuardModule = {
  QA_GUARD_PRODUCTION_SITE_ORIGIN: string;
  QA_GUARD_PRODUCTION_APP_HOSTS: readonly string[];
  resolveQaHttpWriteTarget: (
    baseUrl: string | undefined,
    env: Record<string, string | undefined>,
    localHosts?: Iterable<string>
  ) => { ok: true; host: string; target: string } | { ok: false; host: string; reason: string };
};
/** Runtime import keeps the plain .mjs out of the TS composite project graph (same as F-13 test). */
let httpGuard: HttpGuardModule;
beforeAll(async () => {
  httpGuard = (await import(
    /* @vite-ignore */ pathToFileURL(resolve(ROOT, "scripts/lib/db-target-guard.mjs")).href
  )) as HttpGuardModule;
});
const resolveQaHttpWriteTarget: HttpGuardModule["resolveQaHttpWriteTarget"] = (...a) =>
  httpGuard.resolveQaHttpWriteTarget(...a);

describe("resolveQaHttpWriteTarget (HTTP QA write target, by URL host)", () => {
  const localDb = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
  const prodDb = { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` };

  it("Production origin constant matches the app SSOT", () => {
    expect(httpGuard.QA_GUARD_PRODUCTION_SITE_ORIGIN).toBe(DIBAY_PRODUCTION_SITE_ORIGIN);
    expect(httpGuard.QA_GUARD_PRODUCTION_APP_HOSTS).toContain(new URL(DIBAY_PRODUCTION_SITE_ORIGIN).hostname);
  });

  it("Production app hosts → refused (also userinfo tricks / subdomains)", () => {
    for (const u of [
      DIBAY_PRODUCTION_SITE_ORIGIN,
      `${DIBAY_PRODUCTION_SITE_ORIGIN}/api/me/store-orders`,
      "http://localhost@samarket.vercel.app",
      "https://dibay.app",
      "https://www.dibay.app",
    ]) {
      const r = resolveQaHttpWriteTarget(u, localDb, []);
      expect(r.ok, u).toBe(false);
      expect(r.ok ? "" : r.reason).toMatch(/Production app host/);
    }
  });

  it("Preview / LAN / custom / missing / unparsable hosts → refused (database unverifiable)", () => {
    for (const u of ["https://samarket-git-x.vercel.app", "http://192.168.100.123:3010", "https://qa.example.com", "", "nope"]) {
      expect(resolveQaHttpWriteTarget(u, localDb, []).ok, u).toBe(false);
    }
    expect(resolveQaHttpWriteTarget(undefined, localDb, []).ok).toBe(false);
  });

  it("Supabase host → ref rules (Production refused, allowlisted non-Production ok)", () => {
    expect(resolveQaHttpWriteTarget(`https://${PROD}.supabase.co/rest/v1/x`, localDb, []).ok).toBe(false);
    expect(resolveQaHttpWriteTarget(`https://${OTHER}.supabase.co`, localDb, []).ok).toBe(false);
    expect(resolveQaHttpWriteTarget("https://gczyogboohpixpurckkg.supabase.co", localDb, []).ok).toBe(true);
  });

  it("loopback / this machine's own IP → ok only when the local app DB is non-Production", () => {
    expect(resolveQaHttpWriteTarget("http://127.0.0.1:3000", localDb, []).ok).toBe(true);
    expect(resolveQaHttpWriteTarget("http://localhost:3017", localDb, []).ok).toBe(true);
    expect(resolveQaHttpWriteTarget("http://192.168.1.7:3010", localDb, ["192.168.1.7"]).ok).toBe(true);
    expect(resolveQaHttpWriteTarget("http://127.0.0.1:3000", prodDb, []).ok).toBe(false);
    expect(resolveQaHttpWriteTarget("http://192.168.1.7:3010", prodDb, ["192.168.1.7"]).ok).toBe(false);
    expect(resolveQaHttpWriteTarget("http://localhost:3000", {}, []).ok).toBe(false);
  });

  it("guard source has no bypass switch", () => {
    const src = read("scripts/lib/db-target-guard.mjs");
    expect(src).not.toMatch(/ALLOW_PROD|FORCE|BYPASS|SKIP_GUARD|OVERRIDE|I_KNOW/i);
  });
});

/**
 * Mutating HTTP call shapes: fetch / page.request / in-page fetch options with a write method,
 * helper calls taking a literal write method (`apiJson(cookie, "POST", "/api/…")`), and
 * `<request|api|ctx|…>.post/put/patch/delete(`.
 */
const HTTP_MUTATION_RES = [
  /\bmethod["']?\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/gi,
  /\w\(\s*(?:[\w.]+\s*,\s*)?["'`](?:POST|PUT|PATCH|DELETE|post|put|patch|delete)["'`]\s*,\s*[`"'/\w$]/g,
  /\b\w*(?:request|Request|api|Api|req|Req|ctx|context|axios|http)\.(?:post|put|patch|delete)\(/g,
];

/** Scripts whose only write-method requests are login / logout / read RPC (no data mutation). */
const HTTP_NON_MUTATING_EXEMPT: Record<string, RegExp> = {
  "scripts/measure-bottom-nav-confirm-immediacy.mjs": /\/api\/test-login/,
  "scripts/measure-font-performance.mjs": /\/api\/test-login/,
  "scripts/perf/r2-m11-suspense-release-capture-once.mjs": /\/api\/test-login/,
  "scripts/verify-cm-room-composer-visible.mjs": /\/api\/test-login/,
  "scripts/apply-community-seed-and-trade-room.mjs": /\/api\/test-login/,
  "scripts/qa/notification-p0-apk-b-login.mjs": /\/api\/auth\/logout/,
  "scripts/measure-store-detail-infrastructure.mjs": /\/rest\/v1\/rpc\/get_store_popular_product_stats/,
};

function httpMutationIndexes(src: string): number[] {
  const out: number[] = [];
  for (const re of HTTP_MUTATION_RES) for (const m of src.matchAll(re)) out.push(m.index ?? 0);
  return out.sort((a, b) => a - b);
}

const httpScriptCandidates = tracked.filter(
  (rel) =>
    /^(?:scripts|\.qa-logs)\/.*\.(?:mjs|mts|ts|js|cjs)$/.test(rel) &&
    !/(^|\/)lib\//.test(rel) &&
    !/\/__tests__\//.test(rel)
);

describe("C-48 static: HTTP-mutating QA scripts call assertQaHttpWriteTarget before any request", () => {
  it("exempt scripts only send login / logout / read-RPC write-method requests", () => {
    const offenders: string[] = [];
    for (const [rel, allowed] of Object.entries(HTTP_NON_MUTATING_EXEMPT)) {
      const src = read(rel);
      const lines = src.split("\n");
      for (const idx of httpMutationIndexes(src)) {
        const ln = src.slice(0, idx).split("\n").length;
        if (!allowed.test(lines.slice(Math.max(0, ln - 6), ln + 2).join("\n"))) offenders.push(`${rel}:${ln}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("glob: every script with a mutating HTTP request imports and calls the guard first", () => {
    const mutating = httpScriptCandidates.filter(
      (rel) => !(rel in HTTP_NON_MUTATING_EXEMPT) && httpMutationIndexes(read(rel)).length > 0
    );
    // Inventory floor: the C-48 pass guarded 113 scripts — a shrinking match set means the detector broke.
    expect(mutating.length).toBeGreaterThanOrEqual(113);
    const offenders = mutating.filter((rel) => {
      const src = read(rel);
      const imported =
        /import\s*\{[^}]*\bassertQaHttpWriteTarget\b[^}]*\}\s*from\s*["'][./]+(?:scripts\/)?(?:lib\/)?db-target-guard\.mjs["']/.test(
          src
        ) || /const\s*\{\s*assertQaHttpWriteTarget\s*\}\s*=\s*require\(\s*["'][./]+lib\/db-target-guard\.mjs["']\s*\)/.test(src);
      const call = src.search(/\bassertQaHttpWriteTarget\(\s*(?:[A-Za-z_]\w*|"https?:\/\/[^"]+")\s*\)/);
      return !imported || call < 0 || call > httpMutationIndexes(src)[0];
    });
    expect(offenders).toEqual([]);
  });
});

describe("C-48 static: guarded HTTP QA scripts default to a non-Production origin", () => {
  const PROD_HOST_RE = /samarket\.vercel\.app|dibay\.app/;

  /** Declaration of the guarded identifier — same file, else an `export const` in a relative import. */
  function guardedOriginDecl(rel: string, src: string, id: string): string | null {
    const declRe = new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${id}\\s*=[\\s\\S]*?;`);
    const own = src.match(declRe);
    if (own) return own[0];
    for (const m of src.matchAll(/from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const dep = resolve(ROOT, rel, "..", m[1]);
      if (!existsSync(dep)) continue;
      const hit = readFileSync(dep, "utf8").match(new RegExp(`export\\s+(?:const|let|var)\\s+${id}\\s*=[\\s\\S]*?;`));
      if (hit) return hit[0];
    }
    return null;
  }

  it("every assertQaHttpWriteTarget(<origin>) expression has no Production host default", () => {
    const guarded = httpScriptCandidates.filter((rel) => /\bassertQaHttpWriteTarget\(/.test(read(rel)));
    expect(guarded.length).toBeGreaterThanOrEqual(113);
    const offenders: string[] = [];
    for (const rel of guarded) {
      const src = read(rel);
      for (const m of src.matchAll(/\bassertQaHttpWriteTarget\(\s*([^)]*?)\s*\)/g)) {
        const arg = m[1];
        if (/^["'`]/.test(arg)) {
          if (PROD_HOST_RE.test(arg)) offenders.push(`${rel}: ${arg}`);
          continue;
        }
        const decl = guardedOriginDecl(rel, src, arg);
        if (decl === null) offenders.push(`${rel}: ${arg} (declaration not found)`);
        else if (PROD_HOST_RE.test(decl)) offenders.push(`${rel}: ${decl.replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Playwright UI-action writers (no write-method HTTP in code — the app mutates on Save / Submit /
 * Approve / upload / call) are invisible to the HTTP detector above, so they are pinned by name.
 */
describe("C-48 static: Playwright UI-action QA scripts against a live app", () => {
  /** Scripts whose UI actions commit server state → must call assertQaHttpWriteTarget before any navigation. */
  const UI_WRITE_SCRIPTS = [
    ".qa-logs/v4-video-runtime-readonly-qa.mjs", // places real 1:1 video calls (Video call CTA → dial → accept/end)
    "scripts/qa/community-operator-import-phase-f-production-e2e.mjs", // 적용 / 게시 / 임시저장
    "scripts/qa/owner-store-os-product-lifecycle-proof.mjs", // product create (setInputFiles) / Save / sold-out
    "scripts/qa/owner-store-os-product-save-debug.mjs", // new product Save
    "scripts/qa/stores-w-campaign-admin-cta-production-e2e.ts", // campaign Create / Save / Deactivate
    "scripts/qa/stores-w-campaign-real-ui-first-divergence.ts", // campaign Create / Save
  ];

  /**
   * Production-default UI scripts verified READ_ONLY: navigation, tabs, sheets/drawers, login/logout,
   * typing without submit, and destructive CTAs opened only to inspect the confirm dialog and cancelled.
   */
  const UI_READ_ONLY_SCRIPTS = [
    ".qa-logs/mypage-cold-network-initiator-qa.mjs",
    ".qa-logs/mypage-runtime-product-pass-qa.mjs",
    "scripts/qa/admin-aro-ops-ux-001-w1-prod-light.mjs",
    "scripts/qa/admin-aro-ops-ux-001-w2-prod-light.mjs",
    "scripts/qa/admin-aro-ops-ux-002-b1-prod-light.mjs",
    "scripts/qa/admin-aro-ops-ux-002-b1r-prod-light.mjs",
    "scripts/qa/admin-aro-ops-ux-002-b8-remaining-prod-light.mjs",
    "scripts/qa/admin-aro-ops-ux-002-b9-chat-dialog-reproof.mjs",
    "scripts/qa/admin-aro-ops-ux-002-b9-physical-tablet.mjs",
    "scripts/qa/admin-aro-ops-ux-002-b9-web-viewport.mjs",
    "scripts/qa/admin-aro-ops-ux-002-final-readiness.mjs",
    "scripts/qa/admin-member-r3-detail-control-center-production.mjs",
    "scripts/qa/admin-member-r4-production.mjs",
    "scripts/qa/ads-r2-creative-registration-production-proof.mjs",
    "scripts/qa/ads-r3-approval-control-production-proof.mjs",
    "scripts/qa/ads-r4-operations-control-production-proof.mjs",
    "scripts/qa/app-icon-case-c-product-logout.mjs",
    "scripts/qa/delivery-featured-first-frame-landing-audit.mjs",
    "scripts/qa/delivery-featured-focus-entry-gate.mjs",
    "scripts/qa/form-keyboard-device-matrix.mjs",
    "scripts/qa/form-keyboard-oneshot-community.mjs",
    "scripts/qa/notification-p0-apk-b-login.mjs",
    "scripts/qa/owner-store-os-drawer-behavioral-proof.mjs",
    "scripts/qa/owner-store-os-responsive-behavioral-proof.mjs",
    "scripts/qa/safe-area-device-qa.mjs",
    "scripts/qa/slice11-product-runtime-regression.mjs",
  ];

  /** Known non-committing write-labelled clicks (no cancel step) — reason in the comment. */
  const UI_READ_ONLY_ALLOWED_CLICK: Record<string, RegExp> = {
    // ads-register-cta = entry link to /admin/advertising/direct; feed-register-cta on a form without the
    // required image → client validation, the confirm never opens and is never accepted.
    "scripts/qa/ads-r2-creative-registration-production-proof.mjs": /data-admin-(?:ads|feed)-register-cta/,
  };

  const UI_ACTION_RE = /\.(?:click|check|tap|dblclick)\(/;
  const WRITE_LABEL_RE =
    /저장|등록|삭제|승인|반려|전송|보내기|게시|발행|생성|적용|비활성화|제재|재개|영상 통화|음성 통화|\b(?:Save|Submit|Delete|Approve|Reject|Publish|Send|Create|Apply|Deactivate|Video call|Voice call)\b|register-cta|hard[-_]delete|soft_delete|ops-primary|--primary/i;
  const AUTH_RE = /로그인|로그아웃|Log ?in|Log ?out|Sign ?in|Sign ?out|logout/i;
  const CANCEL_RE = /취소|cancel|btn--secondary|"Escape"/i;
  const UI_ACTION_RECEIVER_RE = /\b([A-Za-z_]\w*)(?:\.(?:first|last)\(\)|\.nth\(\d+\))?\.(?:click|check|tap|dblclick)\(/;

  /** The clicked target: the receiver's nearest declaration above (≤ 40 lines), else the action line itself. */
  function clickTarget(lines: string[], i: number): string {
    const id = lines[i].match(UI_ACTION_RECEIVER_RE)?.[1];
    if (id && id !== "page") {
      const declRe = new RegExp(`\\b(?:const|let)\\s+${id}\\s*=`);
      for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
        if (declRe.test(lines[j])) return [...lines.slice(j, j + 4), lines[i]].join("\n");
      }
    }
    return lines[i];
  }

  /** Write-labelled UI clicks that are not followed by a cancel step (open-confirm → cancel is read-only). */
  function uncancelledWriteClicks(rel: string): string[] {
    const lines = read(rel).split("\n");
    const out: string[] = [];
    lines.forEach((line, i) => {
      if (!UI_ACTION_RE.test(line)) return;
      const target = clickTarget(lines, i);
      if (!WRITE_LABEL_RE.test(target)) return;
      if (AUTH_RE.test(`${target}\n${lines.slice(Math.max(0, i - 2), i).join("\n")}`)) return; // login / logout submit
      if (CANCEL_RE.test(line)) return;
      if (CANCEL_RE.test(lines.slice(i + 1, i + 25).join("\n"))) return;
      if (UI_READ_ONLY_ALLOWED_CLICK[rel]?.test(target)) return;
      out.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
    return out;
  }

  it("READ_ONLY scripts: no upload and no committed write-labelled click", () => {
    const offenders: string[] = [];
    for (const rel of UI_READ_ONLY_SCRIPTS) {
      const src = read(rel);
      if (/\.setInputFiles\(/.test(src)) offenders.push(`${rel}: setInputFiles`);
      offenders.push(...uncancelledWriteClicks(rel));
    }
    expect(offenders).toEqual([]);
  });

  it("detector has teeth: every WRITES script trips it (or uploads)", () => {
    const blind = UI_WRITE_SCRIPTS.filter(
      (rel) => !/\.setInputFiles\(/.test(read(rel)) && uncancelledWriteClicks(rel).length === 0
    );
    expect(blind).toEqual([]);
  });

  it("WRITES scripts import and call assertQaHttpWriteTarget(<origin>) before the first navigation / UI action", () => {
    const offenders = UI_WRITE_SCRIPTS.filter((rel) => {
      const src = read(rel);
      const imported =
        /import\s*\{[^}]*\bassertQaHttpWriteTarget\b[^}]*\}\s*from\s*["'][./]+(?:scripts\/)?lib\/db-target-guard\.mjs["']/.test(
          src
        );
      const call = src.search(/^assertQaHttpWriteTarget\(\s*[A-Za-z_]\w*\s*\);$/m);
      const firstAction = src.search(/\b(?:goto|navigate\w*)\(|\.(?:click|fill|setInputFiles)\(/);
      return !imported || call < 0 || (firstAction >= 0 && call > firstAction);
    });
    expect(offenders).toEqual([]);
  });

  it("every production-default script with UI actions is classified (no unreviewed bypass)", () => {
    const PROD_DEFAULT_RE =
      /(?:\|\||\?\?)\s*["'`]https:\/\/(?:samarket\.vercel\.app|(?:www\.)?dibay\.app)|(?:const|let)\s+\w+\s*=\s*["'`]https:\/\/(?:samarket\.vercel\.app|(?:www\.)?dibay\.app)/;
    const known = new Set([...UI_WRITE_SCRIPTS, ...UI_READ_ONLY_SCRIPTS]);
    const unclassified = httpScriptCandidates.filter((rel) => {
      if (known.has(rel)) return false;
      const src = read(rel);
      return (
        !/\bassertQaHttpWriteTarget\(/.test(src) &&
        PROD_DEFAULT_RE.test(src) &&
        /\.(?:click|fill|press|setInputFiles|tap|check|selectOption|type|dblclick)\(/.test(src)
      );
    });
    expect(unclassified).toEqual([]);
  });
});
