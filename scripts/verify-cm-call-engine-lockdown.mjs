#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".java"]);
/** `.qa-logs/` = local QA scratch output (not shipped app code). */
const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo", ".qa-logs"]);

const failures = [];

const OUTGOING_CTA_FILES = [
  "components/community-messenger/CommunityMessengerHome.tsx",
  "components/community-messenger/MessengerCallLogsPanel.tsx",
  "components/chats/TradeChatCallHeaderButtons.tsx",
  "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts",
  "app/(main)/community-messenger/calls/outgoing/CommunityMessengerOutgoingDialPageClient.tsx",
];

const BLOCKING_OUTGOING_HELPER_NAMES = [
  "bootstrapCommunityMessengerOutgoingCallAndNavigate",
  "startOutgoingCallSessionAndOpen",
];

const RULES = [
  {
    key: "accept patch direct",
    pattern: /patchCommunityMessengerCallSession\([\s\S]{0,160}"accept"/g,
  },
  {
    key: "reject patch direct",
    pattern: /patchCommunityMessengerCallSession\([\s\S]{0,160}"reject"/g,
  },
  {
    key: "end patch direct",
    pattern: /patchCommunityMessengerCallSession\([\s\S]{0,160}"end"/g,
  },
  {
    key: "missed patch direct",
    pattern: /patchCommunityMessengerCallSession\([\s\S]{0,160}"missed"/g,
  },
  {
    key: "native direct patch",
    pattern: /CallSessionPatchHelper\.patch/g,
  },
  {
    key: "direct agora join",
    pattern: /joinCommunityMessengerAgoraChannelOnce/g,
  },
  {
    key: "foreground native pill",
    pattern: /IncomingCallForegroundUiLauncher\.showUi/g,
  },
  {
    key: "legacy native_auto_fullscreen",
    pattern: /native_auto_fullscreen/g,
  },
  {
    key: "direct call route push",
    pattern: /router\.push\(["'`]\s*\/community-messenger\/calls/g,
  },
  {
    key: "direct call route replace",
    pattern: /router\.replace\(["'`]\s*\/community-messenger\/calls/g,
  },
  {
    key: "raw lifecycle patch fetch",
    pattern:
      /fetch\([`'"].*\/api\/community-messenger\/calls\/sessions\/[^`'"]+[`'"][\s\S]{0,500}?method:\s*["']PATCH["'][\s\S]{0,500}?action:\s*["'](?:accept|reject|cancel|end|missed)["']/g,
  },
];

/**
 * Call engines that own lifecycle PATCH / call storage (docs/dibay-call-native-runtime-ssot.md
 * 「Legacy V4/Web — Android Removed / Desktop Quarantine」): call-engine, Call V3 safe lane
 * (a13bdc8d5), Call V4 lane (b3e73a628).
 */
const CALL_ENGINE_DIRS = [
  "lib/community-messenger/call-engine/",
  "lib/community-messenger/call-v3/",
  "lib/community-messenger/call-v4/",
];

/**
 * V4 redirect (daa880b49 · b541e4102): the legacy `/community-messenger/calls/[sessionId]` page may
 * `router.replace` ONLY to the V4 route or the outgoing dial page, gated by the V4 lane flag.
 * Any other direct call-route replace in that file still fails.
 */
const V4_REDIRECT_PAGE = "app/(main)/community-messenger/calls/[sessionId]/page.tsx";
const V4_REDIRECT_ALLOWED_TARGETS = [
  "/community-messenger/calls-v4/",
  "/community-messenger/calls/outgoing",
];

function isAllowedV4RedirectMatch(relPath, ruleKey, src, matchIndex, matchText) {
  if (relPath !== V4_REDIRECT_PAGE || ruleKey !== "direct call route replace") return false;
  if (!src.includes("isCallV4TelegramLaneEnabled()") || !/if\s*\(\s*!sessionId\s*\|\|\s*!v4Lane\s*\)\s*return;/.test(src)) {
    return false;
  }
  const targetStart = matchIndex + matchText.indexOf("/community-messenger/calls");
  const rest = src.slice(targetStart, targetStart + 64);
  return V4_REDIRECT_ALLOWED_TARGETS.some((t) => rest.startsWith(t));
}

function isException(relPath) {
  if (CALL_ENGINE_DIRS.some((dir) => relPath.startsWith(dir))) return true;
  if (relPath.startsWith("lib/community-messenger/call-http-actions.ts")) return true;
  if (relPath.startsWith("app/api/")) return true;
  if (relPath.startsWith("scripts/")) return true;
  if (relPath.includes("/__tests__/")) return true;
  if (relPath.includes(".test.")) return true;
  if (relPath.startsWith("tests/")) return true;
  return false;
}

function isRawStorageException(relPath) {
  return [
    "lib/call/permissions/call-permission-store.ts",
    // Permission-domain nudge flag (`dibay_battery_call_boundary_settings_nudged`) — same class as
    // the permission stores above; not call session state.
    "lib/permissions/permission-manager/call-boundary-battery-optimization-check.ts",
    "lib/call/qa/dibay-call-qa-log.ts",
    "lib/community-messenger/call-pip-metrics.ts",
    "lib/community-messenger/cm-call-debug.ts",
    "lib/community-messenger/room/use-messenger-room-client-phase1.ts",
    "lib/permissions/dibay-device-permission-onboarding.ts",
  ].includes(relPath);
}

/**
 * Raw storage call key: a Web Storage read/write whose KEY expression as written (string literal /
 * template, or the key identifier name) has a `call`/`calls` word token. Matches on the key only —
 * not on `.call(` / `CALLER` / comments / log text that happen to sit near a storage access.
 */
const STORAGE_KEY_ACCESS =
  /\b(localStorage|sessionStorage)\s*(?:\.\s*(?:getItem|setItem|removeItem)\s*\(\s*([^,)]+?)\s*[,)]|\[\s*([^\]]+?)\s*\])/g;

function keyWordTokens(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

function findRawStorageCallKeys(src) {
  const hits = [];
  STORAGE_KEY_ACCESS.lastIndex = 0;
  let m;
  while ((m = STORAGE_KEY_ACCESS.exec(src)) !== null) {
    const keyExpr = m[2] ?? m[3] ?? "";
    const keyText = keyExpr.trim();
    const tokens = keyWordTokens(keyText);
    if (tokens.includes("call") || tokens.includes("calls")) {
      hits.push({ storage: m[1], keyText });
    }
  }
  return hits;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!SCAN_EXT.has(path.extname(entry.name))) continue;
    out.push(abs);
  }
}

const files = [];
walk(ROOT, files);

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replaceAll(path.sep, "/");
  if (isException(rel)) continue;
  const src = fs.readFileSync(abs, "utf8");
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(src)) !== null) {
      if (isAllowedV4RedirectMatch(rel, rule.key, src, m.index, m[0])) continue;
      failures.push(`${rule.key} found in ${rel}`);
      break;
    }
    rule.pattern.lastIndex = 0;
  }
  if (!isRawStorageException(rel)) {
    const seen = new Set();
    for (const hit of findRawStorageCallKeys(src)) {
      const label = `raw ${hit.storage} call key found in ${rel}`;
      if (seen.has(label)) continue;
      seen.add(label);
      failures.push(`${label} (key: ${hit.keyText})`);
    }
  }
}

for (const rel of OUTGOING_CTA_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`outgoing CTA file missing: ${rel}`);
    continue;
  }
  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes("launchOutgoingDirectCall")) {
    failures.push(`outgoing CTA must use launchOutgoingDirectCall: ${rel}`);
  }
  for (const helper of BLOCKING_OUTGOING_HELPER_NAMES) {
    if (src.includes(helper)) {
      failures.push(`blocking outgoing helper import banned in ${rel}: ${helper}`);
    }
  }
}

const navSeed = path.join(ROOT, "lib/community-messenger/call-session-navigation-seed.ts");
if (fs.existsSync(navSeed)) {
  const navSrc = fs.readFileSync(navSeed, "utf8");
  for (const helper of BLOCKING_OUTGOING_HELPER_NAMES) {
    if (navSrc.includes(`export async function ${helper}`)) {
      failures.push(`blocking outgoing helper must be removed: ${helper}`);
    }
  }
}

if (failures.length > 0) {
  console.error("verify:cm-call-engine-lockdown FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:cm-call-engine-lockdown PASS");
