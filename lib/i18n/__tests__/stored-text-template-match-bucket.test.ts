/**
 * 언어 사후 검토 B2 (docs/audit/i18n-postmerge-fix-design-2026-11-27.md §2) —
 * 옛 문장 대응: 고정 틀 Map + 치환 틀은 첫·끝 고정 글자로 묶어 해당 묶음만 비교.
 * - 결과 동일: 차례로 전부 비교하던 방식(기준 구현)과 같은 키·값을 돌려준다.
 * - 시간: 대응되지 않는 100행(사람이 쓴 글) 기준 측정값을 남긴다.
 */
import { describe, expect, it } from "vitest";
import { MESSAGES, translate, type MessageKey } from "@/lib/i18n/messages";
import {
  compileCatalogTemplate,
  createCatalogTemplateMatcher,
  type CatalogTemplateMatch,
} from "@/lib/i18n/stored-text-template-match";

const PREFIXES = ["notify_", "offer_notif_", "promo_notice_", "feed_ad_notice_"] as const;
const select = (key: string) => key === "support_message_deleted" || PREFIXES.some((p) => key.startsWith(p));

/** 기준 구현 — 예전 방식 그대로(정확 문장 Map → 틀 전부 차례로) */
function naiveMatcher(selectKey: (key: string) => boolean) {
  const ko = MESSAGES.ko as unknown as Record<string, string>;
  const en = MESSAGES.en as unknown as Record<string, string>;
  const keys = Object.keys(ko).filter(selectKey);
  const exact = new Map<string, MessageKey>();
  const list: NonNullable<ReturnType<typeof compileCatalogTemplate>>[] = [];
  for (const bag of [ko, en]) {
    for (const key of keys) {
      const value = bag[key];
      if (typeof value !== "string" || !value.trim()) continue;
      if (!/\{[a-zA-Z_][a-zA-Z0-9_]*\}/.test(value)) {
        if (!exact.has(value.trim())) exact.set(value.trim(), key as MessageKey);
        continue;
      }
      const c = compileCatalogTemplate(key as MessageKey, value);
      if (c) list.push(c);
    }
  }
  list.sort((a, b) => b.literalLength - a.literalLength);
  return (text: string): CatalogTemplateMatch | null => {
    const s = text.trim();
    if (!s) return null;
    const hit = exact.get(s);
    if (hit) return { key: hit, vars: {} };
    for (const tpl of list) {
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

/** 모든 알림 문구(ko·en)를 표본 값으로 채운 문장 + 사람이 쓴 글 */
function corpus(): string[] {
  const ko = MESSAGES.ko as unknown as Record<string, string>;
  const keys = Object.keys(ko).filter(select);
  const out: string[] = [];
  const samples = ["Kim", "홍길동", "₱1,000", "SO1a2b", "3", "상대", "「가게」"];
  for (const lang of ["ko", "en"] as const) {
    for (const key of keys) {
      for (const sample of samples) {
        const vars = new Proxy({}, { get: () => sample, has: () => true }) as Record<string, string>;
        const names = [...((MESSAGES[lang] as unknown as Record<string, string>)[key] ?? "").matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map(
          (m) => m[1]!
        );
        const filled: Record<string, string> = {};
        for (const n of names) filled[n] = vars[n]!;
        out.push(translate(lang, key as MessageKey, filled));
      }
    }
  }
  out.push("좋아요", "내일 3시에 만나요", "Thanks!", "  ", "{name}", "사진", "ㅋㅋㅋ 좋아요 감사합니다", "SC-1 종료");
  return out;
}

function humanRows(n: number): string[] {
  const base = [
    "내일 3시에 만나요",
    "좋은 물건 감사합니다! 다음에 또 거래해요",
    "Is this still available?",
    "가격 조금만 깎아주실 수 있나요?",
    "넵 확인했습니다 😊",
    "Thank you so much, see you tomorrow at the mall",
    "사진 더 보내주실 수 있을까요",
    "ok",
  ];
  return Array.from({ length: n }, (_, i) => `${base[i % base.length]} #${i}`);
}

describe("B2 옛 문장 대응 — 묶음 비교", () => {
  it("결과 동일 — 기준 구현(전부 차례로)과 같은 키·값", () => {
    const fast = createCatalogTemplateMatcher(select);
    const slow = naiveMatcher(select);
    let compared = 0;
    for (const s of corpus()) {
      const a = fast(s);
      const b = slow(s);
      expect(a ? { key: a.key, vars: a.vars } : null, s).toEqual(b);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it("시간 — 대응되지 않는 100행", () => {
    const fast = createCatalogTemplateMatcher(select);
    const slow = naiveMatcher(select);
    const rows = humanRows(100);
    fast(rows[0]);
    slow(rows[0]);
    const time = (fn: (s: string) => unknown) => {
      const runs = 20;
      const t0 = performance.now();
      for (let r = 0; r < runs; r += 1) for (const s of rows) fn(s);
      return (performance.now() - t0) / runs;
    };
    const before = time(slow);
    const after = time(fast);
    // 보고용 측정값 (100행 1회 평균 ms)
    console.info(`[B2] 100행 대응 시간 — 전(차례로 전부) ${before.toFixed(3)}ms · 후(묶음) ${after.toFixed(3)}ms`);
    for (const s of rows) expect(fast(s)).toBeNull();
    expect(after).toBeLessThan(before);
  });
});
