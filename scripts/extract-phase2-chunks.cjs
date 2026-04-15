"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = path.join(root, "components/community-messenger/room/CommunityMessengerRoomPhase2.tsx");
const L = fs.readFileSync(src, "utf8").split(/\r?\n/);
const out = path.join(root, "components/community-messenger/room/phase2/_extract");
fs.mkdirSync(out, { recursive: true });
function slice1(a, b) {
  return L.slice(a - 1, b).join("\n");
}
const chunks = {
  header: [328, 393],
  attachmentsTrade: [395, 429],
  timeline: [431, 919],
  messageOverlays: [921, 1076],
  composer: [1078, 1241],
  roomSheets: [1243, 2587],
  memberModal: [2589, 2737],
  callLayer: [2739, 2784],
};
for (const [k, [a, b]] of Object.entries(chunks)) {
  fs.writeFileSync(path.join(out, `${k}.txt`), slice1(a, b));
}
console.log("extracted", Object.keys(chunks).length);
