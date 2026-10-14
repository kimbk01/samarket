#!/usr/bin/env node
/**
 * P0 contract: TEST/PRODUCTION isolation fail-closed wiring.
 * Does not create Supabase/Vercel resources. Does not touch Production deploy.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function mustContain(rel, needles) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    fail(`missing file ${rel}`);
    return;
  }
  const src = readFileSync(p, "utf8");
  for (const n of needles) {
    if (!src.includes(n)) fail(`${rel} missing ${JSON.stringify(n)}`);
  }
  ok(rel);
}

function mustExist(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    fail(`missing file ${rel}`);
    return;
  }
  ok(rel);
}

mustContain("lib/config/test-production-isolation.ts", [
  "com.dibay.app.test",
  "DIBAY TEST",
  "evaluateSideEffectDispatchGate",
  "non_production_deploy_production_database",
  "ckdosyydvgzqwpbwuhon",
]);

mustContain("lib/security/cron-side-effect-gate.ts", [
  "rejectCronIfSideEffectsBlocked",
  "evaluateSideEffectDispatchGate",
]);

mustContain("lib/push/dispatch/dispatch-push-for-user.ts", [
  "isSideEffectDispatchAllowed",
]);

const cronRoutes = [
  "app/api/cron/notification-push-handoff/route.ts",
  "app/api/cron/commerce-notification-push-handoff/route.ts",
  "app/api/cron/notification-campaigns-dispatch-scheduled/route.ts",
  "app/api/cron/delivery-ads-schedule-transitions/route.ts",
  "app/api/cron/community-import-collect/route.ts",
  "app/api/cron/store-currency-recognition-reconcile/route.ts",
  "app/api/cron/store-orders-auto-complete/route.ts",
  "app/api/cron/store-order-accept-reminders/route.ts",
  "app/api/cron/stores-discovery-popularity-expire/route.ts",
  "app/api/cron/stores-discovery-schedule-transitions/route.ts",
  "app/api/cron/stores-discovery-coverage-rebuild/route.ts",
  "app/api/community-messenger/calls/sessions/stale-cleanup/route.ts",
];

for (const rel of cronRoutes) {
  mustContain(rel, ["rejectCronIfSideEffectsBlocked"]);
}

mustContain("docs/dibay-test-production-p0-owner-runbook.md", [
  "com.dibay.app.test",
  "P1",
  "ckdosyydvgzqwpbwuhon",
  "운영 회원 데이터",
]);

// P1 access + banner + admin promote surface (code contracts)
mustContain("lib/config/test-access-control.ts", [
  "evaluateTestAccess",
  "DIBAY_TEST_ALLOWED_USER_IDS",
  "isTestRuntimeSurface",
]);
mustContain("lib/auth/enforce-api-member-mutation-policy.ts", [
  "test_access_denied",
  "evaluateTestAccess",
]);
mustContain("components/runtime/DibayRuntimeEnvironmentBanner.tsx", [
  'data-dibay-runtime-banner="test"',
]);
mustContain("app/admin/system/deploy/page.tsx", [
  "/api/admin/deploy/promote-web",
  "reauthConfirm",
  "/api/admin/deploy/run-gate",
  "promoteBlocked",
]);
mustContain("lib/admin/deploy-promotion/promote-web-sha-github.ts", [
  "DIBAY_PROMOTE_ENABLED",
  "promoteWebShaViaGithub",
]);
mustContain("lib/admin/deploy-promotion/deploy-execution-guard.ts", [
  "DIBAY_PROMOTE_EXECUTION_UNLOCKED",
  "production_execution_blocked",
]);
mustContain("lib/admin/deploy-promotion/deploy-owner.ts", [
  "DIBAY_DEPLOY_OWNER_IDS",
  "requireDeployOwner",
]);
mustContain("app/api/admin/deploy/promote-web/route.ts", [
  "evaluateProductionPromoteExecution",
  "requireDeployOwner",
]);
mustContain("app/api/admin/deploy/rollback/route.ts", [
  "rollback_execution_blocked",
]);

// Native TEST identity (Android flavor + iOS xcconfig)
// AGP forbids productFlavor names starting with "test" → use dibayTest.
mustContain("android/app/build.gradle", [
  "dibayTest",
  'applicationId "com.dibay.app.test"',
  'resValue "string", "app_name", "DIBAY TEST"',
  'buildConfigField "String", "DEEP_LINK_SCHEME", "\\"dibay-test\\"',
  "src/dibayTest/google-services.json",
]);
mustExist("android/app/src/dibayTest/README-google-services.md");
mustContain("ios/App/App/dibay-flavor-test.xcconfig", [
  "com.dibay.app.test",
  "DIBAY TEST",
  "dibay-test",
]);
mustContain("capacitor.config.ts", [
  "DIBAY_NATIVE_FLAVOR",
  "com.dibay.app.test",
  "DIBAY TEST",
]);

if (failed > 0) {
  console.error(`\nverify-test-production-isolation-p0: ${failed} failure(s)`);
  process.exit(1);
}
console.log("\nverify-test-production-isolation-p0: PASS");
