/**
 * `check:i18n-quality` 수집 — 저장소 파일을 읽어 규칙 입력을 만든다 (Node 전용, 검사에서만 사용).
 * 단일 정의: `docs/i18n-ssot.md` §5.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import {
  addFileRuleCounts,
  areaFromUsage,
  collectKeyRuleFindings,
  emptyFileRuleCounts,
  isAdminPath,
  lengthBudgetForKey,
  type CatalogSource,
  type FileRuleCounts,
  type KeyArea,
  type KeyRuleFindings,
} from "@/lib/i18n/quality/i18n-quality-rules";

const SOURCE_DIRS = ["app", "components", "lib", "hooks"] as const;
const CATALOG_DIR = "lib/i18n/catalog";

/** 카탈로그 파일에 **직접 적힌** ko/en 키만 (다른 카탈로그 펼침 `...x.ko` 는 제외) */
export function parseCatalogSource(rel: string, text: string): CatalogSource {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const out: { ko: Record<string, string>; en: Record<string, string> } = { ko: {}, en: {} };
  const unwrap = (e: ts.Expression): ts.Expression => {
    let cur = e;
    while (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
    }
    return cur;
  };
  const propName = (n: ts.PropertyName): string | null => {
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    return null;
  };
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name);
      const init = unwrap(node.initializer);
      if ((name === "ko" || name === "en") && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key = propName(p.name);
          if (!key) continue;
          const v = unwrap(p.initializer);
          out[name][key] =
            ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : `<expr>`;
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { source: rel, ko: out.ko, en: out.en };
}

async function walk(root: string, rel: string, acc: string[]): Promise<void> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      await walk(root, child, acc);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) {
      acc.push(child);
    }
  }
}

const yieldToEventLoop = () => new Promise<void>((r) => setImmediate(r));

export type I18nQualityResult = {
  keyFindings: KeyRuleFindings;
  fileCounts: FileRuleCounts;
  areaOfKey: (key: string) => KeyArea;
  lengthOver: { key: string; lang: "ko" | "en"; length: number; budget: number }[];
  stats: { keys: number; catalogFiles: number; sourceFiles: number; userKeys: number; adminKeys: number };
};

export async function collectI18nQuality(input: {
  root: string;
  ko: Readonly<Record<string, string>>;
  en: Readonly<Record<string, string>>;
}): Promise<I18nQualityResult> {
  const { root, ko, en } = input;

  // 1) 카탈로그·JSON 원본
  const sources: CatalogSource[] = [];
  const catalogFiles = (await readdir(path.join(root, CATALOG_DIR))).filter((f) => f.endsWith(".ts")).sort();
  for (const f of catalogFiles) {
    const rel = `${CATALOG_DIR}/${f}`;
    sources.push(parseCatalogSource(rel, await readFile(path.join(root, rel), "utf8")));
  }
  for (const lang of ["ko", "en"] as const) {
    const rel = `messages/${lang}.json`;
    const json = JSON.parse(await readFile(path.join(root, rel), "utf8")) as Record<string, unknown>;
    const bag = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v ?? "")]));
    const existing = sources.find((s) => s.source === "messages/*.json");
    if (existing) (existing as { [K in typeof lang]: Record<string, string> })[lang] = bag;
    else sources.push({ source: "messages/*.json", ko: lang === "ko" ? bag : {}, en: lang === "en" ? bag : {} });
  }

  // 2) 코드 파일 — 키 사용처 + 파일 규칙
  const files: string[] = [];
  for (const d of SOURCE_DIRS) await walk(root, d, files);
  files.sort();
  const keySet = new Set(Object.keys(ko));
  const usage = new Map<string, Set<"admin" | "user">>();
  const fileCounts = emptyFileRuleCounts();
  const literal = /["'`]([a-z][a-z0-9_.]{3,})["'`]/g;
  let i = 0;
  for (const rel of files) {
    if (++i % 400 === 0) await yieldToEventLoop();
    if (rel.startsWith(`${CATALOG_DIR}/`) || rel === "lib/i18n/message-key.ts") continue;
    const text = await readFile(path.join(root, rel), "utf8");
    const area: "admin" | "user" = isAdminPath(rel) ? "admin" : "user";
    literal.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = literal.exec(text))) {
      if (!keySet.has(m[1])) continue;
      const set = usage.get(m[1]) ?? new Set();
      set.add(area);
      usage.set(m[1], set);
    }
    if (!rel.startsWith("lib/i18n/")) addFileRuleCounts(fileCounts, rel, text);
  }
  const areaOfKey = (key: string) => areaFromUsage(key, usage.get(key));

  // 3) 키 규칙
  await yieldToEventLoop();
  const keyFindings = collectKeyRuleFindings({ ko, en, sources, areaOfKey });

  // 4) 길이 기준(경고)
  const lengthOver: I18nQualityResult["lengthOver"] = [];
  let userKeys = 0;
  for (const key of keySet) {
    const area = areaOfKey(key);
    if (area === "user") userKeys++;
    const budget = lengthBudgetForKey(key);
    if (budget == null || area !== "user") continue;
    for (const lang of ["ko", "en"] as const) {
      const len = [...(lang === "ko" ? ko[key] : en[key]) ?? ""].length;
      if (len > budget) lengthOver.push({ key, lang, length: len, budget });
    }
  }

  return {
    keyFindings,
    fileCounts,
    areaOfKey,
    lengthOver,
    stats: {
      keys: keySet.size,
      catalogFiles: catalogFiles.length,
      sourceFiles: files.length,
      userKeys,
      adminKeys: keySet.size - userKeys,
    },
  };
}
