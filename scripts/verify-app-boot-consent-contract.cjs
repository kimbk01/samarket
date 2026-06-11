/**
 * App Boot + DIBAY signup gate contract verification.
 *
 * Prevents `/philife` or private routes <-> `/auth/onboarding/*` client redirect loops:
 * - boot/minimal profile must include legal consent + dibay identity fields
 * - boot/minimal responses must not be promoted into the full profile dedupe cache
 * - DibaySignupGate must coalesce duplicate boot events before issuing signup redirects
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`verify-app-boot-consent-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

const profileRowSafe = read("lib/profile/fetch-profile-row-safe.ts");
const profileDedupe = read("lib/profile/fetch-me-profile-deduped.ts");
const signupGate = read("components/auth/DibaySignupGate.tsx");

const liteSelectMatch = profileRowSafe.match(
  /const SELECT_ME_PROFILE_LITE = \[([\s\S]*?)\]\.join\(", "\);/
);
if (!liteSelectMatch) {
  fail("could not find SELECT_ME_PROFILE_LITE");
} else {
  const liteSelect = liteSelectMatch[1];
  for (const field of [
    "terms_accepted_at",
    "terms_version",
    "privacy_accepted_at",
    "privacy_version",
    "dibay_id",
    "dibay_id_locked",
    "onboarding_completed_at",
  ]) {
    assertIncludes(liteSelect, `"${field}"`, "SELECT_ME_PROFILE_LITE must carry signup gate state");
  }
}

const primeMatch = profileDedupe.match(
  /export function primeMeProfileDedupedFromBoot\([\s\S]*?\n\}/
);
if (!primeMatch) {
  fail("could not find primeMeProfileDedupedFromBoot");
} else if (/cachedFull\s*=/.test(primeMatch[0])) {
  fail("primeMeProfileDedupedFromBoot must not write cachedFull with minimal profile data");
}

assertIncludes(
  signupGate,
  "fetchSignupStatusDeduped",
  "DibaySignupGate must verify signup with signup-status API when boot is incomplete"
);
assertIncludes(
  signupGate,
  "redirectInFlightTargetRef",
  "DibaySignupGate must coalesce duplicate signup redirects"
);
assertIncludes(
  signupGate,
  "shouldBlockUnauthenticatedHtmlRequest",
  "DibaySignupGate must only redirect on private paths (guest browse allowed)"
);

if (process.exitCode) {
  console.error("→ 의도적 변경이면 App Boot signup gate 계약과 이 검증 스크립트를 함께 갱신하세요.");
  process.exit(process.exitCode);
}

console.log("verify-app-boot-consent-contract: ok");
