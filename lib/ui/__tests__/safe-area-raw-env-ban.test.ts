import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Safe Area SSOT — `--safe-* = max(env(), var(--dibay-safe-*))` (`app/app-shell.css`).
 * Raw `env(safe-area-inset-*)` skips the Android native bridge value (Samsung WebView env bottom = 0).
 * Allowlist = SSOT definitions + call UI (call HARD LOCK, not in this scope) + admin guard.
 */
const root = process.cwd();

const ALLOW_EXACT = new Set([
  "app/app-shell.css",
  "app/samarket-components.css", // `.admin-landscape-guard` (admin scope)
  "lib/startup/local-runtime-markup.ts", // max(env, native) — same SSOT formula
  "lib/ui/safe-area-layout-classes.ts", // doc comment
  "components/community-messenger/CommunityMessengerCallClient.tsx",
  "components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx",
  "lib/community-messenger/call-pip-metrics.ts",
  // 아래 3개는 같은 작업 브랜치의 WP-B(알림)·WP-C(메신저)에서 제거된다.
  "app/(main)/notifications/page.tsx",
  "components/community-messenger/room/MessengerRoomNewMessagesBelowChip.tsx",
  "components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx",
]);

const ALLOW_PREFIX = [
  "components/messenger/call/",
  "components/community-messenger/call-ui/",
  "components/community-messenger/call-history/",
  "lib/community-messenger/call-ui/",
];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(abs);
  }
}

describe("safe-area raw env() ban", () => {
  it("user-facing code reads --safe-* tokens, not raw env()", () => {
    const files: string[] = [];
    for (const d of ["app", "components", "lib"]) walk(join(root, d), files);
    const offenders = files
      .map((abs) => relative(root, abs).split("\\").join("/"))
      .filter((rel) => !ALLOW_EXACT.has(rel) && !ALLOW_PREFIX.some((p) => rel.startsWith(p)))
      .filter((rel) => /env\(safe-area-inset-/.test(readFileSync(join(root, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
