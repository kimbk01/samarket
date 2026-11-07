import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * B-16 (2026-11-08) — 헤더 아래 줄(stickyBelow)은 PC 에서 헤더 제목과 같은 본문 열(D2).
 * 탭 줄은 `DibaySecondaryTabRow`·B-8 로 이미 맞음 — 남은 검색 입력 줄 2곳을 같은 방식으로 고정한다.
 */
describe("header-below search rows use the main column (B-16)", () => {
  for (const file of ["components/search/SearchView.tsx", "components/search/global/GlobalSearchView.tsx"]) {
    it(file, () => {
      const src = read(file);
      expect(src).toMatch(
        /<div className="border-b border-sam-border bg-\[var\(--sub-bg\)\]">\s*\{\/\*[^*]*\*\/\}\s*<div className=\{APP_MAIN_COLUMN_CLASS\}>\s*<div className="flex h-12 items-center gap-2 px-4 py-1\.5">/
      );
    });
  }
});
