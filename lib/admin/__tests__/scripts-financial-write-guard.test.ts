/**
 * F-13 — QA scripts production write guard (static + resolution matrix).
 * vitest excludes scripts/**, so this lives under lib/ and reads scripts as text / imports the .mjs guard.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const QA_DIR = resolve(ROOT, "scripts/qa");
const GUARD_PATH = resolve(ROOT, "scripts/lib/db-target-guard.mjs");

type GuardModule = {
  QA_GUARD_PRODUCTION_REFS: readonly string[];
  QA_GUARD_ALLOWED_NON_PRODUCTION_REFS: readonly string[];
  resolveQaWriteTarget: (env: Record<string, string | undefined>) => {
    ok: boolean;
    target?: string;
    reason?: string;
  };
};
/** Runtime import keeps the plain .mjs out of the TS composite project graph. */
let guard: GuardModule;
beforeAll(async () => {
  guard = (await import(/* @vite-ignore */ pathToFileURL(GUARD_PATH).href)) as GuardModule;
});

const FINANCIAL_TABLE =
  "(?:point_ledger|point_charge_requests|store_point_charge_requests|gift_certificate_\\w+|gift_promo_\\w+|store_economic_point_\\w+|store_point_\\w+|store_cash_\\w+|business_cash_\\w+|coin_withdrawal_requests|store_settlements|store_sale_fee_obligations|feed_ad_\\w+|point_promotion_orders|post_ads|trade_post_ads|delivery_ad_\\w+|coupon_user_entitlements|store_coupon_campaigns)";

/** Money / financial RPCs (writers). Read-only STABLE helpers are intentionally not listed. */
const MONEY_RPC =
  /\.rpc\(\s*["'`](?:credit_coin_\w+|reverse_\w+|charge_sale_fee_for_order|settle_store_sale_fee_obligations|approve_business_cash_charge_request|reject_business_cash_charge_request|ensure_business_cash_account|convert_store_economic_points_to_business_cash|business_cash_\w+|gift_certificate_(?!store_revenue_available|instance_allows_checkout_store)\w+|create_store_order_atomic|recognize_order_currency_on_completed|project_user_point_balance_from_ledger|claim_store_coupon|reconcile_coupon_campaign_issued|coin_withdrawal_\w+|point_charge_\w+)["'`]/;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // shared helpers are imported by guarded entry scripts
      if (name === "lib") continue;
      out.push(...listFiles(p));
    } else if (/\.(mjs|mts|ts|js|cjs)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function writesFinancialTables(src: string): boolean {
  const segments = src.split(/(?=\.from\()/);
  const tableRe = new RegExp(`^\\.from\\(\\s*["'\`]${FINANCIAL_TABLE}["'\`]\\s*\\)`);
  for (const seg of segments) {
    if (!tableRe.test(seg)) continue;
    if (/\.(insert|update|upsert|delete)\(/.test(seg.slice(0, 600))) return true;
  }
  const sqlRe = new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:public\\.)?${FINANCIAL_TABLE}\\b`, "i");
  if (sqlRe.test(src)) return true;
  return MONEY_RPC.test(src);
}

/** Guard call must appear before any client creation. */
function guardCalledBeforeClients(src: string): boolean {
  const call = src.indexOf("assertQaWriteTarget();");
  if (call < 0) return false;
  const firstClient = [
    src.search(/createClient\(/),
    src.search(/new\s+(?:pg\.)?Client\(/),
    src.search(/new\s+(?:pg\.)?Pool\(/),
  ].filter((i) => i >= 0);
  return firstClient.every((i) => i > call);
}

const REQUIRED_GUARDED = [
  "scripts/qa/currency-cut-b-production-close.mjs",
  "scripts/qa/currency-cut-g-production-close.mjs",
  "scripts/qa/three-currency-production-e2e.mjs",
  "scripts/qa/gift-one-time-full-consumption-production-proof.mjs",
  "scripts/qa/gift-sp-production-close.mjs",
  "scripts/qa/gift-sp-resume-p-close.mjs",
  "scripts/qa/gift-ledger-c-runtime-proof.mjs",
  "scripts/qa/gate4-final-runtime-close.mjs",
  "scripts/qa/gate45-point-charge-rt-first-break.mjs",
  "scripts/qa/gate45-remaining-runtime.mjs",
  "scripts/qa/gate3-notification-sound-runtime.mjs",
  "scripts/qa/gate45-global-notification-ssot-runtime.mjs",
  "scripts/qa/gift-friend-reentry-oneshot-diagnostic.mjs",
  "scripts/qa/gift-friend-regift-auth-harness-close.mjs",
  "scripts/qa/gift-friend-ux-coldload-proof.mjs",
  "scripts/qa/gift-offer-instant-delivery-runtime-close.mjs",
  "scripts/qa/gift-transfer-lifecycle-runtime.mjs",
  "scripts/qa/gift-u3-friend-gift-runtime.mjs",
  "scripts/qa/gift-u7c-revenue-recognition-runtime.mjs",
  "scripts/qa/free-coupon-remaining-proof.mjs",
  "scripts/qa/free-coupon-v32-e2e.mjs",
  "scripts/qa/feed-banner-runtime-evidence-20260810.mjs",
  "scripts/runtime-delivery-phase-d-matrix.ts",
  "scripts/delivery-financial-ssot-runtime-close.ts",
];

describe("F-13 scripts financial write guard (static)", () => {
  it("every scripts/qa file matching financial write patterns imports and calls assertQaWriteTarget first", () => {
    const offenders: string[] = [];
    for (const file of listFiles(QA_DIR)) {
      const src = readFileSync(file, "utf8");
      if (!writesFinancialTables(src)) continue;
      const rel = relative(ROOT, file);
      if (!/import\s*\{\s*assertQaWriteTarget\s*\}\s*from\s*["'][./]+lib\/db-target-guard\.mjs["']/.test(src)) {
        offenders.push(`${rel}: missing import`);
        continue;
      }
      if (!guardCalledBeforeClients(src)) offenders.push(`${rel}: guard not called before client creation`);
    }
    expect(offenders).toEqual([]);
  });

  it("required financial scripts are guarded", () => {
    const missing = REQUIRED_GUARDED.filter((rel) => {
      const p = resolve(ROOT, rel);
      if (!existsSync(p)) return true;
      const src = readFileSync(p, "utf8");
      return !src.includes("assertQaWriteTarget") || !guardCalledBeforeClients(src);
    });
    expect(missing).toEqual([]);
  });

  it("legacy privilege re-grant scripts are deleted and unreferenced in package.json", () => {
    const deleted = [
      "scripts/apply-store-point-admin-adjust-related-id.mjs",
      "scripts/apply-gift-cash-out-migration.mjs",
    ];
    for (const rel of deleted) expect(existsSync(resolve(ROOT, rel))).toBe(false);
    const pkg = readFileSync(resolve(ROOT, "package.json"), "utf8");
    expect(pkg).not.toContain("apply-store-point-admin-adjust-related-id");
    expect(pkg).not.toContain("apply-gift-cash-out-migration");
  });

  it("guard module has no environment override / bypass", () => {
    const src = readFileSync(GUARD_PATH, "utf8");
    // Only the target-describing env vars may be read; nothing that widens lists or skips the guard.
    const envNames = new Set<string>();
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envNames.add(m[1]);
    for (const m of src.matchAll(/process\.env\[\s*["'`]([A-Z0-9_]+)["'`]\s*\]/g)) envNames.add(m[1]);
    expect([...envNames]).toEqual([]);
    expect(src).not.toMatch(/ALLOW_PROD|FORCE|BYPASS|SKIP_GUARD|OVERRIDE|I_KNOW/i);
    expect(src).toMatch(/QA_GUARD_ALLOWED_NON_PRODUCTION_REFS = Object\.freeze\(\["gczyogboohpixpurckkg"\]\)/);
    expect(src).toMatch(/QA_GUARD_PRODUCTION_REFS = Object\.freeze\(\["ckdosyydvgzqwpbwuhon"\]\)/);
    expect(src).toContain("process.exit(1)");
  });

  it("production ref list matches the data-reset guard SSOT", () => {
    const dr = readFileSync(resolve(ROOT, "lib/admin/data-reset/database-target-guard.ts"), "utf8");
    expect(dr).toContain('DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS: readonly string[] = ["ckdosyydvgzqwpbwuhon"]');
    expect([...guard.QA_GUARD_PRODUCTION_REFS]).toEqual(["ckdosyydvgzqwpbwuhon"]);
  });
});

