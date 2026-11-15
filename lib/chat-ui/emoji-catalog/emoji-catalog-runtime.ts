/**
 * 이모지 피커 실행 모듈 — 데이터는 `scripts/build-emoji-catalog.mjs` 가 만든 JSON(유니코드 공식 전체 목록).
 * 설계: docs/design/messenger-media-emoji-ssot-design-2026-11-15.md E1 · O5(검색 ko·en) · O6(기기에서 그려지는 버전까지).
 *
 * O6 — 이모지는 기기 글꼴로 그려진다(웹뷰). 지원 최소 OS(Android 7.0·iOS 15.0)는 최신 이모지를 못 그려
 * 빈 네모가 된다. OS 번호로 고정 상한을 두면 새 기기에서도 이모지가 빠지므로, **이 기기가 실제로 그리는
 * 가장 높은 버전**을 캔버스로 한 번 재서 그 버전까지만 보여 준다.
 */

export type EmojiCategoryIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 0 표정·사람 · 1 동물·자연 · 2 음식 · 3 활동 · 4 여행·장소 · 5 사물 · 6 기호 · 7 깃발 */
export const EMOJI_CATEGORY_COUNT = 8;

export type EmojiItem = {
  /** 기본 이모지 */
  e: string;
  c: EmojiCategoryIndex;
  /** 유니코드 이모지 버전 */
  v: number;
  /** 피부색 5종(밝음→어두움) — 없으면 피부색 없음 */
  s?: string[];
  /**
   * 데이터 파일 안 순번 = 검색어 묶음(search.*.json)의 같은 칸.
   * 기기 버전으로 거른 목록의 순번과 다르므로 검색은 반드시 이 값으로 찾는다
   * (2026-11-16 실기: 거른 뒤 순번으로 찾아 「thumbs」에 👍 가 빠지고 👎·✊ 가 나옴).
   */
  i: number;
};

type RawCatalog = {
  source: string;
  count: number;
  items: Array<[string, number, number] | [string, number, number, string[]]>;
  /** [버전, 판정 글자, ZWJ 여부(1)] — 높은 버전부터 */
  sentinels: Array<[number, string, number]>;
};

export type EmojiCatalog = { items: EmojiItem[]; sentinels: RawCatalog["sentinels"] };

/** 데이터 파일(public/emoji) — 내용이 바뀌면 파일 이름의 v 숫자를 올린다(캐시 구분). */
export const EMOJI_CATALOG_URL = "/emoji/catalog.v1.json";
export const emojiSearchIndexUrl = (lang: "ko" | "en") => `/emoji/search.${lang}.v1.json`;

export type EmojiJsonLoader = (url: string) => Promise<unknown>;

const defaultLoader: EmojiJsonLoader = async (url) => {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`emoji_catalog_${res.status}`);
  return res.json();
};

let loader: EmojiJsonLoader = defaultLoader;

/** 시험용 — 파일 읽기로 바꿔 끼운다. */
export function setEmojiJsonLoaderForTests(next: EmojiJsonLoader | null): void {
  loader = next ?? defaultLoader;
  catalogPromise = null;
  searchPromises.clear();
}

export function parseEmojiCatalog(raw: unknown): EmojiCatalog {
  const r = raw as RawCatalog;
  return {
    items: r.items.map(([e, c, v, s], i) =>
      s ? { e, c: c as EmojiCategoryIndex, v, s, i } : { e, c: c as EmojiCategoryIndex, v, i }
    ),
    sentinels: r.sentinels,
  };
}

let catalogPromise: Promise<EmojiCatalog> | null = null;

export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  if (!catalogPromise) {
    const p = loader(EMOJI_CATALOG_URL).then(parseEmojiCatalog);
    catalogPromise = p;
    p.catch(() => {
      if (catalogPromise === p) catalogPromise = null;
    });
  }
  return catalogPromise;
}

const searchPromises = new Map<"ko" | "en", Promise<string[]>>();

/** 검색어 묶음(items 와 같은 순서). 피커에서 검색을 처음 쓸 때만 불러온다. */
export function loadEmojiSearchIndex(lang: "ko" | "en"): Promise<string[]> {
  let p = searchPromises.get(lang);
  if (!p) {
    const next = loader(emojiSearchIndexUrl(lang)).then((x) => (Array.isArray(x) ? (x as string[]) : []));
    next.catch(() => searchPromises.delete(lang));
    searchPromises.set(lang, next);
    p = next;
  }
  return p;
}

