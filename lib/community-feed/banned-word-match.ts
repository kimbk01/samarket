/**
 * 금칙어 판정(순수 함수) — 운영 목록(`admin_settings.community_feed_ops.banned_words`) + 코드 기본 목록.
 *
 * - 운영 목록이 비어 있어도 기본 목록은 항상 적용된다(필터 무력화 방지).
 * - 판정은 띄어쓰기 단위 낱말 안에서만 한다. 낱말 사이를 이어 붙이면 `다시 발송` → `다시발송` 처럼
 *   정상 문장이 걸리므로, 한 글자씩 띄운 우회(`씨 발`, `f u c k`)만 따로 이어 붙여 본다.
 * - 한글: 낱말 안의 한글 외 문자(기호·숫자·제로폭)를 지우고 부분일치 — `씨.발`, `씨1발` 대응.
 *   `prefix` 항목은 낱말 첫머리에서만 찾는다(`질병신고`·`출시발표` 오차단 방지).
 * - 라틴(영어·타갈로그): 낱말 전체 일치 — `class`·`Niger` 같은 정상 단어는 걸지 않는다.
 *   같은 글자를 3번 이상 늘인 우회(`fuuuck`)는 늘인 글자를 줄여 다시 비교한다.
 * - 예외어(`시발점`·`병신년` 등)는 판정 전에 지운다.
 * - 결과에는 원문·걸린 단어를 담지 않는다(로그에 메시지 원문·개인정보를 남기지 않기 위해).
 */

export type BannedWordCategory = "profanity" | "slur" | "sexual_exploitation" | "sexual_solicitation" | "operator";

export type BannedWordMatch = {
  source: "baseline" | "operator";
  category: BannedWordCategory;
};

type BaselineTerm = {
  term: string;
  category: Exclude<BannedWordCategory, "operator">;
  /** 한글 전용 — 낱말 첫머리에서만 찾는다. */
  prefix?: boolean;
};

/**
 * 기본 목록 — 정상 문장 오차단 테스트(`__tests__/banned-word-match.test.ts`)와 함께 관리한다.
 * 가벼운 욕설·지역 은어는 운영 목록(관리자 화면)에서 관리하고, 여기에는 오차단 위험이 낮은 심한 표현만 둔다.
 */
export const BASELINE_BANNED_TERMS: readonly BaselineTerm[] = [
  // ko — 욕설
  { term: "씨발", category: "profanity" },
  { term: "씨바", category: "profanity", prefix: true },
  { term: "씨빨", category: "profanity" },
  { term: "씨팔", category: "profanity" },
  { term: "시발", category: "profanity", prefix: true },
  { term: "ㅅㅂ", category: "profanity" },
  { term: "ㅆㅂ", category: "profanity" },
  { term: "좆", category: "profanity" },
  { term: "병신", category: "profanity", prefix: true },
  { term: "ㅂㅅ", category: "profanity" },
  { term: "개새끼", category: "profanity" },
  { term: "느금마", category: "profanity" },
  { term: "니애미", category: "profanity" },
  { term: "애미뒤진", category: "profanity" },
  // ko — 성착취·성매매
  { term: "아동포르노", category: "sexual_exploitation" },
  { term: "아동음란물", category: "sexual_exploitation" },
  { term: "아청물", category: "sexual_exploitation" },
  { term: "조건만남", category: "sexual_solicitation" },
  { term: "원조교제", category: "sexual_solicitation" },
  { term: "몸캠", category: "sexual_solicitation" },
  // en — 욕설·혐오
  { term: "fuck", category: "profanity" },
  { term: "fucking", category: "profanity" },
  { term: "fucker", category: "profanity" },
  { term: "fuckin", category: "profanity" },
  { term: "motherfucker", category: "profanity" },
  { term: "cunt", category: "profanity" },
  { term: "nigger", category: "slur" },
  { term: "faggot", category: "slur" },
  // en — 성착취
  { term: "child porn", category: "sexual_exploitation" },
  { term: "childporn", category: "sexual_exploitation" },
  { term: "child pornography", category: "sexual_exploitation" },
  { term: "kiddie porn", category: "sexual_exploitation" },
  // tl — 욕설·성매매
  { term: "putangina", category: "profanity" },
  { term: "putang ina", category: "profanity" },
  { term: "tangina", category: "profanity" },
  { term: "tang ina mo", category: "profanity" },
  { term: "kantot", category: "profanity" },
  { term: "kantutan", category: "profanity" },
  { term: "pokpok", category: "sexual_solicitation" },
];

