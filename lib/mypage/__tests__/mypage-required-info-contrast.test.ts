import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 필수 정보 3행 글자 대비 ≥ 4.5:1 (라이트 테마 토큰 값 기준).
 * 카드는 `--sam-danger`·`--sam-warning` 을 검정과 섞어(78%·70%) 연한 배경 위 글자/채움 배지에 쓴다.
 * 토큰 원값이 바뀌면 이 테스트가 다시 계산한다.
 */

type Rgb = [number, number, number];

function hex(h: string): Rgb {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}
/** color-mix(in srgb, a p%, b) */
function mix(a: Rgb, p: number, b: Rgb): Rgb {
  return a.map((c, i) => c * p + b[i] * (1 - p)) as Rgb;
}
function lum([r, g, b]: Rgb): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const tokens = readFileSync(path.join(process.cwd(), "app/design-tokens.css"), "utf8");
function token(name: string): string {
  const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const danger = hex(token("--sm-color-danger"));
const dangerSoft = hex(token("--sam-danger-soft"));
const gold = hex(token("--dibay-gold"));
const brown = hex(token("--dibay-brown"));
const cream = hex(token("--dibay-cream"));
const card = hex(token("--dibay-card"));
// --sam-warning = mix(brown 54%, gold) · --sam-warning-soft = mix(gold 38%, cream)
const warning = mix(brown, 0.54, gold);
const warningSoft = mix(gold, 0.38, cream);

const dangerStrong = mix(danger, 0.78, BLACK);
const warningStrong = mix(warning, 0.7, BLACK);

describe("필수 정보 3행 대비", () => {
  it("원 토큰은 연한 배경 위 4.5:1 미달 — 그래서 카드 안에서만 어둡게 섞는다", () => {
    expect(contrast(danger, dangerSoft)).toBeLessThan(4.5);
  });

  it("빨강 값 글자 on danger-soft · 흰 글자 on 빨강 채움 배지 ≥ 4.5", () => {
    expect(contrast(dangerStrong, dangerSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, dangerStrong)).toBeGreaterThanOrEqual(4.5);
  });

  it("주황 값 글자 on warning-soft · 흰 글자 on 주황 채움 배지 · 주황 테두리 배지 글자 on 카드 ≥ 4.5", () => {
    expect(contrast(warningStrong, warningSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, warningStrong)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(warningStrong, card)).toBeGreaterThanOrEqual(4.5);
  });

  it("컴포넌트가 같은 혼합 비율을 쓴다", () => {
    const src = readFileSync(path.join(process.cwd(), "components/mypage/home/MypageRequiredInfoSummary.tsx"), "utf8");
    expect(src).toContain("color-mix(in_srgb,var(--sam-danger)_78%,#000)");
    expect(src).toContain("color-mix(in_srgb,var(--sam-warning)_70%,#000)");
  });
});
