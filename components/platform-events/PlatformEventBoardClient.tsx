"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { AppEmptyState } from "@/components/app-shell/AppEmptyState";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { openDestination } from "@/lib/destination/open-destination";
import {
  formatPlatformEventPeriod,
  PLATFORM_EVENT_BOARD_STATES,
  type PlatformEventBoardItem,
  type PlatformEventBoardState,
} from "@/lib/platform-events/board";
import { Sam } from "@/lib/ui/sam-component-classes";

type TabData = {
  items: PlatformEventBoardItem[];
  nextCursor: string | null;
  loaded: boolean;
};

type BoardSnapshot = {
  tab: PlatformEventBoardState;
  tabs: Record<PlatformEventBoardState, TabData>;
  scrollByTab: Record<PlatformEventBoardState, number>;
  savedAt: number;
};

/** Per-session restore on back (tab, loaded pages, scroll). */
const SNAPSHOT_KEY = "dibay:event-board:v1";
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

const EMPTY_TAB: TabData = { items: [], nextCursor: null, loaded: false };

function emptyTabs(): Record<PlatformEventBoardState, TabData> {
  return { ongoing: { ...EMPTY_TAB }, ended: { ...EMPTY_TAB } };
}

function readSnapshot(): BoardSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as BoardSnapshot;
    if (!snap || typeof snap.savedAt !== "number") return null;
    if (Date.now() - snap.savedAt > SNAPSHOT_TTL_MS) return null;
    if (!snap.tabs?.ongoing || !snap.tabs?.ended) return null;
    return snap;
  } catch {
    return null;
  }
}

function writeSnapshot(snap: Omit<BoardSnapshot, "savedAt">): void {
  try {
    window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...snap, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — restore is best-effort */
  }
}

