import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const REMOVED_WRAPPER = join(ROOT, "utils", "notificationSound.ts");

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      files.push(...sourceFiles(path));
    } else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

describe("notification dead wrapper ban", () => {
  it("does not restore the importer-free notificationSound wrapper", () => {
    expect(existsSync(REMOVED_WRAPPER)).toBe(false);
    const importers = ["app", "components", "lib", "services", "utils"]
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((path) =>
        /(?:@\/|\.\.\/|\.\.\/\.\.\/)utils\/notificationSound/.test(
          readFileSync(path, "utf8")
        )
      )
      .map((path) => relative(ROOT, path));
    expect(importers).toEqual([]);
  });

  it("keeps evidence-backed live sound and Engine modules", () => {
    for (const path of [
      "lib/notifications/play-notification-sound.ts",
      "lib/notifications/notification-sound-engine.ts",
      "lib/notifications/engine/run-engine-persistence-pipeline.ts",
      "lib/notifications/publish-notification-side-effect.ts",
    ]) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });
});
