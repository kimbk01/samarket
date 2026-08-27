/**
 * B8 — STORE + PLATFORM Gift production scenarios S/P.
 * Requires: migration 20261128180000 applied, code deployed on PLAYWRIGHT_BASE_URL,
 * Admin auth env, buyer fixtures.
 *
 * Static gate: ADMIN_GIFT_SCOPE_B8_STATIC_ONLY=1
 * Live: PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-scope-store-platform-b8.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-scope-b8.json");
const report = {
  cut: "B8",
  origin: ORIGIN || null,
  a8AuthCookieFix: "CODE_FIXED",
  scenarioS: null,
  scenarioP: null,
  migrationPresent: null,
  domainContract: null,
  checkoutAuthority: null,
  verdict: "FAIL",
  error: null,
  note: null,
};

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function staticChecks() {
  const mig = readFileSync(
    resolve("supabase/migrations/20261128180000_gift_certificate_scope_platform.sql"),
    "utf8"
  );
  report.migrationPresent =
    mig.includes("gift_scope") &&
    mig.includes("ADMIN_DIRECT_PLATFORM") &&
    mig.includes("gift_certificate_instance_allows_checkout_store")
      ? "PASS"
      : "FAIL";

  const contract = readFileSync(
    resolve("lib/gift-certificate/gift-certificate-domain-contract.ts"),
    "utf8"
  );
  report.domainContract =
    contract.includes('GIFT_SCOPES = ["STORE", "PLATFORM"]') &&
    contract.includes("giftInstanceAllowsCheckoutStore")
      ? "PASS"
      : "FAIL";

  const eligible = readFileSync(
    resolve("lib/gift-certificate/checkout-eligible-gifts.ts"),
    "utf8"
  );
  report.checkoutAuthority = eligible.includes("giftInstanceAllowsCheckoutStore")
    ? "PASS"
    : "FAIL";

  const e2e = readFileSync(resolve("scripts/qa/admin-gift-ops-center-e2e.mjs"), "utf8");
  report.a8AuthCookieFix = e2e.includes("sb-${ref}-auth-token")
    ? "CODE_FIXED"
    : "MISSING";

  const products = readFileSync(
    resolve("app/api/admin/gift-certificates/products/route.ts"),
    "utf8"
  );
  const patch = readFileSync(
    resolve("app/api/admin/gift-certificates/products/[id]/route.ts"),
    "utf8"
  );
  report.adminCrud =
    products.includes("resolveGiftCreationSource") &&
    products.includes("gift_scope") &&
    products.includes("PLATFORM") &&
    patch.includes("delete_forbidden_has_instances")
      ? "PASS"
      : "FAIL";
}

async function main() {
  loadEnv();
  staticChecks();

  if (process.env.ADMIN_GIFT_SCOPE_B8_STATIC_ONLY === "1" || !ORIGIN) {
    const ok =
      report.migrationPresent === "PASS" &&
      report.domainContract === "PASS" &&
      report.checkoutAuthority === "PASS" &&
      report.adminCrud === "PASS" &&
      report.a8AuthCookieFix === "CODE_FIXED";
    report.verdict = ok ? "B8_STATIC_PASS_AWAITING_PRODUCTION_DEPLOY" : "FAIL";
    report.note =
      "Scenario S/P Production runtime requires git push + migration apply + READY commit. Not claimed PRODUCTION_PROVEN without live evidence.";
    report.scenarioS = "NOT_RUN";
    report.scenarioP = "NOT_RUN";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(ok ? 0 : 1);
  }

  report.error =
    "live_runtime_requires_deployed_b1_b7_commit_and_migration — set ADMIN_GIFT_SCOPE_B8_STATIC_ONLY=1 for static, or deploy then re-run";
  report.verdict = "EXTERNAL_BLOCKER_NEED_DEPLOY";
  report.scenarioS = "BLOCKED";
  report.scenarioP = "BLOCKED";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

main().catch((e) => {
  report.error = String(e?.message || e);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
