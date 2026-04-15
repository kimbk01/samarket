"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const keysPath = path.join(root, "components/community-messenger/room/phase2/_view_destructure_block.txt");
const phase2Dir = path.join(root, "components/community-messenger/room/phase2");

function parseKeys() {
  const text = fs.readFileSync(keysPath, "utf8");
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s+([a-zA-Z_][a-zA-Z0-9_]*),?\s*$/.exec(line);
    if (m) keys.push(m[1]);
  }
  return [...new Set(keys)];
}

function stripDestructure(content) {
  return content.replace(
    /\r?\n  const \{\r?\n[\s\S]*?\r?\n  \} = useMessengerRoomPhase2View\(\);\r?\n/,
    "\n  const vm = useMessengerRoomPhase2View();\n"
  );
}

function prefixKeys(content, keys) {
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "g");
    content = content.replace(re, (match, offset, str) => {
      if (offset > 0 && str[offset - 1] === ".") return match;
      if (offset > 0 && (str[offset - 1] === "-" || str[offset - 1] === '"' || str[offset - 1] === "'")) return match;
      const end = offset + key.length;
      if (end < str.length && str[end] === "-") return match;
      const before3 = str.slice(Math.max(0, offset - 3), offset);
      if (before3 === "vm.") return match;
      return `vm.${key}`;
    });
  }
  return content;
}

const files = [
  "CommunityMessengerRoomPhase2MessageTimeline.tsx",
  "CommunityMessengerRoomPhase2MessageOverlays.tsx",
  "CommunityMessengerRoomPhase2Composer.tsx",
  "CommunityMessengerRoomPhase2RoomSheets.tsx",
  "CommunityMessengerRoomPhase2MemberActionModal.tsx",
  "CommunityMessengerRoomPhase2CallLayer.tsx",
  "CommunityMessengerRoomPhase2Header.tsx",
  "CommunityMessengerRoomPhase2AttachmentsAndTrade.tsx",
];

const keys = parseKeys();
for (const f of files) {
  const p = path.join(phase2Dir, f);
  let c = fs.readFileSync(p, "utf8");
  const before = c;
  c = stripDestructure(c);
  if (c === before) {
    console.warn("no destructure stripped:", f);
  }
  c = prefixKeys(c, keys);
  fs.writeFileSync(p, c);
  console.log("updated", f);
}
