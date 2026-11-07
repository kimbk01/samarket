/**
 * `npm run check:i18n-quality` — 언어 SSOT 검사 (`docs/i18n-ssot.md` §5).
 * 기준선 `lib/i18n/quality/i18n-quality-baseline.json` 보다 결함이 늘면 실패, 고쳐진 항목이 기준선에 남아도 실패.
 * 기준선 다시 쓰기: `npm run check:i18n-quality:baseline` (결함을 고친 단계에서만).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_APP_LANGUAGES } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import {
  FILE_RULE_IDS,
  KEY_RULE_IDS,
  diffFileRule,
  diffKeyRule,
  type FileRuleId,
  type KeyRuleId,
} from "@/lib/i18n/quality/i18n-quality-rules";
import { collectI18nQuality, type I18nQualityResult } from "./support/collect-i18n-quality";

const ROOT = process.cwd();
const BASELINE_REL = "lib/i18n/quality/i18n-quality-baseline.json";
const BASELINE_PATH = path.join(ROOT, BASELINE_REL);
const WRITE = process.env.I18N_QUALITY_WRITE_BASELINE === "1";

type Baseline = {
  note: string;
  generatedAtPht: string;
  keyRules: Record<KeyRuleId, string[]>;
  fileRules: Record<FileRuleId, Record<string, number>>;
};

function phtNow(): string {
  return `${new Date().toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).slice(0, 16)} PHT`;
}

let result: I18nQualityResult;
let baseline: Baseline | null = null;

beforeAll(async () => {
  result = await collectI18nQuality({
    root: ROOT,
    ko: MESSAGES.ko as unknown as Record<string, string>,
    en: MESSAGES.en as unknown as Record<string, string>,
  });

  const summary = {
    stats: result.stats,
    keyRules: Object.fromEntries(KEY_RULE_IDS.map((id) => [id, result.keyFindings[id].size])),
    fileRules: Object.fromEntries(
      FILE_RULE_IDS.map((id) => [id, [...result.fileCounts[id].values()].reduce((a, b) => a + b, 0)])
    ),
    lengthBudgetWarnings: result.lengthOver.length,
  };
  console.info("[check:i18n-quality]", JSON.stringify(summary));

  if (WRITE) {
    const next: Baseline = {
      note: "docs/i18n-ssot.md §5 — 줄기만 한다. 결함을 고친 단계에서만 npm run check:i18n-quality:baseline 으로 다시 쓴다.",
      generatedAtPht: phtNow(),
      keyRules: Object.fromEntries(
        KEY_RULE_IDS.map((id) => [id, [...result.keyFindings[id].keys()].sort()])
      ) as Baseline["keyRules"],
      fileRules: Object.fromEntries(
        FILE_RULE_IDS.map((id) => [
          id,
          Object.fromEntries([...result.fileCounts[id].entries()].sort(([a], [b]) => a.localeCompare(b))),
        ])
      ) as Baseline["fileRules"],
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 1)}\n`);
  }
  baseline = existsSync(BASELINE_PATH) ? (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline) : null;
}, 180_000);

const explain = (rule: string, list: string[], detail?: (k: string) => string | undefined) =>
  list
    .slice(0, 40)
    .map((k) => `${rule}: ${k}${detail?.(k) ? ` — ${detail(k)}` : ""}`)
    .join("\n");

describe("check:i18n-quality — 언어 SSOT", () => {
  it("supported-languages: 앱 UI 언어는 ko·en 두 개뿐", () => {
    expect([...SUPPORTED_APP_LANGUAGES]).toEqual(["ko", "en"]);
    expect(Object.keys(MESSAGES).sort()).toEqual(["en", "ko"]);
  });

  it("기준선 파일이 있다", () => {
    expect(baseline, `${BASELINE_REL} 없음 — npm run check:i18n-quality:baseline`).not.toBeNull();
  });

  for (const rule of KEY_RULE_IDS) {
    it(`${rule}: 새 결함 없음 · 고쳐진 항목은 기준선에서 제거`, () => {
      if (!baseline) return;
      const current = result.keyFindings[rule];
      const { added, fixed } = diffKeyRule(current, baseline.keyRules[rule] ?? []);
      expect(added, `새 결함 ${added.length}건\n${explain(rule, added, (k) => current.get(k))}`).toEqual([]);
      expect(
        fixed,
        `고쳐진 ${fixed.length}건이 기준선에 남음 — npm run check:i18n-quality:baseline\n${explain(rule, fixed)}`
      ).toEqual([]);
    });
  }

  for (const rule of FILE_RULE_IDS) {
    it(`${rule}: 파일별 개수 증가 없음 · 줄어든 파일은 기준선 갱신`, () => {
      if (!baseline) return;
      const { added, fixed } = diffFileRule(result.fileCounts[rule], baseline.fileRules[rule] ?? {});
      expect(added, `늘어남 ${added.length}건\n${explain(rule, added)}`).toEqual([]);
      expect(
        fixed,
        `줄어든 ${fixed.length}건이 기준선에 남음 — npm run check:i18n-quality:baseline\n${explain(rule, fixed)}`
      ).toEqual([]);
    });
  }

  it("length-budget: 경고만 (S4 후 실패로 전환)", () => {
    if (result.lengthOver.length) {
      console.warn(
        `[check:i18n-quality] length-budget 경고 ${result.lengthOver.length}건\n` +
          result.lengthOver
            .slice(0, 20)
            .map((x) => `  ${x.key} (${x.lang}) ${x.length}/${x.budget}`)
            .join("\n")
      );
    }
    expect(true).toBe(true);
  });
});