export function PlatformEventBoardClient({
  initialState,
}: {
  initialState: PlatformEventBoardState;
}) {
  const router = useRouter();
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [tab, setTab] = useState<PlatformEventBoardState>(initialState);
  const [tabs, setTabs] = useState<Record<PlatformEventBoardState, TabData>>(emptyTabs);
  const [loadingTab, setLoadingTab] = useState<PlatformEventBoardState | null>(null);
  const [errorTab, setErrorTab] = useState<PlatformEventBoardState | null>(null);
  const scrollByTabRef = useRef<Record<PlatformEventBoardState, number>>({ ongoing: 0, ended: 0 });
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const inflightRef = useRef<Set<string>>(new Set());
  const restoredRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const persist = useCallback(() => {
    writeSnapshot({
      tab: tabRef.current,
      tabs: tabsRef.current,
      scrollByTab: scrollByTabRef.current,
    });
  }, []);

  const load = useCallback(async (state: PlatformEventBoardState, cursor: string | null) => {
    const key = `${state}:${cursor ?? ""}`;
    if (inflightRef.current.has(key)) return;
    inflightRef.current.add(key);
    setLoadingTab(state);
    setErrorTab((e) => (e === state ? null : e));
    try {
      const qs = new URLSearchParams({ state });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`/api/platform-events?${qs.toString()}`, { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: PlatformEventBoardItem[];
        nextCursor?: string | null;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.items)) {
        setErrorTab(state);
        return;
      }
      const items = json.items;
      setTabs((prev) => {
        const base = cursor ? prev[state].items : [];
        const seen = new Set(base.map((i) => i.id));
        return {
          ...prev,
          [state]: {
            items: [...base, ...items.filter((i) => !seen.has(i.id))],
            nextCursor: json.nextCursor ?? null,
            loaded: true,
          },
        };
      });
    } catch {
      setErrorTab(state);
    } finally {
      inflightRef.current.delete(key);
      setLoadingTab((l) => (l === state ? null : l));
    }
  }, []);

  /* Restore on back (before paint so the list does not jump), else first fetch. */
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readSnapshot();
    if (snap && snap.tabs[initialState]?.loaded) {
      scrollByTabRef.current = snap.scrollByTab ?? { ongoing: 0, ended: 0 };
      setTabs(snap.tabs);
      const y = scrollByTabRef.current[initialState] ?? 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
      return;
    }
    void load(initialState, null);
  }, [initialState, load]);

  useEffect(() => {
    persist();
  }, [tabs, tab, persist]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      scrollByTabRef.current[tabRef.current] = window.scrollY;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        persist();
      }, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      persist();
    };
  }, [persist]);

  const current = tabs[tab];
  const loading = loadingTab === tab;

  /* Infinite load: sentinel near the end triggers the same cursor fetch as 「더보기」. */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !current.nextCursor || typeof IntersectionObserver === "undefined") return;
    const cursor = current.nextCursor;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load(tab, cursor);
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, current.nextCursor, load]);

  const switchTab = (next: PlatformEventBoardState) => {
    if (next === tab) return;
    scrollByTabRef.current[tab] = window.scrollY;
    setTab(next);
    router.replace(next === "ended" ? "/events?tab=ended" : "/events", { scroll: false });
    const y = scrollByTabRef.current[next] ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
    if (!tabsRef.current[next].loaded) void load(next, null);
  };

  const openItem = (item: PlatformEventBoardItem) => {
    scrollByTabRef.current[tab] = window.scrollY;
    persist();
    openDestination(item.href, router);
  };

  const tabLabel = (s: PlatformEventBoardState) =>
    s === "ongoing"
      ? safeT("platform_event_board_tab_ongoing", { fallbackKo: "진행 중", fallbackEn: "Ongoing" })
      : safeT("platform_event_board_tab_ended", { fallbackKo: "종료", fallbackEn: "Ended" });

  return (
    <div className="min-h-dvh bg-sam-app text-sam-fg" data-platform-event-board="1">
      <header className="sticky top-0 z-10 border-b border-sam-border bg-sam-app/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-2">
          <AppBackButton
            preferHistoryBack
            backHref="/market"
            ariaLabel={safeT("nav_back", { fallbackKo: "뒤로가기", fallbackEn: "Go back" })}
          />
          <h1 className="truncate text-[15px] font-semibold">
            {safeT("platform_event_board_title", { fallbackKo: "이벤트", fallbackEn: "Events" })}
          </h1>
        </div>
        <div className={`${Sam.tabs.bar} px-4`} role="tablist">
          {PLATFORM_EVENT_BOARD_STATES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              className={tab === s ? Sam.tabs.tabActive : Sam.tabs.tab}
              onClick={() => switchTab(s)}
              data-platform-event-board-tab={s}
            >
              {tabLabel(s)}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-4 pb-10 pt-3">
        {current.items.length > 0 ? (
          <ul className="space-y-4">
            {current.items.map((item) => (
              <li key={item.id}>
                <EventBoardCard item={item} lang={lang} safeT={safeT} onOpen={() => openItem(item)} />
              </li>
            ))}
          </ul>
        ) : current.loaded && !loading && errorTab !== tab ? (
          <AppEmptyState
            title={
              tab === "ongoing"
                ? safeT("platform_event_board_empty_ongoing", {
                    fallbackKo: "진행 중인 이벤트가 없습니다.",
                    fallbackEn: "No ongoing events.",
                  })
                : safeT("platform_event_board_empty_ended", {
                    fallbackKo: "최근 30일 내 종료된 이벤트가 없습니다.",
                    fallbackEn: "No events ended in the last 30 days.",
                  })
            }
          />
        ) : null}

        {errorTab === tab ? (
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-sam-muted">
              {safeT("platform_event_board_load_failed", {
                fallbackKo: "이벤트를 불러오지 못했습니다.",
                fallbackEn: "Could not load events.",
              })}
            </p>
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
              onClick={() => void load(tab, current.loaded ? current.nextCursor : null)}
            >
              {safeT("platform_event_board_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-sam-muted">
            {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
          </p>
        ) : current.nextCursor && errorTab !== tab ? (
          <div ref={sentinelRef} className="mt-4">
            <button
              type="button"
              className={`${Sam.btn.outlineCombo} ${Sam.btn.block}`}
              onClick={() => void load(tab, current.nextCursor)}
              data-platform-event-board-more="1"
            >
              {safeT("platform_event_board_more", { fallbackKo: "더보기", fallbackEn: "Load more" })}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function EventBoardCard({
  item,
  lang,
  safeT,
  onOpen,
}: {
  item: PlatformEventBoardItem;
  lang: "ko" | "en";
  safeT: ReturnType<typeof useI18n>["safeT"];
  onOpen: () => void;
}) {
  const period = formatPlatformEventPeriod(item.startsAt, item.endsAt, lang);
  const ended = item.state === "ended";
  const badge = ended
    ? safeT("platform_event_board_ended_badge", { fallbackKo: "종료", fallbackEn: "Ended" })
    : item.dday ??
      (item.endsAt
        ? null
        : safeT("platform_event_board_always_on", { fallbackKo: "상시 진행", fallbackEn: "Always on" }));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface text-left"
      data-platform-event-board-card={item.id}
    >
      <div className={`relative aspect-[2/1] w-full bg-sam-surface-muted ${ended ? "opacity-60" : ""}`}>
        {item.thumbnailUrl ? (
          <SamarketThumbnail
            src={item.thumbnailUrl}
            alt=""
            fill
            fetchDisplayPx={720}
            className="h-full w-full"
            imageClassName="object-cover"
          />
        ) : null}
      </div>
      <div className="space-y-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.isPinned ? (
            <span className={Sam.chip.neutral}>
              {safeT("platform_event_board_pinned", { fallbackKo: "고정", fallbackEn: "Pinned" })}
            </span>
          ) : null}
          {item.category ? <span className={Sam.chip.neutral}>{item.category}</span> : null}
          {badge ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                ended ? "bg-sam-surface-muted text-sam-muted" : "bg-sam-primary text-sam-on-primary"
              }`}
              data-platform-event-board-dday={ended ? undefined : "1"}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <h2 className="line-clamp-2 text-[16px] font-semibold leading-snug text-sam-fg">{item.title}</h2>
        {period ? <p className="text-[13px] text-sam-muted">{period}</p> : null}
      </div>
    </button>
  );
}
