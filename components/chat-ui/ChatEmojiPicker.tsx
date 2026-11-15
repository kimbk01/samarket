"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  EMOJI_CATEGORY_COUNT,
  emojiWithSkinTone,
  filterEmojiItemsByVersion,
  loadEmojiCatalog,
  loadEmojiSearchIndex,
  maxSupportedEmojiVersionOnThisDevice,
  pushRecentEmoji,
  readEmojiSkinTone,
  readRecentEmojis,
  searchEmojiItems,
  writeEmojiSkinTone,
  type EmojiItem,
} from "@/lib/chat-ui/emoji-catalog/emoji-catalog-runtime";

/**
 * 이모지 피커 — 메신저 입력창·반응 「+」·거래 채팅 입력창 공용 (한 부품).
 * 유니코드 공식 전체 목록 · 분류 8개 + 최근 · 검색(ko·en) · 피부색(길게 누르기) · 이 기기가 그리는 버전까지만.
 */

const CATEGORY_ICONS = ["😀", "🐻", "🍔", "⚽", "🚗", "💡", "🔣", "🏳️"] as const;
const CATEGORY_LABEL_KEYS = [
  "common_emoji_cat_smileys",
  "common_emoji_cat_animals",
  "common_emoji_cat_food",
  "common_emoji_cat_activities",
  "common_emoji_cat_travel",
  "common_emoji_cat_objects",
  "common_emoji_cat_symbols",
  "common_emoji_cat_flags",
] as const;
const RECENT_TAB = -1;
const SKIN_LONG_PRESS_MS = 450;

