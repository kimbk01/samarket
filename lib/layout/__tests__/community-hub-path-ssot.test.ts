/**
 * 커뮤니티 허브 경로 판정 SSOT (설계서 §13-1).
 *
 * 허브 루트(`/`·`/home`·`/philife`·`/community`) 판정은 `isCommunityHomeSurfacePath()` /
 * `COMMUNITY_HOME_SURFACE_PATHS` 만 쓴다. 같은 리터럴 집합을 다른 파일에 흩어 쓰면
 * `/home` 처럼 한 곳만 빠지는 결함이 재발하므로 소스 스캔으로 차단한다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib", "contexts", "hooks"];

/** SSOT 정의 파일 + 허브 판정이 아닌 리터럴(관리자 광고 「실제 노출 보기」 도메인 루트 href 라벨) */
const ALLOWED_FILES = new Set([
  "lib/layout/resolve-main-surface.ts",
  "lib/admin/ads-exposure/live-route.ts",
]);

/**
 * 허브 루트 리터럴 조합 (정확 일치 비교·배열):
 * - `=== "/philife"` 와 `=== "/community"` 가 한 식(160자) 안에
 * - `=== "/"` 와 `=== "/philife"` 가 한 식 안에
 * - `["/", "/philife"` · `"/philife", "/community"]` 배열
 */
const HUB_LITERAL_SET_RE = new RegExp(
  [
    String.raw`===\s*"/philife"(?![\w/-])[\s\S]{0,160}?===\s*"/community"(?![\w/-])`,
    String.raw`===\s*"/community"(?![\w/-])[\s\S]{0,160}?===\s*"/philife"(?![\w/-])`,
    String.raw`===\s*"/"(?![\w/-])[\s\S]{0,160}?===\s*"/philife"(?![\w/-])`,
    String.raw`===\s*"/philife"(?![\w/-])[\s\S]{0,160}?===\s*"/"(?![\w/-])`,
    String.raw`\[\s*"/"\s*,\s*"/philife"`,
    String.raw`"/philife"\s*,\s*"/community"\s*[\],]`,
  ].join("|"),
);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("community hub path SSOT", () => {
  it("no community hub root literal sets outside resolve-main-surface", () => {
    const offenders: string[] = [];
    for (const d of SCAN_DIRS) {
      for (const file of listSourceFiles(join(ROOT, d))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        if (ALLOWED_FILES.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        const m = HUB_LITERAL_SET_RE.exec(src);
        if (m) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${rel}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detector catches the legacy scattered form", () => {
    expect(HUB_LITERAL_SET_RE.test(`return p === "/" || p === "/philife" || p === "/community";`)).toBe(true);
    expect(HUB_LITERAL_SET_RE.test(`if (p === "/philife" || p.startsWith("/philife/")) return 1;`)).toBe(false);
    expect(HUB_LITERAL_SET_RE.test(`p === "/community-messenger" || p === "/philife"`)).toBe(false);
  });
});
