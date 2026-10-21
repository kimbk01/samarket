/**
 * IA-19 (4단계 4-6) — 오너 UI 토큰 래칫.
 * 오너 화면 파일에서 하드코딩 hex·원시 Tailwind 팔레트·비표준 반경이 0 인지 검사한다.
 * 허용: `--sam-*`/`--biz-*` 토큰·`sam-*` 유틸·`Sam.*`·`rounded-ui-rect`·`rounded-full`·`rounded-none`,
 * 떠 있는 시트/다이얼로그의 오버레이 반경 계약(`rounded-[length:var(--overlay-radius-*)]`),
 * 독립 HTML 문서의 `--sam-*: #hex` 토큰 선언(앱 CSS 를 로드하지 않는 Route Handler 실패 문서).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

const OWNER_UI_DIRS = ["components/business", "components/stores/owner", "app/(main)/stores/owner"];
const OWNER_UI_EXTRA_FILES = [
  "app/owner-compact-shell.css",
  "lib/business/owner-order-chat-ensure-document.ts",
];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(tsx|ts|css)$/.test(name) && !/\.test\./.test(name)) {
      out.push(p);
    }
  }
}

function ownerUiFiles(): string[] {
  const out: string[] = [];
  for (const d of OWNER_UI_DIRS) walk(join(ROOT, d), out);
  for (const name of readdirSync(join(ROOT, "components/finance"))) {
    if (name.startsWith("Owner") && /\.(tsx|ts)$/.test(name)) out.push(join(ROOT, "components/finance", name));
  }
  for (const f of OWNER_UI_EXTRA_FILES) out.push(join(ROOT, f));
  return out;
}

/** 주석 제거(블록·줄) — `https://` 등 문자열 안의 `//` 는 앞이 공백/줄머리일 때만 주석으로 본다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

const HEX = /(?<!--[\w-]+:\s*)#[0-9a-fA-F]{3,8}\b/g;
const PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|accent|decoration)(?:-[trblxy])?-(?:white|black|gray|slate|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)(?:-\d{2,3})?\b/g;
const RADIUS =
  /\brounded(?:-(?:tl|tr|bl|br|ss|se|es|ee|t|b|l|r|s|e))?(?:-(?:sm|md|lg|xl|2xl|3xl|\[(?!length:var\(--overlay-radius-)[^\]]+\]))?(?=[\s"'`]|$)/gm;

type Hit = { file: string; kind: "hex" | "palette" | "radius"; match: string };

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const abs of ownerUiFiles()) {
    const src = stripComments(readFileSync(abs, "utf8"));
    const file = relative(ROOT, abs);
    for (const m of src.match(HEX) ?? []) hits.push({ file, kind: "hex", match: m });
    for (const m of src.match(PALETTE) ?? []) hits.push({ file, kind: "palette", match: m });
    for (const m of src.match(RADIUS) ?? []) hits.push({ file, kind: "radius", match: m });
  }
  return hits;
}

describe("IA-19 owner UI token ratchet", () => {
  it("owner UI files have 0 hardcoded hex / raw palette / non-standard radius", () => {
    expect(ownerUiFiles().length).toBeGreaterThan(100);
    const hits = scan().map((h) => `${h.kind}\t${h.file}\t${h.match}`);
    expect(hits).toEqual([]);
  });

  it("--biz-* are bridges to --sam-* (no separate owner tone, no --sam-* override in biz scope)", () => {
    const css = readFileSync(join(ROOT, "app/design-tokens.css"), "utf8");
    const blocks = [...css.matchAll(/\[data-biz="1"\]\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    expect(blocks).toHaveLength(1);
    const decls = [...(blocks[0] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
    expect(decls.length).toBeGreaterThan(10);
    for (const [, name, value] of decls) {
      expect(name, name).toMatch(/^--biz-/);
      expect(value.trim(), name).toMatch(/^var\(--sam-[\w-]+\)$/);
    }
  });

  it("order-chat ensure failure document uses an inline token shell", () => {
    const src = readFileSync(join(ROOT, "lib/business/owner-order-chat-ensure-document.ts"), "utf8");
    expect(src).toContain("--sam-bg-app:");
    expect(src).toContain("prefers-color-scheme:dark");
    expect(src).toContain("background:var(--sam-bg-app)");
    expect(src).not.toMatch(/background:#fff|color:#111/);
  });
});