/** 판정 전에 지우는 정상 표현(기본 목록 어근을 포함하지만 욕설이 아닌 말). */
export const BASELINE_EXCEPTION_PHRASES: readonly string[] = [
  "시발점",
  "시발역",
  "시발택시",
  "시발자동차",
  "병신년",
  "병신정변",
  "병신양요",
  "병신박해",
];

const ZERO_WIDTH_RE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;
const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
const NON_HANGUL_RE = /[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/g;
const LEET_RE = /[013457@$]/g;
const LEET_MAP: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function baseNormalize(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH_RE, "").toLowerCase();
}

function hasHangul(s: string): boolean {
  return HANGUL_RE.test(s);
}

function hangulOnly(s: string): string {
  return s.replace(NON_HANGUL_RE, "");
}

function latinOnly(s: string): string {
  return s.replace(LEET_RE, (c) => LEET_MAP[c] ?? c).replace(/[^a-z]/g, "");
}

/** 같은 글자를 3번 이상 늘인 경우만 1글자로 줄인다(`fuuuck` → `fuck`, `Niger`·`kiddie` 는 그대로). */
function squeezeStretched(s: string): string {
  return s.replace(/([a-z])\1{2,}/g, "$1");
}

function joinSingleRuns(words: readonly string[]): string[] {
  const runs: string[] = [];
  let cur = "";
  let count = 0;
  for (const w of words) {
    if (w.length === 1) {
      cur += w;
      count += 1;
      continue;
    }
    if (count > 1) runs.push(cur);
    cur = "";
    count = 0;
  }
  if (count > 1) runs.push(cur);
  return runs;
}

type PreparedText = {
  hangulWords: string[];
  latinWords: Set<string>;
  latinSpaced: string;
};

function prepare(text: string): PreparedText {
  const rawWords = baseNormalize(text).split(/\s+/).filter(Boolean);

  const exceptionCompacts = BASELINE_EXCEPTION_PHRASES.map(hangulOnly);
  const hangulParts = rawWords.map((w) => {
    let h = hangulOnly(w);
    for (const ex of exceptionCompacts) h = h.split(ex).join("|");
    return h;
  });
  const hangulWords = [...hangulParts.filter(Boolean), ...joinSingleRuns(hangulParts)];

  const latinParts = rawWords.flatMap((w) => {
    const pieces = w.split(/[^a-z0-9@$*._\-']+/).filter(Boolean);
    return pieces.map(latinOnly).filter(Boolean);
  });
  const latinSet = new Set<string>();
  for (const w of [...latinParts, ...joinSingleRuns(latinParts)]) {
    latinSet.add(w);
    latinSet.add(squeezeStretched(w));
  }
  return {
    hangulWords,
    latinWords: latinSet,
    latinSpaced: ` ${latinParts.map(squeezeStretched).join(" ")} `,
  };
}

function hangulTermMatches(prepared: PreparedText, term: string, prefix: boolean): boolean {
  const t = hangulOnly(term);
  if (!t) return false;
  return prepared.hangulWords.some((w) =>
    prefix ? w.split("|").some((seg) => seg.startsWith(t)) : w.includes(t)
  );
}

function latinTermMatches(prepared: PreparedText, term: string): boolean {
  const words = term
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return false;
  if (words.length === 1) return prepared.latinWords.has(words[0]!);
  return prepared.latinSpaced.includes(` ${words.join(" ")} `);
}

function termMatches(prepared: PreparedText, rawTerm: string, prefix: boolean): boolean {
  const term = baseNormalize(rawTerm).trim();
  if (!term) return false;
  return hasHangul(term) ? hangulTermMatches(prepared, term, prefix) : latinTermMatches(prepared, term);
}

/** 운영 목록 정리 — 정규화·중복·빈 값 제거. */
export function normalizeOperatorBannedWords(words: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const w of words) {
    if (typeof w !== "string") continue;
    const n = baseNormalize(w).replace(/\s+/g, " ").trim();
    if (n) out.add(n);
  }
  return [...out];
}

/**
 * 여러 입력(제목·본문 등)을 한 번에 판정한다. 걸리지 않으면 null.
 * `operatorWords` 는 운영자가 등록한 목록 — 비어 있어도 기본 목록은 적용된다.
 */
export function matchBannedWords(
  texts: readonly (string | null | undefined)[],
  operatorWords: readonly string[]
): BannedWordMatch | null {
  const joined = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0).join("\n");
  if (!joined) return null;
  const prepared = prepare(joined);
  for (const b of BASELINE_BANNED_TERMS) {
    if (termMatches(prepared, b.term, b.prefix === true)) return { source: "baseline", category: b.category };
  }
  for (const w of operatorWords) {
    if (termMatches(prepared, w, false)) return { source: "operator", category: "operator" };
  }
  return null;
}
