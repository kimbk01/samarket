#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".java"]);
const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo"]);

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
    key: "raw localStorage call key",
    pattern: /localStorage\.[\s\S]{0,120}call/gi,
  },
  {
    key: "raw sessionStorage call key",
    pattern: /sessionStorage\.[\s\S]{0,120}call/gi,
  },
  {
    key: "raw lifecycle patch fetch",
    pattern:
      /fetch\([`'"].*\/api\/community-messenger\/calls\/sessions\/[^`'"]+[`'"][\s\S]{0,500}?method:\s*["']PATCH["'][\s\S]{0,500}?action:\s*["'](?:accept|reject|cancel|end|missed)["']/g,
  },
];

function isException(relPath) {
  if (relPath.startsWith("lib/community-messenger/call-engine/")) return true;
  if (relPath.startsWith("lib/community-messenger/call-http-actions.ts")) return true;
  if (relPath.startsWith("app/api/")) return true;
  if (relPath.startsWith("scripts/")) return true;
  if (relPath.includes("/__tests__/")) return true;
  if (relPath.includes(".test.")) return true;
  if (relPath.startsWith("tests/")) return true;
  return false;
}

function isRawStorageRule(key) {
  return key === "raw localStorage call key" || key === "raw sessionStorage call key";
}

function isRawStorageException(relPath) {
  return [
    "lib/call/permissions/call-permission-store.ts",
    "lib/call/qa/dibay-call-qa-log.ts",
    "lib/community-messenger/call-pip-metrics.ts",
    "lib/community-messenger/cm-call-debug.ts",
    "lib/community-messenger/room/use-messenger-room-client-phase1.ts",
    "lib/permissions/dibay-device-permission-onboarding.ts",
  ].includes(relPath);
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
    if (isRawStorageRule(rule.key) && isRawStorageException(rel)) continue;
    if (rule.pattern.test(src)) {
      failures.push(`${rule.key} found in ${rel}`);
    }
    rule.pattern.lastIndex = 0;
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
