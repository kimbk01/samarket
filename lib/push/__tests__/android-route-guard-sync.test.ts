/**
 * LINK-02 — DibayAppRouteGuard.ALLOWED_ROOT_SEGMENTS (Android) must list every user-facing
 * top-level app route, otherwise a legitimate deep link would be dropped on native.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const NON_PAGE = new Set(["api", "_providers", "dev", "debug"]);

function routeFolders(dir: string): string[] {
  return readdirSync(dir).filter((name) => {
    if (name.startsWith("(") || NON_PAGE.has(name)) return false;
    return statSync(path.join(dir, name)).isDirectory();
  });
}

describe("Android DibayAppRouteGuard root segments ↔ app routes", () => {
  it("matches app/(main)/* and app/* page folders", () => {
    const java = readFileSync(path.join(root, "android/app/src/main/java/com/dibay/app/DibayAppRouteGuard.java"), "utf8");
    const block = /Arrays\.asList\(([\s\S]*?)\)\)\);/.exec(java)?.[1] ?? "";
    const javaRoots = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    const appRoots = [...new Set([...routeFolders(path.join(root, "app/(main)")), ...routeFolders(path.join(root, "app"))])].sort();
    expect(javaRoots).toEqual(appRoots);
  });
});
