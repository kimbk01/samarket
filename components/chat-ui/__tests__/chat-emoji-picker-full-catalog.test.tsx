// @vitest-environment jsdom
/**
 * 이모지 전체 목록 (Owner 2026-11-16 「1·2·3번」 중 1번 · 설계 E1·O5·O6).
 * 119개 → 유니코드 공식 전체 목록, 분류 8개 + 최근, 검색(ko·en), 피부색(길게 누르기), 기기가 그리는 버전까지.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectMaxSupportedEmojiVersion,
  emojiWithSkinTone,
  filterEmojiItemsByVersion,
  loadEmojiCatalog,
  pushRecentEmoji,
  readRecentEmojis,
  searchEmojiItems,
  EMOJI_RECENT_MAX,
  setEmojiJsonLoaderForTests,
  type EmojiItem,
} from "@/lib/chat-ui/emoji-catalog/emoji-catalog-runtime";
import { ChatEmojiPicker } from "@/components/chat-ui/ChatEmojiPicker";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));

/** public/emoji 파일을 그대로 읽는다(실행 중에는 fetch 로 받는 같은 파일). */
const readPublic = (url: string): unknown =>
  JSON.parse(readFileSync(path.join(process.cwd(), "public", url.replace(/^\//, "")), "utf8"));
const catalog = readPublic("/emoji/catalog.v1.json") as {
  items: Array<[string, number, number, string[]?]>;
  sentinels: Array<[number, string, number]>;
};
const searchKo = readPublic("/emoji/search.ko.v1.json") as string[];
const searchEn = readPublic("/emoji/search.en.v1.json") as string[];

beforeAll(() => setEmojiJsonLoaderForTests(async (url) => readPublic(url)));
afterAll(() => setEmojiJsonLoaderForTests(null));

describe("데이터 (scripts/build-emoji-catalog.mjs 결과)", () => {
  it("기본 이모지 1,900개 이상 · 8분류 모두 있음 · 검색어 개수 일치", () => {
    expect(catalog.items.length).toBeGreaterThanOrEqual(1900);
    expect(new Set(catalog.items.map((x) => x[1])).size).toBe(8);
    expect(searchKo).toHaveLength(catalog.items.length);
    expect(searchEn).toHaveLength(catalog.items.length);
    expect(new Set(catalog.items.map((x) => x[0])).size).toBe(catalog.items.length);
  });

  it("지금까지의 119개는 모두 포함", () => {
    const all = new Set(catalog.items.map((x) => x[0] as string));
    for (const e of ["😀", "🥰", "🥳", "👍", "🤟", "❤️", "🤎", "💔", "♥️", "🙏"]) expect(all.has(e)).toBe(true);
  });

  it("피부색 있는 이모지는 5종", () => {
    const thumbs = catalog.items.find((x) => x[0] === "👍");
    expect(thumbs?.[3]).toHaveLength(5);
  });
});

describe("검색 (O5 ko·en)", () => {
  let items: EmojiItem[];
  beforeEach(async () => {
    items = (await loadEmojiCatalog()).items;
  });
  it("한국어 「따봉」·영어 「thumbs」로 👍", () => {
    expect(searchEmojiItems(items, [searchKo, searchEn], "따봉").map((x) => x.e)).toContain("👍");
    expect(searchEmojiItems(items, [searchKo, searchEn], "thumbs").map((x) => x.e)).toContain("👍");
  });
  it("기기 버전으로 거른 목록에서도 검색이 맞는 이모지를 찾는다(2026-11-16 실기: 「thumbs」에 👍 빠짐)", () => {
    const filtered = filterEmojiItemsByVersion(items, 14);
    expect(filtered.length).toBeLessThan(items.length);
    const hits = searchEmojiItems(filtered, [searchKo, searchEn], "thumbs").map((x) => x.e);
    expect(hits).toContain("👍");
    expect(hits).toContain("👎");
    expect(hits).not.toContain("✊");
    expect(searchEmojiItems(filtered, [searchKo, searchEn], "따봉").map((x) => x.e)).toEqual(["👍"]);
  });

  it("「하트」 검색은 하트 여러 개, 공백만이면 0", () => {
    expect(searchEmojiItems(items, [searchKo], "하트").length).toBeGreaterThan(5);
    expect(searchEmojiItems(items, [searchKo], "   ")).toHaveLength(0);
  });
});

describe("기기 버전 판정 (O6)", () => {
  const sentinels = catalog.sentinels;
  it("기기가 14.0 까지만 그리면 14 를 돌려주고 거르면 15 이상은 빠진다", () => {
    const supported = new Set(sentinels.filter(([v]) => v <= 14).map(([, e]) => e));
    const v = detectMaxSupportedEmojiVersion(sentinels, {
      isColorGlyph: (t) => supported.has(t),
      width: () => 32,
    });
    expect(v).toBe(14);
    const items = catalog.items.map(([e, c, ver], i) => ({ e, c, v: ver, i }) as EmojiItem);
    const kept = filterEmojiItemsByVersion(items, v);
    expect(kept.every((x) => x.v <= 14)).toBe(true);
    expect(kept.length).toBeLessThan(items.length);
  });
  it("ZWJ 묶음을 두 그림으로 그리는 기기(폭 2배)는 그 버전을 지원 안 함으로 본다", () => {
    const v = detectMaxSupportedEmojiVersion([[15.1, "🙂‍↔️", 1], [15, "🫨", 0]], {
      isColorGlyph: () => true,
      width: (t) => (t === "😀" ? 32 : 64),
    });
    expect(v).toBe(15);
  });
  it("판정 불가(캔버스 없음)면 거르지 않는다", () => {
    expect(detectMaxSupportedEmojiVersion(sentinels, null)).toBeNull();
    expect(filterEmojiItemsByVersion([{ e: "🫠", c: 0, v: 14, i: 0 }], null)).toHaveLength(1);
  });
});

describe("최근·피부색", () => {
  beforeEach(() => window.localStorage.clear());
  it("최근은 앞으로 이동·중복 없음·최대 개수", () => {
    pushRecentEmoji("😀");
    pushRecentEmoji("👍");
    expect(pushRecentEmoji("😀")).toEqual(["😀", "👍"]);
    for (let i = 0; i < 40; i++) pushRecentEmoji(String.fromCodePoint(0x1f600 + i));
    expect(readRecentEmojis()).toHaveLength(EMOJI_RECENT_MAX);
  });
  it("피부색 적용", () => {
    expect(emojiWithSkinTone({ e: "👍", c: 0, v: 0.6, s: ["👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿"], i: 0 }, 3)).toBe("👍🏽");
    expect(emojiWithSkinTone({ e: "😀", c: 0, v: 1, i: 0 }, 3)).toBe("😀");
  });
});

describe("ChatEmojiPicker 화면", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  async function render(onPick = vi.fn()) {
    act(() => root.render(<ChatEmojiPicker onPick={onPick} />));
    for (let i = 0; i < 50 && !host.querySelector("[data-emoji]"); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
    return onPick;
  }

  it("분류 탭 9개(최근+8) · 첫 분류에 표정·사람 수백 개 · 누르면 onPick + 최근 저장", async () => {
    const onPick = await render();
    expect(host.querySelectorAll("[data-emoji-tab]")).toHaveLength(9);
    expect(host.querySelectorAll("[data-emoji]").length).toBeGreaterThan(300);
    act(() => (host.querySelector('[data-emoji="😂"]') as HTMLButtonElement).click());
    expect(onPick).toHaveBeenCalledWith("😂");
    expect(readRecentEmojis()[0]).toBe("😂");
  });

  it("깃발 분류로 바꾸면 🇰🇷 이 보인다", async () => {
    await render();
    act(() => (host.querySelector('[data-emoji-tab="7"]') as HTMLButtonElement).click());
    expect(host.querySelector('[data-emoji="🇰🇷"]')).not.toBeNull();
  });

  it("길게 누르면 피부색 6칸, 고르면 그 피부색으로 onPick", async () => {
    const onPick = await render();
    vi.useFakeTimers();
    const btn = host.querySelector('[data-emoji="👍"]') as HTMLButtonElement;
    act(() => {
      btn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      vi.advanceTimersByTime(500);
    });
    const tones = host.querySelectorAll("[data-emoji-skin]");
    expect(tones).toHaveLength(6);
    act(() => (tones[2] as HTMLButtonElement).click());
    expect(onPick).toHaveBeenCalledWith("👍🏼");
  });

  it("거래 채팅 입력창도 같은 피커를 쓴다(예전 119개 목록 파일 없음)", () => {
    const src = readFileSync(path.join(process.cwd(), "components/chats/ChatInputBar.tsx"), "utf8");
    expect(src).toContain("<ChatEmojiPicker onPick={handleEmojiPick} />");
    expect(src).not.toContain("chat-emoji-catalog");
  });
});
