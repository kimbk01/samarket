import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SECTOR_HEADER_SIDE_VAR,
  SECTOR_HEADER_TOUCH_PX,
  resolveSectorHeaderSideWidthPx,
} from "@/lib/ui/sector-header-classes";

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/sector-header.css"), "utf8");
const bar = readFileSync(join(ROOT, "components/layout/sector-header/SectorHeaderBar.tsx"), "utf8");

function ruleBody(selector: string): string {
  const idx = css.indexOf(`\n${selector} {`);
  expect(idx, `missing rule ${selector}`).toBeGreaterThan(-1);
  const start = css.indexOf("{", idx);
  return css.slice(start + 1, css.indexOf("\n}", start));
}

describe("sector header — symmetric 3-column grid (v3 §12)", () => {
  it("default bar uses the same side var on both columns → title at true screen center", () => {
    const body = ruleBody(".sector-header-bar");
    expect(body).toMatch(
      /grid-template-columns:\s*minmax\(var\(--sector-header-side\), max-content\)\s*minmax\(0, 1fr\)\s*minmax\(var\(--sector-header-side\), max-content\);/
    );
    expect(body).toContain("column-gap: 0;");
    expect(css).toContain(`${SECTOR_HEADER_SIDE_VAR}: var(--sector-header-touch);`);
  });

  it("48px touch targets, 24px icons, 0 gap between touch targets", () => {
    expect(css).toContain("--sector-header-touch: 48px;");
    expect(css).toContain("--sector-header-touch-icon: 24px;");
    const body = ruleBody(".sector-header-bar");
    expect(body).toContain("--sector-header-back-size: var(--sector-header-touch);");
    expect(body).toContain("--sector-header-action-size: var(--sector-header-touch);");
    expect(body).toContain("--sector-header-icon-cluster-gap: 0px;");
    expect(ruleBody(".sector-header-bar .sector-header-back")).toContain("justify-content: center;");
  });

  it("edge padding = max(4px, safe-area) and no 768px row cap", () => {
    expect(css).toContain("--sector-header-edge-pad-left: max(4px, var(--safe-left));");
    expect(css).toContain("--sector-header-edge-pad-right: max(4px, var(--safe-right));");
    /** 메인 셸 루트가 이미 safe 만큼 들어와 있으면 차이만 더한다 (화면 끝 기준 max(4px, safe)) */
    expect(css).toContain("--sector-header-edge-pad-left: max(0px, calc(4px - var(--safe-left)));");
    expect(css).not.toContain("--sector-header-max-width");
    expect(ruleBody(".sector-header-bar")).toContain("max-width: none;");
  });

  it("title 17px / 600 on every device, single-line ellipsis", () => {
    expect(css).toContain("--sector-header-title-size: 17px;");
    expect(css).toContain("--sector-header-title-weight: 600;");
    expect(css).not.toMatch(/--sector-header-title-size:\s*18px/);
    expect(css).not.toMatch(/--sector-header-h:\s*56px/);
    const title = ruleBody(".sector-header-title");
    expect(title).toContain("text-overflow: ellipsis;");
    expect(title).toContain("white-space: nowrap;");
  });

  it("hub (left title) keeps its own geometry", () => {
    const hub = ruleBody(".sector-header-bar--left-title");
    expect(hub).toContain("grid-template-columns: var(--sector-header-left-slot) minmax(0, 1fr) auto;");
    expect(hub).toContain("--sector-header-action-size: 36px;");
  });

  it("SectorHeaderBar measures both slots and writes the side var", () => {
    expect(bar).toContain("resolveSectorHeaderSideWidthPx");
    expect(bar).toContain("SECTOR_HEADER_SIDE_VAR");
    expect(bar).toContain("ResizeObserver");
    expect(bar).toContain("SECTOR_HEADER_BAR_LEFT_TITLE_CLASS");
  });
});

describe("resolveSectorHeaderSideWidthPx", () => {
  it("returns null (CSS default 48px) when both sides fit one touch target", () => {
    expect(resolveSectorHeaderSideWidthPx(48, 48)).toBeNull();
    expect(resolveSectorHeaderSideWidthPx(48, 0)).toBeNull();
    expect(resolveSectorHeaderSideWidthPx(0, 0)).toBeNull();
  });

  it("uses the wider side so both columns match", () => {
    expect(resolveSectorHeaderSideWidthPx(48, 96)).toBe(96);
    expect(resolveSectorHeaderSideWidthPx(120, 48)).toBe(120);
    expect(resolveSectorHeaderSideWidthPx(48, 72.4)).toBe(73);
  });

  it("ignores invalid values", () => {
    expect(resolveSectorHeaderSideWidthPx(Number.NaN, -10)).toBeNull();
    expect(SECTOR_HEADER_TOUCH_PX).toBe(48);
  });
});