const QA = "gczyogboohpixpurckkg";
const PROD = "ckdosyydvgzqwpbwuhon";
const OTHER = "abcdefghijklmnopqrst";

function jwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

const resolveTarget = (env: Record<string, string | undefined>) => guard.resolveQaWriteTarget(env);

describe("F-13 resolveQaWriteTarget matrix", () => {
  it("production ref → refused", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: PROD, role: "service_role" }),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/production/);
  });

  it("unknown host → refused", () => {
    const r = resolveTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown target/);
  });

  it("missing target → refused", () => {
    expect(resolveTarget({}).ok).toBe(false);
    expect(resolveTarget({ SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: QA }) }).ok).toBe(false);
  });

  it("mismatch URL vs DATABASE_URL → refused", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${QA}.supabase.co`,
      DATABASE_URL: `postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mismatch/);
  });

  it("mismatch pooler username vs URL → refused", () => {
    const r = resolveTarget({
      SUPABASE_URL: `https://${QA}.supabase.co`,
      SUPABASE_POOLER_URL: `postgresql://postgres.${PROD}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mismatch/);
  });

  it("mismatch JWT ref → refused", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${QA}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: PROD, role: "service_role" }),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mismatch/);
  });

  it("non-allowlisted ref → refused", () => {
    const r = resolveTarget({ NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not in the non-production allowlist/);
  });

  it("loopback → allowed", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
      SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase-demo", role: "service_role" }),
    });
    expect(r).toMatchObject({ ok: true, target: "loopback" });
  });

  it("loopback URL with a remote DATABASE_URL → refused (mismatch)", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      DATABASE_URL: `postgresql://postgres:pw@db.${QA}.supabase.co:5432/postgres`,
    });
    expect(r.ok).toBe(false);
  });

  it("QA ref with all sources agreeing → allowed", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${QA}.supabase.co`,
      SUPABASE_URL: `https://${QA}.supabase.co`,
      DATABASE_URL: `postgresql://postgres:pw@db.${QA}.supabase.co:5432/postgres`,
      SUPABASE_POOLER_URL: `postgresql://postgres.${QA}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: QA, role: "service_role" }),
    });
    expect(r).toMatchObject({ ok: true, target: QA });
  });

  it("no env var can override (unrelated override-looking vars are ignored)", () => {
    const r = resolveTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
      ALLOW_PRODUCTION_WRITE: "1",
      QA_GUARD_ALLOWED_NON_PRODUCTION_REFS: PROD,
      DATA_RESET_PRODUCTION_SUPABASE_REFS: "",
    });
    expect(r.ok).toBe(false);
  });
});