/** 검색: 모든 낱말이 이름·태그(ko 또는 en)에 들어 있는 이모지. 공백만이면 빈 목록. */
export function searchEmojiItems(
  items: EmojiItem[],
  indexes: string[][],
  query: string,
  limit = 160
): EmojiItem[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out: EmojiItem[] = [];
  for (let n = 0; n < items.length && out.length < limit; n++) {
    const item = items[n]!;
    if (item.e === query.trim()) {
      out.push(item);
      continue;
    }
    const hit = indexes.some((idx) => {
      const text = idx[item.i] ?? "";
      return words.every((w) => text.includes(w));
    });
    if (hit) out.push(item);
  }
  return out;
}

/* ---------- O6: 이 기기가 그리는 가장 높은 이모지 버전 ---------- */

export type EmojiGlyphProbe = {
  /** 색 있는 한 글자 이모지로 그려지면 true(빈 네모·글자 색 상자는 false) */
  isColorGlyph: (text: string) => boolean;
  /** 글 폭(px) */
  width: (text: string) => number;
};

/**
 * 캔버스 판정: 같은 글자를 검정·흰색 글자색으로 두 번 그려 픽셀이 같으면 「색 이모지 그림」이다.
 * 기기 글꼴에 없는 글자(빈 네모)는 글자색을 따라 칠해져 두 번의 픽셀이 달라진다.
 */
export function createCanvasEmojiGlyphProbe(): EmojiGlyphProbe | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  const c = ctx;
  c.textBaseline = "top";
  c.font = "32px sans-serif";
  const draw = (text: string, color: string): Uint8ClampedArray => {
    c.clearRect(0, 0, 40, 40);
    c.fillStyle = color;
    c.fillText(text, 0, 0);
    return c.getImageData(0, 0, 40, 40).data;
  };
  return {
    isColorGlyph(text) {
      try {
        const a = draw(text, "#000");
        const b = draw(text, "#fff");
        let painted = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i + 3]! > 0) painted++;
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) return false;
        }
        return painted > 0;
      } catch {
        return false;
      }
    },
    width(text) {
      try {
        return c.measureText(text).width;
      } catch {
        return 0;
      }
    },
  };
}

/** 판정 글자를 높은 버전부터 그려 보고, 처음 그려지는 버전을 돌려준다. 판정할 수 없으면 null(거르지 않음). */
export function detectMaxSupportedEmojiVersion(
  sentinels: EmojiCatalog["sentinels"],
  probe: EmojiGlyphProbe | null
): number | null {
  if (!probe) return null;
  const oneWidth = probe.width("😀") || 0;
  for (const [version, text, zwj] of sentinels) {
    if (!probe.isColorGlyph(text)) continue;
    /** ZWJ 묶음을 모르는 기기는 두 그림으로 나눠 그린다 → 폭이 한 글자보다 넓다 */
    if (zwj && oneWidth > 0 && probe.width(text) > oneWidth * 1.4) continue;
    return version;
  }
  return null;
}

let detectedVersion: number | null | undefined;

/** 앱 실행 중 1회만 잰다. */
export function maxSupportedEmojiVersionOnThisDevice(sentinels: EmojiCatalog["sentinels"]): number | null {
  if (detectedVersion === undefined) {
    detectedVersion = detectMaxSupportedEmojiVersion(sentinels, createCanvasEmojiGlyphProbe());
  }
  return detectedVersion;
}

export function filterEmojiItemsByVersion(items: EmojiItem[], maxVersion: number | null): EmojiItem[] {
  if (maxVersion == null) return items;
  return items.filter((it) => it.v <= maxVersion);
}

/* ---------- 최근 사용·피부색 (기기 저장 — 편의 값, 실패해도 동작) ---------- */

export const EMOJI_RECENT_STORAGE_KEY = "dibay.emoji.recent.v1";
export const EMOJI_SKIN_STORAGE_KEY = "dibay.emoji.skin.v1";
export const EMOJI_RECENT_MAX = 32;

export function readRecentEmojis(): string[] {
  try {
    const raw = window.localStorage.getItem(EMOJI_RECENT_STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, EMOJI_RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecentEmojis().filter((x) => x !== emoji)].slice(0, EMOJI_RECENT_MAX);
  try {
    window.localStorage.setItem(EMOJI_RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패 — 이번 실행 동안만 */
  }
  return next;
}

/** 0 = 기본(노란색), 1~5 = 피부색 */
export function readEmojiSkinTone(): number {
  try {
    const n = Number(window.localStorage.getItem(EMOJI_SKIN_STORAGE_KEY));
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeEmojiSkinTone(tone: number): void {
  try {
    window.localStorage.setItem(EMOJI_SKIN_STORAGE_KEY, String(tone));
  } catch {
    /* ignore */
  }
}

export function emojiWithSkinTone(item: EmojiItem, tone: number): string {
  return tone > 0 && item.s && item.s[tone - 1] ? item.s[tone - 1]! : item.e;
}
