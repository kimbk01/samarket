/**
 * Messenger legacy routes:
 * - /group-chat (index) must server-redirect to community-messenger
 * - /group-chat/[roomId] is experimental large-group axis (NOT CM private_group).
 *   It must NOT re-export Community Messenger room client.
 *   Deep-link generators must not prefer /group-chat over CM for private_group.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

const indexPage = path.join(root, "app/(main)/group-chat/page.tsx");
const roomPage = path.join(root, "app/(main)/group-chat/[roomId]/page.tsx");

if (!fs.existsSync(indexPage)) {
  failures.push("missing group-chat/page.tsx");
} else {
  const t = fs.readFileSync(indexPage, "utf8");
  if (!/redirect\s*\(/.test(t) || !/community-messenger/.test(t)) {
    failures.push("group-chat/page.tsx must redirect to community-messenger");
  }
}

if (!fs.existsSync(roomPage)) {
  failures.push("missing group-chat/[roomId]/page.tsx");
} else {
  const t = fs.readFileSync(roomPage, "utf8");
  if (/community-messenger\/room|MessengerRoom|use-messenger-room/.test(t)) {
    failures.push("group-chat/[roomId] must not mount CM room runtime (separate experimental axis)");
  }
  if (!/GroupChatRoomClient|loadGroupChatBootstrapForUser/.test(t)) {
    failures.push("group-chat/[roomId] expected experimental GroupChat bootstrap (or convert to redirect with product decision)");
  }
}

if (failures.length) {
  console.error("[verify:messenger-legacy-route-ban] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:messenger-legacy-route-ban] OK — group-chat index redirects; room stays experimental axis");
