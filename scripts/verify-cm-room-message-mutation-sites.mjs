#!/usr/bin/env node
/**
 * CM roomMessages mutation sites — every setRoomMessages writer must go through applyRoomMessagesMutation(kind).
 * @see docs/cm-room-telegram-kakao-parity-redesign.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const SCAN_DIRS = [
  "lib/community-messenger/room",
  "components/community-messenger/room",
];

const ALLOW_RAW_SET = new Set([
  // mutation bus itself
  "lib/community-messenger/room/messenger-room-messages-mutation.ts",
]);

/** raw setRoomMessages( that is not useState destructure / prop type / pass-through */
const RAW_CALL =
  /(?<!applyRoomMessagesMutation\()(?<!function\s)\bsetRoomMessages\s*\(\s*(?!\))/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

for (const relDir of SCAN_DIRS) {
  const abs = join(root, relDir);
  for (const file of walk(abs)) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (ALLOW_RAW_SET.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    // useState initializer line
    const withoutUseState = src.replace(
      /const\s*\[[^\]]*setRoomMessages[^\]]*\]\s*=\s*useState[\s\S]*?;/g,
      ""
    );
    const matches = withoutUseState.match(RAW_CALL);
    if (matches && matches.length > 0) {
      // filter prop passes: setRoomMessages,  or setRoomMessages:
      const callSites = [];
      const re = /\bsetRoomMessages\s*\(/g;
      let m;
      while ((m = re.exec(withoutUseState)) !== null) {
        const before = withoutUseState.slice(Math.max(0, m.index - 40), m.index);
        if (before.includes("applyRoomMessagesMutation(")) continue;
        callSites.push(m.index);
      }
      if (callSites.length > 0) {
        errors.push(`${rel}: raw setRoomMessages( at ${callSites.length} site(s) — use applyRoomMessagesMutation(kind)`);
      }
    }
  }
}

const mutation = readFileSync(join(root, "lib/community-messenger/room/messenger-room-messages-mutation.ts"), "utf8");
for (const kind of ['"replace"', '"append"', '"prepend"', '"clear"']) {
  if (!mutation.includes(kind) && !mutation.includes(kind.slice(1, -1))) {
    /* kinds are in type union */
  }
}
if (!mutation.includes("RoomMessagesMutationKind")) {
  errors.push("mutation bus missing RoomMessagesMutationKind");
}
if (!mutation.includes("notifyPrependComplete")) {
  errors.push("mutation bus must notifyPrependComplete on prepend");
}

if (errors.length > 0) {
  console.error("verify:cm-room-message-mutation-sites FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:cm-room-message-mutation-sites PASS");
