#!/usr/bin/env node
/**
 * Membership/session hot-path contract — UI membership must not call ensureSessionHealthy.
 * @see hooks/use-client-membership-state.ts · lib/auth/api-auth-recovery.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const membershipHook = read("hooks/use-client-membership-state.ts");
const authBoundary = read("components/auth/AuthSessionBoundary.tsx");
const cmGuestGate = read("components/community-messenger/CommunityMessengerGuestGate.tsx");
const myContent = read("app/(main)/my/MyContent.tsx");
const apiRecovery = read("lib/auth/api-auth-recovery.ts");
const resolveMembership = read("lib/auth/resolve-client-profile-session.ts");
const optimisticViewer = read("lib/auth/client-membership-viewer.ts");
const runAppBoot = read("lib/app-boot/run-app-boot.ts");
const sessionManager = read("lib/auth/dibay-session-manager.ts");

if (membershipHook.includes("ensureSessionHealthy")) {
  failures.push("use-client-membership-state.ts must NOT import or call ensureSessionHealthy");
}

if (!membershipHook.includes("resolveClientMembership")) {
  failures.push("use-client-membership-state.ts must resolve via resolveClientMembership only");
}

if (!membershipHook.includes("syncMembershipFromProfileCache")) {
  failures.push("use-client-membership-state.ts must sync member from profile cache on auth bind");
}

if (!membershipHook.includes("TEST_AUTH_CHANGED_EVENT")) {
  failures.push("use-client-membership-state.ts must listen for TEST_AUTH_CHANGED_EVENT");
}

if (!optimisticViewer.includes("isOptimisticMemberViewer")) {
  failures.push("client-membership-viewer.ts must export isOptimisticMemberViewer");
}

if (!authBoundary.includes("isOptimisticMemberViewer")) {
  failures.push("AuthSessionBoundary must use isOptimisticMemberViewer for checking bypass");
}

const guestBlockIdx = authBoundary.indexOf('data-auth-session-boundary="blocked"');
const guestStatusIdx = authBoundary.indexOf('membership.status === "guest" || isAuthExitNavigateStarted()');
const checkingBypassIdx = authBoundary.indexOf('if (membership.status === "checking" && !optimisticMember)');
if (guestBlockIdx < 0 || guestStatusIdx < 0 || checkingBypassIdx < 0 || guestStatusIdx > checkingBypassIdx) {
  failures.push(
    "AuthSessionBoundary must block guest before optimistic checking bypass (guest always blocks account-dependent UI)"
  );
}

if (!cmGuestGate.includes("isOptimisticMemberViewer")) {
  failures.push("CommunityMessengerGuestGate must use isOptimisticMemberViewer during checking");
}

if (!myContent.includes("isOptimisticMemberViewer")) {
  failures.push("MyContent must use isOptimisticMemberViewer for hub enable and checking bypass");
}

if (!apiRecovery.includes("handleApi401")) {
  failures.push("api-auth-recovery.ts recoverFrom401Once must use handleApi401 (ensureSessionHealthy flight)");
}

if (apiRecovery.includes("resolveClientMembership") || apiRecovery.includes("useClientMembershipState")) {
  failures.push("api-auth-recovery.ts must not depend on membership resolve (avoid circular single-flight wait)");
}

if (!resolveMembership.includes("fetchAuthSessionNoStore")) {
  failures.push("resolve-client-profile-session.ts must use lightweight fetchAuthSessionNoStore");
}

const routeClassification = read("lib/auth/auth-route-classification.ts");
for (const publicTab of ["/market", "/stores", "/philife", "/mypage"]) {
  if (routeClassification.includes(`"${publicTab}"`) && routeClassification.includes(`p === "${publicTab}"`)) {
    /* only fail if explicitly listed as account-dependent — grep isAccountDependentPath body */
  }
}
if (routeClassification.match(/isAccountDependentPath[\s\S]*p === "\/market"/)) {
  failures.push("/market must not be account-dependent in auth-route-classification");
}
if (runAppBoot.includes('establishGuestAuthState("app_boot_no_supabase_user")')) {
  failures.push("run-app-boot.ts must NOT establish guest gate on transient getUser miss (WebView session restore race)");
}

if (sessionManager.includes('establishGuestAuthState(`auth_event:${event}`)') && sessionManager.includes("INITIAL_SESSION")) {
  const initialBlock = sessionManager.match(/INITIAL_SESSION[\s\S]{0,200}establishGuestAuthState/);
  if (initialBlock) {
    failures.push("dibay-session-manager must NOT establish guest gate on INITIAL_SESSION without user");
  }
}

if (!sessionManager.includes("reconcileAuthenticatedClientSession") && !read("components/auth/SupabaseAuthSync.tsx").includes("reconcileAuthenticatedClientSession")) {
  failures.push("SupabaseAuthSync must reconcile authenticated session after guest race");
}

const contractTest = read("hooks/__tests__/use-client-membership-state.contract.test.ts");
if (!contractTest.includes("ensureSessionHealthy")) {
  failures.push("use-client-membership-state.contract.test.ts must assert no ensureSessionHealthy in membership hook");
}

if (failures.length > 0) {
  console.error("verify:membership-hot-path-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:membership-hot-path-contract PASS");
