/**
 * 저장된 옛 문장 → 카탈로그 키 대응 (언어 재감사 2026-11-27 설계 §4-3 · B3 방식).
 *
 * DB 에 화면 문장이 저장된 옛 행(알림·포인트 설명·고객센터 시작 메시지)은 DB 를 고치지 않고,
 * 화면에서 「알려진 고정 문장」을 카탈로그 ko·en 값으로 거꾸로 찾아 키 + 치환값으로 되돌린다.
 * - `{name}` 같은 치환값은 정규식으로 뽑는다.
 * - 대응표에 없는 글(사람이 쓴 내용)은 찾지 못한 것으로 두고 호출자가 그대로 보여 준다.
 * - 한국어 문장을 코드에 두지 않는다 — 대응표 = 카탈로그 값.
 */
import type { AppLanguageCode } from "./config";
import { MESSAGES, translate, type MessageKey } from "./messages";

export type CatalogTemplateMatch = {
  key: MessageKey;
  vars: Record<string, string>;
  /** 치환값 없는 고정 문장으로 맞았는가 (틀 대응이면 없음) */
  fixed?: true;
};

type CompiledTemplate = {
  key: MessageKey;
  re: RegExp;
  names: string[];
  /** 치환값 밖 글자 수 — 긴 문장부터 맞춘다 */
  literalLength: number;
  /** 틀이 고정 글자로 시작하면 그 첫 글자, 치환값으로 시작하면 "" (B2 묶음) */
  firstLiteral: string;
  /** 틀이 고정 글자로 끝나면 그 끝 글자, 치환값으로 끝나면 "" (B2 묶음) */
  lastLiteral: string;
};

const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const HAS_PLACEHOLDER = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/;
/** 치환값 밖 글자가 이보다 적은 틀(`{a} · {b}` 등)은 사람이 쓴 글과 구분이 안 되어 쓰지 않는다 */
const MIN_LITERAL_CHARS = 2;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 카탈로그 틀 1개 → 정규식. 쓸 수 없는 틀이면 null */
export function compileCatalogTemplate(key: MessageKey, template: string): CompiledTemplate | null {
  const t = template.trim();
  if (!t) return null;
  const names: string[] = [];
  let src = "^";
  let literal = "";
  let last = 0;
  let prevWasVar = false;
  for (const m of t.matchAll(new RegExp(PLACEHOLDER.source, "g"))) {
    const lit = t.slice(last, m.index);
    if (prevWasVar && lit.length === 0) return null;
    src += escapeRegExp(lit);
    literal += lit;
    const name = m[1]!;
    const prior = names.indexOf(name);
    if (prior >= 0) {
      src += `\\${prior + 1}`;
      names.push(`__dup_${names.length}`);
    } else {
      src += "([\\s\\S]+?)";
      names.push(name);
    }
    last = (m.index ?? 0) + m[0].length;
    prevWasVar = true;
  }
  if (names.length === 0) return null;
  const tail = t.slice(last);
  src += `${escapeRegExp(tail)}$`;
  literal += tail;
  const literalLength = literal.replace(/\s/g, "").length;
  if (literalLength < MIN_LITERAL_CHARS) return null;
  const firstLiteral = t.startsWith("{") && /^\{[a-zA-Z_][a-zA-Z0-9_]*\}/.test(t) ? "" : t[0]!;
  const lastLiteral = tail.length > 0 ? tail[tail.length - 1]! : "";
  return { key, re: new RegExp(src), names, literalLength, firstLiteral, lastLiteral };
}

export type CatalogTemplateMatcher = (text: string | null | undefined) => CatalogTemplateMatch | null;

type IndexedTemplate = CompiledTemplate & { order: number };

/**
 * 치환 틀 묶음 (언어 사후 검토 B2 · 2026-11-27) — 틀 수백 개를 행마다 차례로 비교하지 않는다.
 * - 고정 글자로 시작하는 틀: 첫 글자 묶음
 * - 치환값으로 시작하고 고정 글자로 끝나는 틀: 끝 글자 묶음
 * - 앞뒤가 모두 치환값인 틀: 항상 비교
 * 비교 순서(긴 고정 글자 먼저)는 `order` 로 지켜 결과가 예전(전부 차례로)과 같다.
 */
type TemplateBuckets = {
  byFirst: Map<string, IndexedTemplate[]>;
  byLast: Map<string, IndexedTemplate[]>;
  always: IndexedTemplate[];
};

