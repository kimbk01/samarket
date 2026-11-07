/**
 * `check:i18n-quality` 규칙 — 단일 정의 `docs/i18n-ssot.md` §5.
 * 순수 함수만 둔다(파일 읽기는 `collect-i18n-quality.ts`). 앱 번들에서 import 하지 않는다.
 */
import { DIBAY_GLOSSARY } from "@/lib/i18n/glossary";

export type I18nLang = "ko" | "en";
export type KeyArea = "admin" | "user";

/** 키 단위 규칙 — 기준선은 키 목록 */
export const KEY_RULE_IDS = [
  "duplicate-key",
  "placeholder-parity",
  "hangul-in-en",
  "foreign-script-catalog",
  "jargon-en",
  "jargon-ko",
  "glossary",
] as const;
export type KeyRuleId = (typeof KEY_RULE_IDS)[number];

/** 파일 단위 개수 규칙 — 기준선은 파일별 개수 */
export const FILE_RULE_IDS = [
  "foreign-script-code",
  "foreign-locale-code",
  "non-catalog-fallback-en",
  "non-catalog-inline-ko-en",
  "non-catalog-lang-ternary",
  "non-catalog-tt",
] as const;
export type FileRuleId = (typeof FILE_RULE_IDS)[number];

/** 한국어·영어 외 글자: 한자·가나·태국·아랍·키릴. 한중일 문장부호(「」 등 U+3000–303F)는 한국어에도 쓰므로 제외 */
export const FOREIGN_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿฀-๿؀-ۿЀ-ӿ]/;
export const FOREIGN_SCRIPT_GLOBAL = new RegExp(FOREIGN_SCRIPT.source, "g");
const HANGUL = /[가-힣]/;

