/**
 * docs/audit/i18n-postmerge-fix-design-2026-11-27.md §2
 * - M3: 매장 목록 API 3개는 내정보 언어(화면 언어 쿠키) → 기기 언어 → en (`resolveRequestAppLanguageOr("en")`).
 * - M5: 관리자 밖 API 응답 `error` 에 DB·예외 원문(`x.message`)을 싣지 않는다 — 고정 코드 + 서버 로그.
 *   제외(보고): 통화 경로(call*), CRON_SECRET 전용 크론, 필라이프 사진 오류(E3 묶음).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "__tests__") continue;
      walk(p, out);
    } else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

describe("M3 store list APIs use the account (cookie) language", () => {
  for (const rel of [
    "app/api/stores/home-feed/route.ts",
    "app/api/stores/browse/route.ts",
    "app/api/stores/[slug]/delivery-eta/route.ts",
  ]) {
    it(rel, () => {
      const src = read(rel);
      expect(src).toContain('const uiLang = await resolveRequestAppLanguageOr("en");');
      expect(src).not.toContain("detectAcceptLanguageAppLanguage");
    });
  }

  it("delivery-eta server cache key includes the language (etaLabel is language-specific)", () => {
    const src = read("app/api/stores/[slug]/delivery-eta/route.ts");
    expect(src).toContain("`eta:${uiLang}:${buyerId}:");
  });
});

describe("M5 non-admin API responses never carry raw error messages", () => {
  const RAW = /error:\s*(?:\(?[A-Za-z_][\w.]*(?: as Error\))?\??\.message\b|[A-Za-z_]\w* instanceof Error \?)/;
  const EXEMPT = [
    /^app\/api\/admin\//,
    /call/i, // 통화 경로 — 통화 변경 규정(별도 PR)
    /^app\/api\/cron\//, // CRON_SECRET 전용 — 응답은 Vercel 크론 로그만
    /^app\/api\/community\/neighborhood-posts\//, // 사진 오류 문장 — E3 묶음
  ];

  /** 여러 줄 console 로그 객체 안의 줄(응답 아님) */
  const LOG_ONLY = new Set([
    "app/api/me/devices/deactivate/route.ts:error: error instanceof Error ? error.message : String(error),",
  ]);

  it("no `error: x.message` in response bodies", () => {
    const root = path.join(process.cwd(), "app/api");
    const offenders: string[] = [];
    for (const abs of walk(root)) {
      const rel = path.relative(process.cwd(), abs).split(path.sep).join("/");
      if (EXEMPT.some((re) => re.test(rel))) continue;
      read(rel)
        .split("\n")
        .forEach((line, i) => {
          if (/console\.(error|warn|info|log)/.test(line)) return;
          if (RAW.test(line) && !LOG_ONLY.has(`${rel}:${line.trim()}`)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
