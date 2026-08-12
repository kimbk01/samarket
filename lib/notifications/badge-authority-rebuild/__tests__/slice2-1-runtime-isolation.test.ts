/**
 * Slice 2-1 — Runtime isolation: foundation must not be imported by product paths.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const FOUNDATION_MARKERS = [
  "badge-authority-rebuild/badge-authority-types",
  "badge-authority-rebuild/badge-recipient-identity",
  "badge-authority-rebuild/badge-event-classifier",
  "badge-authority-rebuild/badge-surface-eligibility",
  "badge-authority-rebuild/badge-count-units",
  "badge-authority-rebuild/badge-authority-assertions",
  "badge-authority-rebuild/member-notification-a-projection",
  "badge-authority-rebuild/member-communication-b-projection",
  "badge-authority-rebuild/store-communication-b-projection",
];

const ALLOW_A_PROJECTION_IMPORT = new Set([
  "lib/notifications/pipeline/build-domain-badge-authority-http.ts",
  "lib/notifications/apply-badge-count-authority-response.ts",
  "lib/notifications/inbox-read-bridge.ts",
  "components/philife/PhilifeHeaderNotificationInbox.tsx",
  "components/my/MyNotificationsView.tsx",
  // Gate 3 Step 8 — Notification Center detail uses A filter (same as list).
  "app/(main)/notifications/[notificationId]/page.tsx",
]);

const ALLOW_B_PROJECTION_IMPORT = new Set([
  "lib/notifications/build-notification-badge-projection.ts",
  "lib/notifications/pipeline/build-domain-badge-authority-http.ts",
  "lib/notifications/load-orphan-missed-call-facts.ts",
]);

const ALLOW_B_STORE_PROJECTION_IMPORT = new Set([
  "lib/chats/owner-hub-badge-snapshot.ts",
  "lib/chats/build-owner-hub-badge-payload.ts",
  "lib/community-messenger/store-order-chat-service.ts",
  "lib/order-domain/read-order-chat.ts",
]);

/** Equation registry documents A kinds — classifier import is intentional SSOT, not a product surface. */
const ALLOW_CLASSIFIER_IMPORT = new Set(["lib/notifications/badge-equation-registry.ts"]);

const PRODUCT_SCAN_ROOTS = ["app", "components", "hooks", "services", "android", "ios"];

/** lib product runtime dirs — exclude badge-authority-rebuild itself. */
const LIB_PRODUCT_GLOBS = [
  "lib/notifications",
  "lib/messenger",
  "lib/push",
  "lib/chats",
  "lib/chat-domain",
  "lib/community-messenger",
];

function walkFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "build" || ent.name === ".git") continue;
      // Allow foundation package itself
      if (p.replace(/\\/g, "/").includes("/badge-authority-rebuild")) continue;
      walkFiles(p, out);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|kt|java|swift)$/.test(ent.name)) continue;
    out.push(p);
  }
}

function isAllowlisted(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (n.includes("badge-authority-rebuild/")) return true;
  if (n.startsWith("scripts/")) return true;
  if (n.includes("__tests__/") || n.includes(".test.")) return true;
  return false;
}

describe("Slice 2-1 runtime isolation", () => {
  it("product runtime paths do not import Slice 2-1 foundation modules", () => {
    const files: string[] = [];
    for (const r of PRODUCT_SCAN_ROOTS) walkFiles(path.join(ROOT, r), files);
    for (const r of LIB_PRODUCT_GLOBS) walkFiles(path.join(ROOT, r), files);

    const hits: string[] = [];
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      if (isAllowlisted(rel)) continue;
      const src = fs.readFileSync(abs, "utf8");
      for (const marker of FOUNDATION_MARKERS) {
        if (!src.includes(marker)) continue;
        if (
          marker.includes("member-notification-a-projection") &&
          ALLOW_A_PROJECTION_IMPORT.has(rel)
        ) {
          continue;
        }
        if (
          marker.includes("member-communication-b-projection") &&
          ALLOW_B_PROJECTION_IMPORT.has(rel)
        ) {
          continue;
        }
        if (
          marker.includes("store-communication-b-projection") &&
          ALLOW_B_STORE_PROJECTION_IMPORT.has(rel)
        ) {
          continue;
        }
        if (
          marker.includes("badge-event-classifier") &&
          ALLOW_CLASSIFIER_IMPORT.has(rel)
        ) {
          continue;
        }
        hits.push(`${rel} :: ${marker}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("Phase B product paths stay free of unwired foundation (allow A/B projection adapters only)", () => {
    const phaseB = [
      "lib/notifications/chat-notification-attention-projection.ts",
      "lib/notifications/domain-app-icon-badge.ts",
      "lib/notifications/projection-authority.ts",
      "lib/notifications/pipeline/notify-push-dispatcher.ts",
      "lib/push/native/sync-native-badge-count.ts",
      "lib/notifications/notify-store-commerce.ts",
    ];
    for (const rel of phaseB) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const marker of FOUNDATION_MARKERS) {
        expect(src.includes(marker), `${rel} imports ${marker}`).toBe(false);
      }
      expect(src.includes("badge-authority-rebuild/badge-")).toBe(false);
    }
    // Slice 2-3 — Builder may import B projection only.
    const builder = fs.readFileSync(
      path.join(ROOT, "lib/notifications/build-notification-badge-projection.ts"),
      "utf8"
    );
    expect(builder).toContain("badge-authority-rebuild/member-communication-b-projection");
    expect(builder).not.toContain("badge-authority-rebuild/badge-count-units");
    expect(builder).not.toContain("badge-authority-rebuild/member-notification-a-projection");
  });
});
