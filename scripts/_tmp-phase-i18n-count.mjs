import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function countPaths(rels) {
  let n = 0;
  for (const rel of rels) {
    for (const file of walk(path.join(ROOT, rel))) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const t = line.trimStart();
        if (t.startsWith("//") || t.startsWith("*")) continue;
        if (!HANGUL.test(line)) continue;
        for (const p of PATTERNS) {
          p.lastIndex = 0;
          if (p.test(line)) {
            n++;
            break;
          }
        }
      }
    }
  }
  return n;
}

const phases = {
  "4_trade": [
    "app/(main)/market",
    "app/(main)/post",
    "app/(main)/write",
    "app/(main)/products",
    "components/home",
    "components/trade",
    "components/write/trade",
    "components/search",
  ],
  "5_chat_trade_only": ["components/chats", "app/(main)/chats"],
  "7_owner": ["app/(main)/stores/owner", "components/stores/owner", "app/(main)/my/business", "components/business"],
  "8_messenger": ["app/(main)/community-messenger", "components/community-messenger"],
  "9_philife": ["app/(main)/philife", "app/(main)/community", "components/philife", "components/community", "components/meetings"],
  "10_auth": ["app/(auth)", "app/(main)/onboarding", "components/auth", "components/signup"],
  "11_admin": ["app/admin", "components/admin"],
  "6_delivery_LAST": [
    "app/(main)/stores",
    "components/stores",
    "app/(main)/orders",
    "components/member-orders",
  ],
};

for (const [name, paths] of Object.entries(phases)) {
  console.log(name, countPaths(paths));
}
