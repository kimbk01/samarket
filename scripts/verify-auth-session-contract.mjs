#!/usr/bin/env node
/**
 * Auth session isolation contract — logout/account-switch wipe parity.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const wipe = read("lib/auth/client-session-wipe.ts");
const sync = read("components/auth/SupabaseAuthSync.tsx");
const invalidateModule = read("lib/auth/invalidate-auth-exit-client-caches.ts");
const getCurrentUser = read("lib/auth/get-current-user.ts");
const sessionPolicy = read("docs/dibay-session-policy.md");

if (!wipe.includes("invalidateAuthExitClientCaches")) {
  failures.push("client-session-wipe.ts must call invalidateAuthExitClientCaches on auth exit");
}

if (!wipe.includes("clearBrowserCacheStorageBestEffort")) {
  failures.push("client-session-wipe.ts must clear Cache API on auth exit");
}

if (wipe.includes('reason === "account_switched" && previousUserId')) {
  failures.push(
    "client-session-wipe.ts must not use partial localStorage wipe on account_switched — use clearEphemeralLocalStorage for all reasons"
  );
}

if (!wipe.includes("clearEphemeralLocalStorage();")) {
  failures.push("client-session-wipe.ts must call clearEphemeralLocalStorage unconditionally");
}

if (!wipe.includes('reason === "user_logout" || reason === "account_switched"')) {
  failures.push("client-session-wipe.ts must clear Cache API only for user_logout/account_switched");
}

if (sync.includes("wipeUserScopedStorage")) {
  failures.push("SupabaseAuthSync must not duplicate wipeUserScopedStorage — wipeClientSessionState handles storage");
}

if (!getCurrentUser.includes("export function invalidateCurrentUserIdCache")) {
  failures.push("get-current-user.ts must export invalidateCurrentUserIdCache for auth exit wipe");
}

const requiredInvalidators = [
  "invalidateCurrentUserIdCache",
  "invalidateMeStoresListDedupedCache",
  "invalidateMainBottomNavDedupedCache",
  "invalidateMeNotificationsListDedupedCache",
  "invalidateFavoriteCountClientCache",
  "resetHomeSyncSnapshotInvalidationRegistry",
];

for (const fn of requiredInvalidators) {
  if (!invalidateModule.includes(fn)) {
    failures.push(`invalidate-auth-exit-client-caches.ts must call ${fn}`);
  }
}

if (!sessionPolicy.includes("account_switched") || !sessionPolicy.includes("ephemeral localStorage")) {
  failures.push("docs/dibay-session-policy.md must document full ephemeral wipe on account switch");
}

const contractTest = read("lib/auth/__tests__/auth-session-isolation-contract.test.ts");
if (!contractTest.includes("account_switched")) {
  failures.push("auth-session-isolation-contract.test.ts must cover account_switched wipe");
}

if (!contractTest.includes("pre_login_bootstrap") || !contractTest.includes("not.toHaveBeenCalled")) {
  failures.push("auth-session-isolation-contract.test.ts must assert pre_login_bootstrap does not clear Cache API");
}

if (!invalidateModule.includes("home-sync-snapshot-invalidation-registry")) {
  failures.push(
    "invalidate-auth-exit-client-caches.ts must import resetHomeSyncSnapshotInvalidationRegistry from client-safe invalidation-registry"
  );
}

if (invalidateModule.includes('from "@/lib/community-messenger/home-sync-snapshot-cache"')) {
  failures.push(
    "invalidate-auth-exit-client-caches.ts must not import home-sync-snapshot-cache (pulls server after import chain into client bundle)"
  );
}

const clientSignupGate = read("lib/auth/client-signup-gate.ts");
if (!clientSignupGate.includes("deriveDibaySignupStatus")) {
  failures.push("client-signup-gate.ts must derive signupComplete from deriveDibaySignupStatus");
}
if (clientSignupGate.includes("if (user.onboarding_completed_at) return true")) {
  failures.push("client-signup-gate.ts must not pass signup on onboarding_completed_at alone");
}

const oauthContract = read("lib/auth/oauth/native-oauth-contract.ts");
if (!oauthContract.includes("tryBeginOAuthFlow")) {
  failures.push("native-oauth-contract.ts must define OAuth in-flight mutex");
}

if (!oauthContract.includes("OAUTH_FLOW_IN_FLIGHT_TTL_MS") || !oauthContract.includes("release")) {
  failures.push("native-oauth-contract.ts must define TTL and release for OAuth mutex");
}

if (!oauthContract.includes("releaseOAuthFlowOnUserCancel")) {
  failures.push("native-oauth-contract.ts must define releaseOAuthFlowOnUserCancel for OAuth cancel UX");
}

const loginButtons = read("components/auth/LoginProviderButtons.tsx");
if (!loginButtons.includes("isOAuthLoginStartSupported")) {
  failures.push("LoginProviderButtons must filter unsupported OAuth providers (Facebook)");
}

const naverStart = read("app/api/auth/naver/start/route.ts");
if (!naverStart.includes("NATIVE_OAUTH_CAPACITOR_RETURN_PATH")) {
  failures.push("naver/start must use capacitor-return bridge for native redirect");
}

const signup = read("lib/auth/dibay-signup-status.ts");
if (!signup.includes("consentComplete && dibayIdComplete && profileComplete")) {
  failures.push("dibay-signup-status.ts signupComplete must require consent + dibay id + profile");
}

const signupTest = read("lib/auth/__tests__/dibay-signup-status.test.ts");
if (!signupTest.includes("consent is missing") || !signupTest.includes("onboarding_completed_at when consent is missing")) {
  failures.push("dibay-signup-status.test.ts must cover consent-missing signupComplete=false cases");
}

if (failures.length > 0) {
  console.error("verify:auth-session-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:auth-session-contract PASS");
