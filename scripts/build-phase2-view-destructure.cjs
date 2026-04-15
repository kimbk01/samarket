"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const phase1Path = path.join(root, "lib/community-messenger/room/use-messenger-room-client-phase1.ts");
const ctrlPath = path.join(root, "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");

function parseReturnKeys(srcPath) {
  const text = fs.readFileSync(srcPath, "utf8");
  const i = text.indexOf("\n  return {");
  if (i < 0) throw new Error("return not found: " + srcPath);
  const sub = text.slice(i);
  const end = sub.indexOf("\n  };");
  const block = sub.slice(0, end);
  const keys = [];
  for (const line of block.split("\n")) {
    const m = /^\s{2}([a-zA-Z_][a-zA-Z0-9_]*),?\s*$/.exec(line);
    if (m && m[1] !== "return") keys.push(m[1]);
  }
  return keys;
}

const phase1Keys = parseReturnKeys(phase1Path);
const ctrlText = fs.readFileSync(ctrlPath, "utf8");
const retI = ctrlText.indexOf("  return {");
const retSub = ctrlText.slice(retI);
const spreadEnd = retSub.indexOf("...phase1");
if (spreadEnd < 0) throw new Error("spread phase1 not found");
const afterSpread = retSub.slice(spreadEnd);
const explicit = [];
for (const line of afterSpread.split("\n")) {
  const m = /^\s{4}([a-zA-Z_][a-zA-Z0-9_]*),?\s*$/.exec(line);
  if (m) explicit.push(m[1]);
  if (/^\s*}\s*;\s*$/.test(line)) break;
}

const seen = new Set();
const ordered = [];
for (const k of [...phase1Keys, ...explicit]) {
  if (seen.has(k)) continue;
  seen.add(k);
  ordered.push(k);
}

const body = ordered.map((k) => `    ${k},`).join("\n");
const destructure = `  const {\n${body}\n  } = useMessengerRoomPhase2View();`;

const out = path.join(root, "components/community-messenger/room/phase2/_view_destructure_block.txt");
fs.writeFileSync(out, destructure);
console.log("wrote", out, "keys", ordered.length);