function bucketTemplates(list: CompiledTemplate[]): TemplateBuckets {
  const byFirst = new Map<string, IndexedTemplate[]>();
  const byLast = new Map<string, IndexedTemplate[]>();
  const always: IndexedTemplate[] = [];
  const push = (map: Map<string, IndexedTemplate[]>, ch: string, tpl: IndexedTemplate) => {
    const arr = map.get(ch);
    if (arr) arr.push(tpl);
    else map.set(ch, [tpl]);
  };
  list.forEach((tpl, order) => {
    const it: IndexedTemplate = { ...tpl, order };
    if (tpl.firstLiteral) push(byFirst, tpl.firstLiteral, it);
    else if (tpl.lastLiteral) push(byLast, tpl.lastLiteral, it);
    else always.push(it);
  });
  return { byFirst, byLast, always };
}

/** 세 묶음을 `order` 순으로 합쳐 하나씩 꺼낸다 (각 묶음은 이미 order 오름차순) */
function* candidatesInOrder(groups: readonly (readonly IndexedTemplate[])[]): Generator<IndexedTemplate> {
  const idx = groups.map(() => 0);
  for (;;) {
    let best = -1;
    for (let g = 0; g < groups.length; g += 1) {
      const t = groups[g]![idx[g]!];
      if (t && (best < 0 || t.order < groups[best]![idx[best]!]!.order)) best = g;
    }
    if (best < 0) return;
    yield groups[best]![idx[best]!]!;
    idx[best] = idx[best]! + 1;
  }
}

const EMPTY: readonly IndexedTemplate[] = [];

/**
 * 키 목록(또는 키 조건)에 대한 대응 함수를 만든다. 정규식은 처음 쓸 때 1회 만든다.
 * ko 값을 먼저, 그다음 en 값을 본다(같은 문장이면 먼저 나온 키).
 * 치환값 없는 고정 문장은 `Map` 1회 조회, 치환 틀은 첫·끝 글자 묶음만 비교한다(B2).
 */
export function createCatalogTemplateMatcher(
  select: readonly MessageKey[] | ((key: string) => boolean)
): CatalogTemplateMatcher {
  let exact: Map<string, MessageKey> | null = null;
  let buckets: TemplateBuckets | null = null;

  const build = () => {
    exact = new Map();
    const list: CompiledTemplate[] = [];
    const ko = MESSAGES.ko as unknown as Record<string, string>;
    const en = MESSAGES.en as unknown as Record<string, string>;
    const keys: string[] = Array.isArray(select)
      ? [...select]
      : Object.keys(ko).filter((k) => (select as (key: string) => boolean)(k));
    for (const bag of [ko, en]) {
      for (const key of keys) {
        const value = bag[key];
        if (typeof value !== "string" || !value.trim()) continue;
        if (!HAS_PLACEHOLDER.test(value)) {
          const s = value.trim();
          if (!exact.has(s)) exact.set(s, key as MessageKey);
          continue;
        }
        const compiled = compileCatalogTemplate(key as MessageKey, value);
        if (compiled) list.push(compiled);
      }
    }
    list.sort((a, b) => b.literalLength - a.literalLength);
    buckets = bucketTemplates(list);
  };

  return (text) => {
    const s = (text ?? "").trim();
    if (!s) return null;
    if (!exact || !buckets) build();
    const hit = exact!.get(s);
    if (hit) return { key: hit, vars: {}, fixed: true };
    const b = buckets!;
    const groups = [b.byFirst.get(s[0]!) ?? EMPTY, b.byLast.get(s[s.length - 1]!) ?? EMPTY, b.always];
    for (const tpl of candidatesInOrder(groups)) {
      const m = tpl.re.exec(s);
      if (!m) continue;
      const vars: Record<string, string> = {};
      tpl.names.forEach((name, i) => {
        if (!name.startsWith("__dup_")) vars[name] = m[i + 1] ?? "";
      });
      return { key: tpl.key, vars };
    }
    return null;
  };
}

const UNREPLACED = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/;

/** 대응 결과를 보는 사람 언어로 그린다. 빈 결과·치환 안 된 틀이면 null */
export function renderCatalogTemplateMatch(
  lang: AppLanguageCode,
  match: CatalogTemplateMatch,
  vars?: Record<string, string | number>
): string | null {
  const out = translate(lang, match.key, { ...match.vars, ...(vars ?? {}) }).trim();
  if (!out || out === match.key || UNREPLACED.test(out)) return null;
  return out;
}
