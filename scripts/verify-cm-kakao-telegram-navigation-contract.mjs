#!/usr/bin/env node
/**
 * CM 카톡/텔레그램형 hub·stack·auth·call accept recovery contract.
 * @see docs/community-messenger/cm-kakao-telegram-navigation-contract.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function mustInclude(relPath, needle, message) {
  const src = read(relPath);
  if (!src.includes(needle)) {
    failures.push(message ?? `${relPath} must include: ${needle}`);
  }
}

function mustNotInclude(relPath, needle, message) {
  const src = read(relPath);
  if (src.includes(needle)) {
    failures.push(message ?? `${relPath} must not include: ${needle}`);
  }
}

// --- Document ---
const doc = read("docs/community-messenger/cm-kakao-telegram-navigation-contract.md");
for (const section of [
  "signupComplete = consent && @id && profile",
  "Tier 1 — Hub tabs",
  "Tier 2 — Stack deep routes",
  "Tier 3 — Auth gates",
  "Tier 4 — Call accept",
  "b0820eba",
]) {
  if (!doc.includes(section)) {
    failures.push(`cm-kakao-telegram-navigation-contract.md missing section/ref: ${section}`);
  }
}

// --- Tier 3: consent-only HTML gate ---
mustInclude("lib/auth/dibay-signup-status.ts", "const signupComplete = consentComplete");
mustNotInclude(
  "lib/auth/dibay-signup-status.ts",
  "consentComplete && dibayIdComplete && profileComplete",
  "dibay-signup-status.ts must not tie signupComplete to id+profile"
);
mustInclude("components/auth/DibaySignupGate.tsx", "consentComplete");
mustNotInclude(
  "components/auth/DibaySignupGate.tsx",
  "json?.signup?.signupComplete",
  "DibaySignupGate must not gate on signupComplete alone"
);
mustInclude("lib/auth/client-signup-gate.ts", ".consentComplete");
mustNotInclude(
  "lib/auth/client-signup-gate.ts",
  ".signupComplete",
  "isClientSignupComplete must use consentComplete not signupComplete"
);

// --- Tier 1: hub sync navigation ---
const navCommit = read("lib/main-menu/main-bottom-nav-route-commit.ts");
if (!navCommit.includes("commitMainBottomNavRouteNavigateSync")) {
  failures.push("main-bottom-nav-route-commit.ts must use sync navigate helper");
}
if (!navCommit.includes("카톡/텔레그램형")) {
  failures.push("main-bottom-nav-route-commit.ts must document KakaoTalk/Telegram hub model");
}
if (/commitMainBottomNavRouteNavigateSync[\s\S]{0,800}setTimeout\([^)]*replace|setTimeout\([^)]*push/.test(navCommit)) {
  failures.push("main-bottom-nav-route-commit.ts must not defer router replace/push via setTimeout");
}
mustInclude("lib/main-menu/main-bottom-nav-route-commit.ts", "bottom_nav_async");

// --- Tier 2: deep route lock ---
mustInclude("lib/navigation/cm-deep-route-navigation-lock.ts", "SSOT_CONTRACT: cm-deep-route-navigation-lock");
mustInclude("lib/navigation/guarded-client-navigation.ts", "evaluateDeepRouteNavigationGuard");
mustInclude(
  "lib/community-messenger/community-messenger-room-forward-navigation.ts",
  "beginRoomDeepRouteNavigationLock"
);
mustInclude("lib/community-messenger/call-session-navigation-seed.ts", "beginCallDeepRouteNavigationLock");

// --- Tier 4: call accept SSOT ---
mustInclude(
  "lib/community-messenger/incoming-call-accept-gateway.ts",
  "SSOT_CONTRACT: cm-call-accept-gateway-patch-owner"
);
mustInclude("lib/community-messenger/incoming-call-accept-gateway.ts", "buildPostAcceptActiveCallHref");
mustInclude("lib/community-messenger/incoming-call-accept-gateway.ts", "patchCommunityMessengerCallSession");
mustInclude("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx", "acceptIncomingCallOnce");
mustInclude("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx", "skipRouteReplace: isVideoDirect");
mustNotInclude(
  "components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx",
  "incoming_banner_accept_route_first",
  "Global banner accept must not use route-first pattern"
);
mustInclude("lib/community-messenger/call-page-host-ownership.ts", "decideCommunityCallActiveHostOwnership");

// --- SSOT markers registry ---
const registry = read("lib/test-utils/ssot-source-contract-registry.ts");
for (const id of [
  "cm-deep-route-navigation-lock",
  "cm-call-accept-gateway-patch-owner",
  "dibay-signup-consent-only-gate",
]) {
  if (!registry.includes(id)) {
    failures.push(`ssot-source-contract-registry.ts missing entry: ${id}`);
  }
}

// --- Vitest contract file ---
mustInclude(
  "lib/community-messenger/__tests__/cm-kakao-telegram-navigation-contract.test.ts",
  "cm-kakao-telegram-navigation-contract.md"
);

if (failures.length > 0) {
  console.error("verify:cm-kakao-telegram-navigation-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:cm-kakao-telegram-navigation-contract PASS");