/** 언어 코드 리터럴 — 짧고 겹치는 코드(id·th·es)는 지역 붙은 형태만 */
export const FOREIGN_LOCALE_CODE_GLOBAL =
  /["'`](zh|zh-CN|zh-TW|zh-Hans|zh-Hant|ja|ja-JP|tl|tl-PH|fil|fil-PH|vi|vi-VN|th-TH|ceb|es-ES|id-ID)["'`]/g;

/** 앱 UI 언어가 아니라 영구 허용 — 이유 필수 (`docs/i18n-ssot.md` §1) */
export const FOREIGN_SCRIPT_CATALOG_ALLOW: Readonly<Record<string, string>> = {
  perm_edu_oem_vivo_step_2: "Vivo 폰 실제 메뉴 이름 i管家",
};
export const FOREIGN_CODE_FILE_ALLOW: Readonly<Record<string, string>> = {
  "lib/community-messenger/call-provider/agora-playback-routing.ts": "중국 폰 오디오 장치 이름(扬声器·耳机) 인식",
  "lib/jobs/form-options.ts": "구직 글의 할 수 있는 언어 선택지 값(tl) — 앱 UI 언어 아님",
};

/** 개발자 용어 — 대소문자 구분 기술명 */
const TECH_TOKENS =
  /\b(Supabase|RLS|RPC|APIs?|JSON|UUIDs?|VoIP|FCM|Agora|CallKit|PushKit|SSOT|i18n|HTTPS?|DB)\b|\.env\b/;
/** 개발자 용어 — 대소문자 무시 영어 단어 */
const JARGON_EN_WORDS =
  /\b(migrations?|schemas?|payloads?|fallbacks?|bootstrap(ping)?|ledgers?|slugs?|webhooks?|endpoints?|cron|upsert|null|undefined|backend|frontend)\b/i;
const JARGON_KO_WORDS = /마이그레이션|스키마|슬러그|부트스트랩|폴백|페이로드|원장(?!님)|엔드포인트|웹훅/;
/** 식별자 형태 — 치환값 `{a_b}` 는 제거 후 검사 */
const SNAKE_IDENTIFIER = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;
const DOTTED_IDENTIFIER = /\b[a-z_]{3,}\.[a-z_]{3,}\b/;
const APP_PATH = /(^|[\s`(「])\/[a-z][a-z0-9-]*/;
const PLACEHOLDER_GLOBAL = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;

function stripPlaceholders(s: string): string {
  return s.replace(PLACEHOLDER_GLOBAL, " ");
}

export function jargonHit(value: string, lang: I18nLang): string | null {
  const s = stripPlaceholders(value);
  const tech = s.match(TECH_TOKENS);
  if (tech) return tech[0];
  const words = lang === "en" ? s.match(JARGON_EN_WORDS) : s.match(JARGON_KO_WORDS);
  if (words) return words[0];
  const snake = s.match(SNAKE_IDENTIFIER);
  if (snake) return snake[0];
  const dotted = s.match(DOTTED_IDENTIFIER);
  if (dotted) return dotted[0];
  const p = s.match(APP_PATH);
  if (p) return p[0].trim();
  return null;
}

export function placeholderSignature(s: string): string {
  return [...new Set(s.match(PLACEHOLDER_GLOBAL) ?? [])].sort().join(",");
}

export function glossaryHits(ko: string, en: string): string[] {
  const out: string[] = [];
  for (const g of DIBAY_GLOSSARY) {
    if (!g.koMatch.test(ko)) continue;
    if (g.koExclude?.test(ko)) continue;
    if (g.forbiddenEn.test(en)) out.push(g.id);
  }
  return out;
}

/** §4-3 길이 기준 — 키 끝말로 자리 판정 */
export function lengthBudgetForKey(key: string): number | null {
  /** 화면에 보이지 않는 보조기기 문구는 제외 */
  if (/_aria(_|$)/.test(key)) return null;
  if (key.startsWith("nav_bottom_")) return 12;
  if (/_(tab|chip|badge|pill|segment)$/.test(key)) return 18;
  if (/_(btn|button|cta)$/.test(key)) return 22;
  if (/_title$/.test(key)) return 40;
  if (/_toast$/.test(key)) return 80;
  return null;
}

export type CatalogSource = { source: string; ko: Readonly<Record<string, string>>; en: Readonly<Record<string, string>> };

export type KeyRuleInput = {
  ko: Readonly<Record<string, string>>;
  en: Readonly<Record<string, string>>;
  sources: readonly CatalogSource[];
  areaOfKey: (key: string) => KeyArea;
};

export type KeyRuleFindings = Record<KeyRuleId, Map<string, string>>;

/** 키 규칙 — 값은 사람이 읽는 근거(파일·단어) */
export function collectKeyRuleFindings(input: KeyRuleInput): KeyRuleFindings {
  const f = Object.fromEntries(KEY_RULE_IDS.map((id) => [id, new Map<string, string>()])) as KeyRuleFindings;

  for (const lang of ["ko", "en"] as const) {
    const where = new Map<string, string[]>();
    for (const src of input.sources) {
      for (const key of Object.keys(src[lang])) {
        const list = where.get(key) ?? [];
        list.push(src.source);
        where.set(key, list);
      }
    }
    for (const [key, list] of where) {
      if (list.length > 1 && !f["duplicate-key"].has(key)) {
        f["duplicate-key"].set(key, `${lang}: ${list.join(" | ")}`);
      }
    }
  }

  for (const key of Object.keys(input.ko)) {
    const ko = input.ko[key] ?? "";
    const en = input.en[key] ?? "";
    if (placeholderSignature(ko) !== placeholderSignature(en)) {
      f["placeholder-parity"].set(key, `ko[${placeholderSignature(ko)}] en[${placeholderSignature(en)}]`);
    }
    if (HANGUL.test(en)) f["hangul-in-en"].set(key, en.slice(0, 60));
    if (!FOREIGN_SCRIPT_CATALOG_ALLOW[key] && (FOREIGN_SCRIPT.test(ko) || FOREIGN_SCRIPT.test(en))) {
      f["foreign-script-catalog"].set(key, (FOREIGN_SCRIPT.test(ko) ? ko : en).slice(0, 60));
    }
    if (input.areaOfKey(key) !== "user") continue;
    const je = jargonHit(en, "en");
    if (je) f["jargon-en"].set(key, je);
    const jk = jargonHit(ko, "ko");
    if (jk) f["jargon-ko"].set(key, jk);
    const g = glossaryHits(ko, en);
    if (g.length) f.glossary.set(key, g.join(","));
  }
  return f;
}

export type FileRuleCounts = Record<FileRuleId, Map<string, number>>;

const FALLBACK_EN = /\bfallbackEn\s*:/g;
const INLINE_KO_EN = /\{\s*ko\s*:\s*["'`][^"'`\n]*["'`]\s*,\s*en\s*:\s*["'`]/g;
const LANG_TERNARY = /\b(lang|language|uiLang|locale|appLang|appLanguage|lng)\s*===\s*["'](en|ko)["']\s*\?/g;
const TT_CALL = /\btt\(\s*["'`]|\btranslateText\(/g;

function count(re: RegExp, text: string): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
}

/** 파일 규칙 — `rel` 은 저장소 기준 경로. `lib/i18n/**` 는 호출부에서 제외 */
export function addFileRuleCounts(target: FileRuleCounts, rel: string, text: string): void {
  const put = (id: FileRuleId, n: number) => {
    if (n > 0) target[id].set(rel, n);
  };
  if (!FOREIGN_CODE_FILE_ALLOW[rel]) {
    put("foreign-script-code", count(FOREIGN_SCRIPT_GLOBAL, text));
    put("foreign-locale-code", count(FOREIGN_LOCALE_CODE_GLOBAL, text));
  }
  put("non-catalog-fallback-en", count(FALLBACK_EN, text));
  put("non-catalog-inline-ko-en", count(INLINE_KO_EN, text));
  put("non-catalog-lang-ternary", count(LANG_TERNARY, text));
  put("non-catalog-tt", count(TT_CALL, text));
}

export function emptyFileRuleCounts(): FileRuleCounts {
  return Object.fromEntries(FILE_RULE_IDS.map((id) => [id, new Map<string, number>()])) as FileRuleCounts;
}

const ADMIN_PATH = /^(app\/admin\/|components\/admin\/|app\/api\/admin\/|lib\/admin\/)/;

export function isAdminPath(rel: string): boolean {
  return ADMIN_PATH.test(rel);
}

/** 키 사용처 판정 — 어드민 경로에서만 쓰면 admin, 그 외 user. 사용처 미발견은 `admin_` 접두만 admin */
export function areaFromUsage(key: string, usedIn: ReadonlySet<"admin" | "user"> | undefined): KeyArea {
  if (usedIn && usedIn.size > 0) return usedIn.has("user") ? "user" : "admin";
  return key.startsWith("admin_") ? "admin" : "user";
}

/** 기준선 비교 결과 */
export type BaselineDiff = { added: string[]; fixed: string[] };

export function diffKeyRule(current: ReadonlyMap<string, string>, baseline: readonly string[]): BaselineDiff {
  const base = new Set(baseline);
  return {
    added: [...current.keys()].filter((k) => !base.has(k)).sort(),
    fixed: [...base].filter((k) => !current.has(k)).sort(),
  };
}

export function diffFileRule(
  current: ReadonlyMap<string, number>,
  baseline: Readonly<Record<string, number>>
): BaselineDiff {
  const added: string[] = [];
  const fixed: string[] = [];
  for (const [file, n] of current) {
    const b = baseline[file] ?? 0;
    if (n > b) added.push(`${file} ${b}→${n}`);
    else if (n < b) fixed.push(`${file} ${b}→${n}`);
  }
  for (const [file, b] of Object.entries(baseline)) {
    if (!current.has(file) && b > 0) fixed.push(`${file} ${b}→0`);
  }
  return { added: added.sort(), fixed: fixed.sort() };
}
