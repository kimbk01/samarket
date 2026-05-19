/**
 * App Boot consent contract verification.
 *
 * Prevents the `/philife` or `/stores` <-> `/auth/consent?next=...` RSC loop:
 * - boot/minimal profile must include legal consent fields because AuthComplianceRedirect reads boot first
 * - boot/minimal responses must not be promoted into the full profile dedupe cache
 * - AuthComplianceRedirect must coalesce duplicate boot events before issuing consent redirects
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
const authCompliance = read("components/auth/AuthComplianceRedirect.tsx");

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
  ]) {
    assertIncludes(liteSelect, `"${field}"`, "SELECT_ME_PROFILE_LITE must carry consent state");
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
  authCompliance,
  "fetchMeProfileDeduped(\"auth_compliance_consent_check\")",
  "AuthComplianceRedirect must verify consent with full profile when boot is incomplete"
);
assertIncludes(
  authCompliance,
  "redirectInFlightTargetRef",
  "AuthComplianceRedirect must coalesce duplicate consent redirects"
);

if (process.exitCode) {
  console.error("→ 의도적 변경이면 App Boot consent 계약과 이 검증 스크립트를 함께 갱신하세요.");
  process.exit(process.exitCode);
}

console.log("verify-app-boot-consent-contract: ok");