export function ChatEmojiPicker({
  onPick,
  disabled = false,
  className = "",
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t, language } = useI18n();
  const [items, setItems] = useState<EmojiItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecentEmojis()));
  const [tab, setTab] = useState<number>(() => (recent.length > 0 ? RECENT_TAB : 0));
  const [query, setQuery] = useState("");
  const [searchIndexes, setSearchIndexes] = useState<string[][] | null>(null);
  const [skinTone, setSkinTone] = useState(() => (typeof window === "undefined" ? 0 : readEmojiSkinTone()));
  const [skinFor, setSkinFor] = useState<EmojiItem | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadEmojiCatalog()
      .then((cat) => {
        if (!alive) return;
        setItems(filterEmojiItemsByVersion(cat.items, maxSupportedEmojiVersionOnThisDevice(cat.sentinels)));
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const searching = query.trim().length > 0;
  useEffect(() => {
    if (!searching || searchIndexes) return;
    let alive = true;
    const langs: Array<"ko" | "en"> = language === "ko" ? ["ko", "en"] : ["en"];
    Promise.all(langs.map((l) => loadEmojiSearchIndex(l)))
      .then((idx) => {
        if (alive) setSearchIndexes(idx);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [searching, searchIndexes, language]);

  useEffect(() => {
    gridRef.current?.scrollTo?.({ top: 0 });
  }, [tab, searching]);

  const byCategory = useMemo(() => {
    const out: EmojiItem[][] = Array.from({ length: EMOJI_CATEGORY_COUNT }, () => []);
    for (const it of items ?? []) out[it.c]!.push(it);
    return out;
  }, [items]);

  /** 원래 이모지 → 항목 (최근 목록은 피부색 적용 글자로 저장되므로 그대로 그린다) */
  const visible: Array<{ key: string; emoji: string; item: EmojiItem | null }> = useMemo(() => {
    if (searching) {
      if (!items || !searchIndexes) return [];
      return searchEmojiItems(items, searchIndexes, query).map((it) => ({
        key: it.e,
        emoji: emojiWithSkinTone(it, skinTone),
        item: it,
      }));
    }
    if (tab === RECENT_TAB) return recent.map((e) => ({ key: `r:${e}`, emoji: e, item: null }));
    return (byCategory[tab] ?? []).map((it) => ({ key: it.e, emoji: emojiWithSkinTone(it, skinTone), item: it }));
  }, [searching, items, searchIndexes, query, tab, recent, byCategory, skinTone]);

  const pick = (emoji: string) => {
    if (disabled) return;
    setRecent(pushRecentEmoji(emoji));
    onPick(emoji);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const onCellPointerDown = (item: EmojiItem | null) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    longPressFired.current = false;
    if (!item?.s || disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setSkinFor(item);
    }, SKIN_LONG_PRESS_MS);
  };

  const chooseSkin = (tone: number) => {
    const item = skinFor;
    setSkinFor(null);
    if (!item) return;
    setSkinTone(tone);
    writeEmojiSkinTone(tone);
    pick(emojiWithSkinTone(item, tone));
  };

  const tabButton = (
    idx: number,
    icon: string,
    labelKey: (typeof CATEGORY_LABEL_KEYS)[number] | "common_emoji_cat_recent"
  ) => {
    const active = !searching && tab === idx;
    return (
      <button
        key={idx}
        type="button"
        data-emoji-tab={idx}
        aria-label={t(labelKey)}
        aria-pressed={active}
        onClick={() => {
          setQuery("");
          setTab(idx);
        }}
        className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-ui-rect text-lg ${
          active ? "bg-[color:var(--overlay-secondary)]" : "opacity-60"
        }`}
      >
        {icon}
      </button>
    );
  };

  return (
    <div
      data-chat-emoji-picker=""
      className={`relative flex h-[min(46dvh,340px)] flex-col overflow-hidden sm:h-[min(52dvh,400px)] ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 px-2.5 pt-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("common_emoji_search_placeholder")}
          aria-label={t("common_emoji_search_placeholder")}
          enterKeyHint="search"
          className="h-9 w-full rounded-ui-rect border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-primary)] outline-none placeholder:text-[color:var(--overlay-text-secondary)]"
        />
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-b border-[color:var(--overlay-border)] px-1.5 py-1.5" role="tablist">
        {tabButton(RECENT_TAB, "🕘", "common_emoji_cat_recent")}
        {CATEGORY_ICONS.map((icon, i) => tabButton(i, icon, CATEGORY_LABEL_KEYS[i]!))}
      </div>
      <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {loadFailed ? null : items == null ? (
          <p className="py-6 text-center text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">
            {t("common_emoji_loading")}
          </p>
        ) : visible.length === 0 && searching && searchIndexes ? (
          <p className="py-6 text-center text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">
            {t("common_emoji_search_empty")}
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5 touch-manipulation">
            {visible.map(({ key, emoji, item }) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                data-emoji={emoji}
                className="flex aspect-square w-full items-center justify-center rounded-ui-rect text-[26px] leading-none active:bg-[color:var(--overlay-secondary)] disabled:cursor-not-allowed disabled:grayscale"
                onPointerDown={onCellPointerDown(item)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (longPressFired.current) {
                    longPressFired.current = false;
                    return;
                  }
                  pick(emoji);
                }}
                aria-label={`${t("common_emoji")} ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      {skinFor?.s ? (
        <div
          className="absolute inset-0 z-10 flex items-end justify-center bg-black/10 p-3"
          onClick={() => setSkinFor(null)}
        >
          <div
            role="dialog"
            aria-label={t("common_emoji_skin_tone_aria")}
            data-emoji-skin-picker=""
            className="flex gap-1 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] p-1.5 shadow-[var(--overlay-elevation-2)]"
            onClick={(e) => e.stopPropagation()}
          >
            {[skinFor.e, ...skinFor.s].map((v, tone) => (
              <button
                key={v}
                type="button"
                data-emoji-skin={tone}
                className={`flex h-11 w-11 items-center justify-center rounded-ui-rect text-[26px] ${
                  tone === skinTone ? "bg-[color:var(--overlay-secondary)]" : ""
                }`}
                onClick={() => chooseSkin(tone)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
