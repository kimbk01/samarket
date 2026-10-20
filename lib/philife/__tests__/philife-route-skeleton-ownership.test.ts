/**
 * 필라이프 하위 화면 스켈레톤 소유 계약 (설계서 §13-2·3).
 *
 * 1. 피드가 아닌 화면(상세·글쓰기·내 활동·모임·구매 등)의 page/loading 은 피드 스켈레톤
 *    (`MainFeedRouteLoading` · `CommunityFeedSkeleton`)을 쓰지 않는다. 피드 스켈레톤은 피드 페이지 안에만.
 * 2. 한 경로의 스켈레톤 소유자는 하나 — 페이지가 자체 `Suspense` fallback 을 가지면
 *    같은 세그먼트(또는 상위 `philife/loading.tsx`)가 스켈레톤을 또 그리지 않는다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PHILIFE_DIR = join(ROOT, "app", "(main)", "philife");
const FEED_SKELETON_RE = /\b(MainFeedRouteLoading|CommunityFeedSkeleton)\b/;

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (name === "page.tsx" || name === "loading.tsx") out.push(full);
  }
  return out;
}

function rel(p: string): string {
  return relative(ROOT, p).split(sep).join("/");
}

function hasSkeletonSuspenseFallback(src: string): boolean {
  return /<Suspense\s+fallback=\{\s*<[A-Z]/.test(src);
}

function loadingRendersSomething(file: string): boolean {
  if (!existsSync(file)) return false;
  return !/return null;/.test(readFileSync(file, "utf8"));
}

describe("philife route skeleton ownership", () => {
  const files = listRouteFiles(PHILIFE_DIR);
  const feedPage = join(PHILIFE_DIR, "page.tsx");

  it("non-feed philife routes never render the feed skeleton", () => {
    const offenders = files
      .filter((f) => f !== feedPage)
      .filter((f) => FEED_SKELETON_RE.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("segment loading for /philife/** is neutral (covers non-feed subroutes)", () => {
    expect(loadingRendersSomething(join(PHILIFE_DIR, "loading.tsx"))).toBe(false);
  });

  it("detail route has its own structure skeleton", () => {
    const src = readFileSync(join(PHILIFE_DIR, "[postId]", "loading.tsx"), "utf8");
    expect(src).toContain("PhilifePostDetailSkeleton");
  });

  it("one skeleton owner per route: page Suspense fallback ⇒ no rendering loading.tsx on its path", () => {
    const doubled: string[] = [];
    for (const page of files.filter((f) => f.endsWith(`${sep}page.tsx`))) {
      if (!hasSkeletonSuspenseFallback(readFileSync(page, "utf8"))) continue;
      let dir = dirname(page);
      while (dir.startsWith(PHILIFE_DIR)) {
        if (loadingRendersSomething(join(dir, "loading.tsx"))) {
          doubled.push(`${rel(page)} + ${rel(join(dir, "loading.tsx"))}`);
        }
        if (dir === PHILIFE_DIR) break;
        dir = dirname(dir);
      }
    }
    expect(doubled).toEqual([]);
  });

  it("write / my fallbacks are their own structure skeletons", () => {
    expect(readFileSync(join(PHILIFE_DIR, "write", "page.tsx"), "utf8")).toContain("<PhilifeWriteSkeleton />");
    expect(readFileSync(join(PHILIFE_DIR, "my", "page.tsx"), "utf8")).toContain("PhilifeMyHubBodySkeleton");
  });
});
