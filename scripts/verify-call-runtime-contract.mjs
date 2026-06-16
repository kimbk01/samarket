#!/usr/bin/env node
/**
 * DIBAY call runtime contract — forbidden legacy strings and imports.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = [
  "lib/call",
  "components/call",
  "components/layout/providers/CallIncomingChrome.tsx",
  "components/layout/providers/CommunityMessengerActiveCallHost.tsx",
  "app/(main)/community-messenger/calls",
  "android/app/src/main/java/com/dibay/app",
];

const FORBIDDEN = [
  "[call-client]",
  "[cm-call-state]",
  "[cm-call-video]",
  "[redial-audit]",
  "[accept-audit]",
  "call_v3_override",
  "NEXT_PUBLIC_CALL_V3_ENABLED",
  "isCallV3Enabled",
  "tmp_",
];

const FORBIDDEN_IMPORTS = [
  "@/components/community-messenger/CommunityMessengerCallClient",
  "@/components/community-messenger/GlobalCommunityMessengerIncomingCall",
  "@/lib/community-messenger/outgoing-redial-handoff",
  "@/lib/community-messenger/call-session-navigation-seed",
  "@/lib/call-v3/",
  "call-v3-feature-flag",
];

const SKIP_DIR_NAMES = new Set(["node_modules", ".next", "__tests__", "docs"]);
const SKIP_EXT = new Set([".md", ".mdc", ".sql", ".spec.ts"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    out.push(dir);
    return out;
  }
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(ent.name)) continue;
    walk(path.join(dir, ent.name), out);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const rel of SCAN_DIRS) {
    const abs = path.join(ROOT, rel);
    walk(abs, files);
  }
  return [...new Set(files)].filter((f) => {
    const ext = path.extname(f);
    if (SKIP_EXT.has(ext)) return false;
    return /\.(ts|tsx|js|mjs|java)$/.test(f);
  });
}

const failures = [];

for (const file of collectFiles()) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      failures.push(`${rel}: forbidden "${needle}"`);
    }
  }
  for (const imp of FORBIDDEN_IMPORTS) {
    if (text.includes(imp)) {
      failures.push(`${rel}: forbidden import "${imp}"`);
    }
  }
}

if (failures.length) {
  console.error("verify:call-runtime-contract FAIL");
  for (const f of failures) console.error(" ", f);
  process.exit(1);
}

console.log("verify:call-runtime-contract PASS");
