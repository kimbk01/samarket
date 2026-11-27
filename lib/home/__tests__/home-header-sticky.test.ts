import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 홈 머리줄 고정 (Owner 「구현 진행」 2026-11-27 · docs/audit/home-header-fixed-2026-11-27).
 * 홈은 셸 1단을 끄고 머리줄을 본문 스크롤 안에 그린다 → `.home-r3-hdr` 가 sticky 가 아니면 본문과 같이 스크롤된다(운영 FAIL).
 */
const root = process.cwd();
const css = readFileSync(join(root, "app/home-hub.css"), "utf8");
const screen = readFileSync(join(root, "components/home-hub/HomeScreen.tsx"), "utf8");

function baseRule(selector: string): string {
  const re = new RegExp(`(^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[2] ?? "";
}

describe("home header sticky", () => {
  it(".home-r3-hdr 는 본문 스크롤 맨 위에 붙는다", () => {
    const rule = baseRule(".home-r3-hdr");
    expect(rule).toMatch(/position:\s*sticky;/);
    expect(rule).toMatch(/top:\s*0;/);
    expect(rule).toMatch(/z-index:\s*10;/);
  });

  it("머리줄은 HomeScreen 의 home-r3-hdr 이고 당김 슬롯은 머리줄 안에 그대로 있다", () => {
    const hdrStart = screen.indexOf('<header className="home-r3-hdr"');
    const hdrEnd = screen.indexOf("</header>", hdrStart);
    expect(hdrStart).toBeGreaterThan(-1);
    expect(screen.slice(hdrStart, hdrEnd)).toContain("<DibayPtrSlot store={homePtrStore}");
  });
});
