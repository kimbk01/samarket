#!/usr/bin/env node
/**
 * OAuth inline login UX contract — no fullscreen redirect panel on /login or AuthModal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const useOAuth = read("lib/auth/oauth/use-oauth-login.ts");
const loginPage = read("app/login/LoginPageClient.tsx");
const authModal = read("components/auth/AuthModal.tsx");
const providerButtons = read("components/auth/LoginProviderButtons.tsx");
const authUi = read("lib/i18n/catalog/auth-ui.ts");
const startError = read("lib/auth/oauth/oauth-start-error.client.ts");

if (useOAuth.includes("oauthPanelPhase") || useOAuth.includes("runOAuthPanelExit")) {
  failures.push("use-oauth-login must not restore fullscreen OAuth panel phase/exit");
}
if (!useOAuth.includes("oauthInlineStatus")) {
  failures.push("use-oauth-login must export oauthInlineStatus for inline login hints");
}
if (!useOAuth.includes("isNativeProviderEmailConflictError")) {
  failures.push("use-oauth-login must silence duplicate errors on provider email conflict");
}
if (!useOAuth.includes("isNativeGoogleLoginAvailable")) {
  failures.push("use-oauth-login must guard Google native pending from premature foreground clear");
}
if (loginPage.includes("OAuthProviderLoginPanel")) {
  failures.push("LoginPageClient must not mount OAuthProviderLoginPanel");
}
if (!loginPage.includes("OAuthInlineLoginHint")) {
  failures.push("LoginPageClient must mount OAuthInlineLoginHint");
}
if (!loginPage.includes("dispatchOAuthPendingClear(\"provider_email_conflict\")")) {
  failures.push("LoginPageClient must clear OAuth pending when conflict redirect opens modal");
}
if (authModal.includes("OAuthProviderLoginPanel")) {
  failures.push("AuthModal must not mount OAuthProviderLoginPanel");
}
if (!authModal.includes("OAuthInlineLoginHint")) {
  failures.push("AuthModal must mount OAuthInlineLoginHint");
}
if (!providerButtons.includes("auth_oauth_signing_in_label")) {
  failures.push("LoginProviderButtons must use auth_oauth_signing_in_label (not redirecting)");
}
if (!authUi.includes("auth_oauth_signing_in_label")) {
  failures.push("auth-ui catalog must define auth_oauth_signing_in_label ko/en");
}
if (!authUi.includes("auth_oauth_return_hint")) {
  failures.push("auth-ui catalog must define auth_oauth_return_hint ko/en");
}
if (!startError.includes("isNativeProviderEmailConflictError")) {
  failures.push("oauth-start-error must define isNativeProviderEmailConflictError");
}

if (failures.length > 0) {
  console.error("verify:oauth-inline-login-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:oauth-inline-login-contract PASS");
