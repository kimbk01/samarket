/**
 * R15 ABSOLUTE ZERO — regression proving Intro/System Start product absence.
 * Certifies burn, not old architecture.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, type AdminMenuItem } from "@/components/admin/admin-menu";

const ROOT = process.cwd();

const MUST_ABSENT = [
  "lib/intro",
  "lib/startup-compositor",
  "lib/startup/startup-intro-visual.ts",
  "lib/startup/startup-shell-markup.ts",
  "components/admin/intro",
  "app/admin/intro",
  "app/api/admin/intro",
  "app/api/intro",
  "android/app/src/main/java/com/dibay/app/intro",
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorHost.java",
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorSession.java",
  "android/app/src/main/java/com/dibay/app/DibayStartupEnvelopeVerifiedStore.java",
  "ios/App/App/DibayStartupCompositorHost.swift",
  "ios/App/App/Plugins/DibayIntroPackModel.swift",
  "ios/App/App/Plugins/DibaySystemStartLiveDelivery.swift",
  "native/system-start",
  "config/system-start.build.json",
] as const;

function collectMenuKeys(nodes: AdminMenuItem[], acc: string[] = []): string[] {
  for (const n of nodes) {
    acc.push(n.key);
    if (n.children?.length) collectMenuKeys(n.children, acc);
  }
  return acc;
}

describe("R15 Intro/System Start absolute zero", () => {
  it("exclusive product trees are absent", () => {
    for (const rel of MUST_ABSENT) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(false);
    }
  });

  it("admin navigation has no /admin/intro", () => {
    const keys = collectMenuKeys(adminMenu);
    expect(keys).not.toContain("promotion-intro");
    const paths: string[] = [];
    const walk = (nodes: AdminMenuItem[]) => {
      for (const n of nodes) {
        if (n.path) paths.push(n.path);
        if (n.children) walk(n.children);
      }
    };
    walk(adminMenu);
    expect(paths.some((p) => p === "/admin/intro" || p.startsWith("/admin/intro/"))).toBe(
      false
    );
  });
});
