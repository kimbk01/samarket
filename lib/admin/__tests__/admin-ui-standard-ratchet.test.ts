/**
 * UI/UX/CTA 표준 래칫 (수정 계획 2-8) — `ADMIN_UI_STANDARD_SCREENS` 의 화면(page.tsx + 화면 전용 컴포넌트)은
 * 아래 위반이 0건이어야 한다. 공용 부품(components/admin/ui · components/ui)과 lib 는 대상 밖.
 * 회원 앱 화면 부품(components/navigation · components/launch-intro 인트로 플레이어 · components/trust 매너 배터리 — 관리자 화면이 그대로 쓴다)도 대상 밖.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_CTA_FORBIDDEN, ADMIN_CTA_FORBIDDEN_EXACT } from "@/lib/admin/ui-standard/admin-cta";
import { ADMIN_UI_STANDARD_SCREENS } from "@/lib/admin/ui-standard/admin-ui-standard-screens";

const ROOT = process.cwd();
const SHARED = [/^components\/ui\//, /^components\/admin\/ui\//, /^components\/i18n\//, /^components\/navigation\//, /^components\/launch-intro\//, /^components\/trust\//, /^lib\//];

function resolveImport(spec: string, from: string): string | null {
  let p: string;
  if (spec.startsWith("@/")) p = spec.slice(2);
  else if (spec.startsWith(".")) p = path.join(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = p + ext;
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && /\.(tsx|ts)$/.test(f)) return f;
  }
  return null;
}

/** page.tsx 에서 시작해 화면 전용 파일(공용 제외)을 모두 모은다. */
export function adminScreenFiles(route: string): string[] {
  const start = `app${route}/page.tsx`;
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const r = resolveImport(m[1], f);
      if (r && !SHARED.some((re) => re.test(r)) && !/\.test\.tsx?$/.test(r)) stack.push(r);
    }
  }
  return [...seen].sort();
}

/** 주석 제거 (규칙은 코드만 본다). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const ALLOWED_PX = new Set(["12", "13", "14", "16", "20"]);

export const ADMIN_UI_STANDARD_RULES: Record<string, (src: string) => string[]> = {
  /** 2-2 버튼 — `<button>` 직접 사용 금지 (AdminActionButton·AdminChipButton·AdminTabs 등) */
  rawButton: (s) => s.match(/<button\b/g) ?? [],
  /** 2-3 확인창 — 앱 공용 대화상자·브라우저 대화상자 직접 호출 금지 (confirmAdminAction · useAdminConfirmDialog) */
  directConfirm: (s) => s.match(/\b(?:dibayConfirm|dibayPrompt|window\.confirm|window\.prompt|window\.alert)\(/g) ?? [],
  /** 2-7 시간·숫자 — 기기 로캘·시간대 포맷 금지 (formatAdminManilaDateTime · formatAdminNumber · formatAdminPhp) */
  localeFormat: (s) => s.match(/\.toLocale(?:String|DateString|TimeString)\(|\bIntl\.(?:DateTimeFormat|NumberFormat)\b/g) ?? [],
  /** 2-7 색 — Tailwind 원색·hex 금지 (sam-* · admin-console 변수) */
  rawColor: (s) =>
    s.match(
      /\b(?:text|bg|border|ring|divide|outline|from|to|via|fill|stroke|accent|decoration|placeholder)-(?:gray|slate|zinc|neutral|stone|red|blue|green|amber|emerald|yellow|orange|indigo|purple|pink|rose|sky|teal|cyan|lime|violet|fuchsia)-\d{2,3}\b|(?<![\w-])\[?#[0-9a-fA-F]{6}\b/g
    ) ?? [],
  /** 2-7 글자 크기 — 12·13·14·16·20 만 */
  fontSize: (s) => [
    ...[...s.matchAll(/\btext-\[(\d+)px\]/g)].filter((m) => !ALLOWED_PX.has(m[1])).map((m) => m[0]),
    ...(s.match(/\btext-(?:lg|2xl|3xl|4xl|5xl)\b/g) ?? []),
  ],
  /** 2-1 CTA 어휘 — 금지 단어 */
  forbiddenCta: (s) => [
    ...ADMIN_CTA_FORBIDDEN.flatMap((f) => (s.includes(f.word) ? [`${f.word}→${f.use}`] : [])),
    ...ADMIN_CTA_FORBIDDEN_EXACT.flatMap((f) =>
      new RegExp(`(?:>\\s*${f.word}\\s*<|["'\`]${f.word}["'\`])`).test(s) ? [`${f.word}→${f.use}`] : []
    ),
  ],
};

describe("UI/UX/CTA 표준 래칫 — 적용 화면 위반 0건", () => {
  for (const [ws, routes] of Object.entries(ADMIN_UI_STANDARD_SCREENS)) {
    it(`${ws}: 화면 파일 위반 0건`, () => {
      const violations: string[] = [];
      for (const route of routes) {
        expect(fs.existsSync(path.join(ROOT, `app${route}/page.tsx`)), `${route} page.tsx`).toBe(true);
        for (const f of adminScreenFiles(route)) {
          const src = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
          for (const [rule, find] of Object.entries(ADMIN_UI_STANDARD_RULES)) {
            const hits = find(src);
            if (hits.length) violations.push(`${f} · ${rule} · ${[...new Set(hits)].slice(0, 5).join(", ")} (${hits.length})`);
          }
        }
      }
      expect([...new Set(violations)]).toEqual([]);
    });
  }
});
