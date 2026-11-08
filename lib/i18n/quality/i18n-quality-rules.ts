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
  "non-catalog-lang-pair",
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

/** 카탈로그 밖 `{ko,en}` 허용 — 화면 문구가 아니라 서버가 검증하는 입력값일 때만, 이유 필수 */
export const NON_CATALOG_INLINE_FILE_ALLOW: Readonly<Record<string, string>> = {
  "lib/account/account-deletion-contract.ts": "탈퇴 확인어(계정삭제·DELETE) — 클라이언트·서버가 같이 검증하는 입력값",
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
/** 개발자 용어가 아닌 것 — 사용자에게 보여 주는 이메일·도메인, 단위 표기(`/day`·`/ea`) */
const EMAIL_OR_DOMAIN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[a-z0-9-]+\.(?:com|net|org|ph|kr|io)\b/gi;
const UNIT_SUFFIX = /\/(?:day|ea|mo|month|week|night|hr|h|kg|pc|pcs)\b/g;
const PLACEHOLDER_GLOBAL = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;

function stripPlaceholders(s: string): string {
  return s.replace(PLACEHOLDER_GLOBAL, " ").replace(EMAIL_OR_DOMAIN, " ").replace(UNIT_SUFFIX, " ");
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
    if (g.forbiddenEn.test(en) && !(g.requiredEn && g.requiredEn.test(en))) out.push(g.id);
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

/** 화면에 보이는 길이 추정 — 치환값 `{x}` 는 3글자로 센다(숫자·짧은 값 기준). `docs/i18n-ssot.md` §4-3 */
export function displayLengthForBudget(value: string): number {
  return [...value.replace(PLACEHOLDER_GLOBAL, "xxx")].length;
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
/**
 * 언어 삼항 중 **문구를 고르는 것만** — 결과가 문자열·템플릿이고 언어 코드(en·ko 등)가 아닐 때.
 * `language === "en" ? "en" : "ko"`(언어 코드 정규화)·`lang === "en" ? row.name_en : row.name_ko`(DB 다국어 열 선택)는 문구가 아니다. (S6 정밀화)
 */
const LANG_TERNARY =
  /\b[\w.]*(?:[Ll]ang(?:uage)?|[Ll]ocale|lng)\s*===\s*["'](?:en|ko)["']\s*\?\s*(?!["'`](?:en|ko|en-US|ko-KR|en-PH)["'`])["'`]/g;
/** `pick(lang, "한국어", "English")` 같은 언어별 문구 쌍 인자 (S6 추가 — S0 검사가 세지 않던 형태) */
const LANG_PAIR = /\(\s*[\w.]+\s*,\s*"[^"\n]*[가-힣][^"\n]*"\s*,\s*"[^"\n가-힣]*[A-Za-z][^"\n가-힣]*"\s*\)/g;
const TT_CALL = /\btt\(\s*["'`]|\btranslateText\(/g;

/** 두 갈래가 단순 문자열일 때 — 같은 값(구분 기호 등)·식별자 모양(속성 이름 고르기)은 문구가 아니다 */
const SIMPLE_BRANCHES = /^\s*(["'`])((?:(?!\1)[^\\\n$])*)\1\s*:\s*(["'`])((?:(?!\3)[^\\\n$])*)\3/;
const IDENT_LIKE = /^[A-Za-z_$][\w$]*$/;
function countLangTernary(text: string): number {
  LANG_TERNARY.lastIndex = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = LANG_TERNARY.exec(text))) {
    const rest = text.slice(m.index + m[0].length - 1, m.index + m[0].length + 400);
    const b = rest.match(SIMPLE_BRANCHES);
    if (b && (b[2] === b[4] || (IDENT_LIKE.test(b[2]) && IDENT_LIKE.test(b[4])))) continue;
    n++;
  }
  return n;
}

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
  if (!NON_CATALOG_INLINE_FILE_ALLOW[rel]) put("non-catalog-inline-ko-en", count(INLINE_KO_EN, text));
  put("non-catalog-lang-ternary", countLangTernary(text));
  put("non-catalog-tt", count(TT_CALL, text));
  put("non-catalog-lang-pair", count(LANG_PAIR, text));
}

export function emptyFileRuleCounts(): FileRuleCounts {
  return Object.fromEntries(FILE_RULE_IDS.map((id) => [id, new Map<string, number>()])) as FileRuleCounts;
}

const ADMIN_PATH = /^(app\/admin\/|components\/admin\/|app\/api\/admin\/|lib\/admin\/)/;

export function isAdminPath(rel: string): boolean {
  return ADMIN_PATH.test(rel);
}

/**
 * 키 사용처 종류 — `user`: 고객·사장님 화면 파일(app·components·hooks, 어드민 경로 밖)이 직접 씀,
 * `admin`: 어드민 경로가 쓰거나 어드민만 가져다 쓰는 `lib` 파일이 씀,
 * `user-indirect`: 고객·사장님 쪽에서 가져다 쓰는(또는 가져다 쓰는 곳을 못 찾은) `lib` 파일이 씀.
 */
export type KeyUsage = "admin" | "user" | "user-indirect";

/**
 * 키 사용처 판정 (`docs/i18n-ssot.md` §5).
 * - 고객·사장님 화면이 직접 쓰면 user.
 * - `lib` 을 거쳐 쓰면 그 `lib` 파일을 가져다 쓰는 쪽(가져오기 관계를 끝까지 따라감)으로 판정. 단 `admin_` 접두 키는 `lib` 경유만으로는 user 로 보지 않는다.
 * - 사용처 미발견: `admin_` 접두만 admin.
 */
export function areaFromUsage(key: string, usedIn: ReadonlySet<KeyUsage> | undefined): KeyArea {
  const adminKey = key.startsWith("admin_");
  if (usedIn && usedIn.size > 0) {
    if (usedIn.has("user")) return "user";
    if (usedIn.has("user-indirect") && !adminKey) return "user";
    return "admin";
  }
  return adminKey ? "admin" : "user";
}

const IMPORT_SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

/** 파일 안의 가져오기 대상 — 저장소 기준 경로 후보(확장자 없음). `@/` 와 상대 경로만 */
export function importTargets(rel: string, text: string): string[] {
  const out: string[] = [];
  IMPORT_SPEC.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_SPEC.exec(text))) {
    const spec = m[1];
    if (spec.startsWith("@/")) out.push(spec.slice(2));
    else if (spec.startsWith("./") || spec.startsWith("../")) {
      const parts = rel.split("/").slice(0, -1);
      for (const seg of spec.split("/")) {
        if (seg === "..") parts.pop();
        else if (seg !== ".") parts.push(seg);
      }
      out.push(parts.join("/"));
    }
  }
  return out;
}

/**
 * `lib` 파일별로 결국 어떤 화면이 쓰는지 — 가져오기 관계를 거꾸로 끝까지 따라간다.
 * 반환: 파일 → 닿는 화면 종류(admin·user). 닿는 화면이 없으면 빈 집합.
 */
export function libReachAreas(files: ReadonlyMap<string, string>): Map<string, Set<"admin" | "user">> {
  const resolve = (base: string): string | null => {
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (files.has(c)) return c;
    }
    return null;
  };
  const importers = new Map<string, Set<string>>();
  for (const [rel, text] of files) {
    for (const t of importTargets(rel, text)) {
      const target = resolve(t);
      if (!target || target === rel) continue;
      const set = importers.get(target) ?? new Set<string>();
      set.add(rel);
      importers.set(target, set);
    }
  }
  const memo = new Map<string, Set<"admin" | "user">>();
  const reach = (rel: string, stack: Set<string>): Set<"admin" | "user"> => {
    if (isAdminPath(rel)) return new Set(["admin"]);
    if (!rel.startsWith("lib/")) return new Set(["user"]);
    const cached = memo.get(rel);
    if (cached) return cached;
    if (stack.has(rel)) return new Set();
    stack.add(rel);
    const acc = new Set<"admin" | "user">();
    for (const imp of importers.get(rel) ?? []) for (const a of reach(imp, stack)) acc.add(a);
    stack.delete(rel);
    memo.set(rel, acc);
    return acc;
  };
  const out = new Map<string, Set<"admin" | "user">>();
  for (const rel of files.keys()) if (rel.startsWith("lib/") && !isAdminPath(rel)) out.set(rel, reach(rel, new Set()));
  return out;
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
