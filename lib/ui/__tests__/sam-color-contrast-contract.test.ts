import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 공통 버튼·상태 색 가독성 계약 (내정보 v3 실화면 설계 §3 · P5).
 * - 캐스케이드 레이어 순서 선언이 globals.css 첫 규칙인지 (preflight 가 sam-* 를 이기던 역전 재발 방지)
 * - 시그니처 그린 위 크림 글자 · 상태색 글자의 대비 4.5:1 이상
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(a: string, pctA: number, b: string): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const out = ra.map((v, i) => Math.round(v * (pctA / 100) + rb[i] * (1 - pctA / 100)));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rootToken(css: string, name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`token ${name} not found as hex`);
  return m[1];
}

describe("sam color contrast contract", () => {
  const tokens = read("app/design-tokens.css");
  const green = rootToken(tokens, "--dibay-green");
  const cream = rootToken(tokens, "--dibay-cream");
  const danger = rootToken(tokens, "--sm-color-danger");

  it("globals.css 첫 규칙 = 캐스케이드 레이어 순서 선언", () => {
    const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(css.startsWith("@layer properties, theme, base, components, utilities;")).toBe(true);
  });

  it("sam-btn--primary 는 on-primary 글자색을 직접 지정", () => {
    const comp = read("app/samarket-components.css");
    const block = comp.match(/\.sam-btn--primary\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toMatch(/color:\s*var\(--sam-text-on-primary\)/);
    expect(tokens).toMatch(/--sam-text-on-primary:\s*var\(--dibay-cream\)/);
  });

  it("시그니처 그린(기본·눌림·활성) 위 크림 글자 대비 ≥ 4.5", () => {
    expect(green.toLowerCase()).toBe("#0b421a");
    expect(contrast(green, cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(green, 88, "#000000"), cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(green, 78, "#000000"), cream)).toBeGreaterThanOrEqual(4.5);
  });

  it("그린 글자(완료 배지) · 위험 글자 — 크림 배경 대비", () => {
    expect(contrast(green, cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(danger, cream)).toBeGreaterThanOrEqual(3);
  });
});
