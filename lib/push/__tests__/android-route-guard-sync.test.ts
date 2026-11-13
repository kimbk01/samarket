/**
 * LINK-02 — DibayAppRouteGuard.ALLOWED_ROOT_SEGMENTS (Android) must list every user-facing
 * top-level app route, otherwise a legitimate deep link would be dropped on native.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const NON_PAGE = new Set(["api", "_providers", "dev", "debug"]);
/**
 * 웹 전용 공개 착지 페이지 — 앱 안으로 딥링크되지 않는다(App Links·AASA 는 `/f/` 만 선언).
 * - `download`: 앱 공유 착지(앱 소개·설치 안내, Owner G-1 2026-11-14). 앱에서는 MY → 공유 시트로만 쓰고 이 주소로 이동하지 않는다.
 * 네이티브 허용 목록에 넣으려면 네이티브 빌드가 필요하므로(일괄 빌드 규정) 여기서 명시적으로 뺀다.
 */
const WEB_ONLY_ROOTS = new Set(["download"]);

function routeFolders(dir: string): string[] {
  return readdirSync(dir).filter((name) => {
    if (name.startsWith("(") || NON_PAGE.has(name) || WEB_ONLY_ROOTS.has(name)) return false;
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
