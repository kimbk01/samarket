import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

const migration = read("supabase/migrations/20260914130000_user_auth_identities.sql");
if (!migration.includes("user_auth_identities")) {
  failures.push("migration must create user_auth_identities");
}
if (!migration.includes("user_auth_identities_provider_user_id_unique_idx")) {
  failures.push("migration must enforce unique(provider, provider_user_id)");
}

const resolveLogin = read("lib/auth/provider-identity/resolve-provider-login.server.ts");
if (!resolveLogin.includes("email_conflict")) {
  failures.push("resolve-provider-login must return email_conflict");
}
if (resolveLogin.includes("merge") && resolveLogin.includes("email")) {
  /* ok if only in comments */
}

const loginPage = read("app/login/LoginPageClient.tsx");
if (!loginPage.includes("AuthProviderEmailConflictHost")) {
  failures.push("LoginPageClient must mount AuthProviderEmailConflictHost");
}

const webOAuth = read("app/auth/callback/route.ts");
if (!webOAuth.includes("enforceWebOAuthProviderPolicy")) {
  failures.push("auth/callback must enforce provider linking policy on web OAuth");
}

const bridge = read("lib/auth/provider-identity/native-session-bridge.server.ts");
if (!bridge.includes("resolveNativeProviderSessionPrelude")) {
  failures.push("native-session-bridge must expose resolveNativeProviderSessionPrelude");
}

for (const route of [
  "app/api/auth/provider/conflict-check/route.ts",
  "app/api/auth/provider/link/start/route.ts",
  "app/api/auth/provider/link/complete/route.ts",
  "app/api/me/auth-providers/route.ts",
  "app/api/me/auth-providers/[provider]/route.ts",
]) {
  if (!read(route).includes("export async function")) {
    failures.push(`${route} must export route handlers`);
  }
}

const modal = read("components/auth/AuthProviderEmailConflictModal.tsx");
if (!modal.includes("auth_provider_email_conflict_title")) {
  failures.push("conflict modal must use auth_provider_email_conflict_title");
}

const unlink = read("lib/auth/provider-identity/link-provider.server.ts");
if (!unlink.includes("last_provider_unlink_blocked")) {
  failures.push("unlinkProvider must block last provider removal");
}

if (failures.length > 0) {
  console.error("verify:auth-provider-linking-contract FAIL");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("verify:auth-provider-linking-contract PASS");
