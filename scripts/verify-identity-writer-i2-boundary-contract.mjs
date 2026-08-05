#!/usr/bin/env node
/**
 * Slice 7-4 PLAN_I2 — static Identity Writer vs Canonical boundary guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const facade = read("lib/auth/completion/ensure-auth-profile-for-login.server.ts");
const google = read("lib/auth/native/google-native-session.server.ts");
const kakao = read("lib/auth/native/kakao-native-session.server.ts");
const apple = read("lib/auth/native/apple-native-session.server.ts");
const naver = read("app/api/auth/naver/callback/route.ts");
const web = read("app/auth/callback/route.ts");
const boundary = read("lib/auth/completion/identity-writer-i2-boundary.ts");

if (!boundary.includes("PLAN_I2") || !boundary.includes("CANONICAL_LOGIN_PROFILE_WRITER")) {
  failures.push("identity-writer-i2-boundary.ts must export PLAN_I2 ownership SSOT");
}

for (const banned of [
  "persistGoogleProfileIdentity(",
  "persistKakaoProfileIdentity(",
  "persistAppleProfileIdentity(",
  "ensureProviderAuthIdentityRow(",
  "persistOAuthProviderIdentity(",
]) {
  if (facade.includes(banned)) {
    failures.push(`ensureAuthProfileForLogin must not call Identity Writer ${banned}`);
  }
}
if (
  /from\s+["']@\/lib\/auth\/provider-identity\//.test(facade)
  || /from\s+["'][^"']*persist(Google|Kakao|Apple)/.test(facade)
) {
  failures.push("ensureAuthProfileForLogin must not import Identity Writer modules");
}

function orderOk(src, labels) {
  let prev = -1;
  for (const [label, needle] of labels) {
    const idx = src.indexOf(needle);
    if (idx < 0) {
      failures.push(`missing ${label}: ${needle}`);
      return;
    }
    if (idx < prev) failures.push(`order broken: ${label} before previous step`);
    prev = idx;
  }
}

orderOk(google, [
  ["reconcile", "await reconcileGoogleNativeProviderProfileConflict("],
  ["canonical", "await ensureAuthProfileForLogin("],
  ["identityCol", "await persistGoogleProfileIdentity("],
  ["authRow", "await ensureProviderAuthIdentityRow("],
  ["hardGate", "await ensureProfileForUserId("],
]);

orderOk(kakao, [
  ["canonical", "await ensureAuthProfileForLogin("],
  ["identityCol", "await persistKakaoProfileIdentity("],
  ["authRow", "await ensureProviderAuthIdentityRow("],
]);

orderOk(apple, [
  ["canonical", "await ensureAuthProfileForLogin("],
  ["identityCol", "await persistAppleProfileIdentity("],
  ["authRow", "await ensureProviderAuthIdentityRow("],
]);

{
  const iCanonical = naver.indexOf("await ensureAuthProfileForLogin(");
  const iUpdate = naver.indexOf('from("profiles")', iCanonical);
  if (iCanonical < 0 || iUpdate < 0 || iUpdate < iCanonical) {
    failures.push("Naver must keep Identity profiles.update after Canonical facade");
  }
  if (!naver.includes("provider_user_id: profile.id")) {
    failures.push("Naver Identity update must set provider_user_id from Naver profile.id");
  }
}

{
  const iFacade = web.indexOf("await ensureAuthProfileForLogin(");
  const iIdentity = web.indexOf("persistOAuthProviderIdentity(");
  if (iFacade < 0 || iIdentity < 0 || iIdentity < iFacade) {
    failures.push("Web OAuth must keep persistOAuthProviderIdentity after Canonical facade");
  }
  if (!web.includes("NextResponse.redirect") || !web.includes('response.headers.set("Location"')) {
    failures.push("Web OAuth HTTP redirect structure must remain");
  }
}

if (failures.length > 0) {
  console.error("verify:identity-writer-i2-boundary-contract FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:identity-writer-i2-boundary-contract PASS");
