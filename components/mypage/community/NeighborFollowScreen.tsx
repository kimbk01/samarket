/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityCard } from "@/components/community/CommunityCard";
import { NeighborFollowButton, useNeighborFollowToggle } from "@/components/community/ui/NeighborFollowButton";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { setNeighborFollowHeaderCount } from "@/components/mypage/community/NeighborFollowHeaderAction";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { NEIGHBOR_FOLLOW_LIMIT } from "@/lib/community/neighbor-follow-contract";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { philifeAppPaths } from "@/lib/philife/paths";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 내정보 › 라운지 › 관심이웃 (시안 `docs/audit/interest-neighbor-mypage-mockup-2026-11-28.html` ②③④).
 * 레거시 당근 「모아보기」(FAQ 102) 구조 — 보기: 사진 줄 + 관심이웃들의 글 · 관리: 즉시 해제 + [되돌리기].
 * 사람 목록 = `/api/me/relations/neighbor`(탈퇴·차단 제외 SSOT), 글 = 피드 API `neighborOnly`(피드와 같은 공개·숨김·차단 규칙).
 */
type NeighborItem = {
  id: string;
  targetId: string;
  nickname: string | null;
  username?: string | null;
  avatarUrl: string | null;
  regionName: string | null;
  createdAt: string;
};

const PEOPLE_KEY = "me:relations:neighbor:list";
const POSTS_PAGE = 20;

function useNeighborPeople(reloadKey: number) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ok"; items: NeighborItem[] }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await runSingleFlight(`${PEOPLE_KEY}:${reloadKey}`, async () => {
          const res = await fetch("/api/me/relations/neighbor", { credentials: "include", cache: "no-store" });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: NeighborItem[] };
          if (!res.ok || !json.ok) throw new Error("neighbor_list_failed");
          return Array.isArray(json.items) ? json.items : [];
        });
        if (!cancelled) setState({ kind: "ok", items });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return state;
}

export function NeighborFollowScreen() {
  const { t } = useI18n();
  const manage = useSearchParams().get("manage") === "1";
  /** 관리에서 나오면 사람 목록을 다시 읽어 해제한 사람을 뺀다(시안 ③ 「화면을 나가면 목록에서 빠짐」) */
  const [reloadKey, setReloadKey] = useState(0);
  const prevManage = useRef(manage);
  useEffect(() => {
    if (prevManage.current && !manage) setReloadKey((k) => k + 1);
    prevManage.current = manage;
  }, [manage]);
  const people = useNeighborPeople(reloadKey);
  const peopleCount = people.kind === "ok" ? people.items.length : null;
  useEffect(() => {
    setNeighborFollowHeaderCount(peopleCount);
  }, [peopleCount]);
  useEffect(() => () => setNeighborFollowHeaderCount(null), []);

  if (people.kind === "loading") {
    return <MyStateView kind="loading" template="list" rows={5} listVariant="thumb" />;
  }
  if (people.kind === "error") {
    return (
      <MyStateView
        kind="error"
        template="list"
        error={{ message: t("mypage_neighbor_load_failed"), onRetry: () => setReloadKey((k) => k + 1) }}
      />
    );
  }
  if (people.items.length === 0) {
    return (
      <MyStateView
        kind="empty"
        template="list"
        empty={{
          title: t("mypage_neighbor_empty_title"),
          body: t("mypage_neighbor_empty_body"),
          cta: (
            <Link href={philifeAppPaths.home} className={`${Sam.btn.primaryCombo} ${Sam.btn.sm}`}>
              {t("mypage_neighbor_empty_cta")}
            </Link>
          ),
        }}
      />
    );
  }

  return manage ? <NeighborManageList items={people.items} /> : <NeighborPostsView items={people.items} />;
}

function CountBar({ count, rightLabel }: { count: number; rightLabel: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between px-1 py-2.5 sam-text-helper text-sam-muted" data-testid="neighbor-follow-count">
      <span>{t("mypage_neighbor_count", { count, limit: NEIGHBOR_FOLLOW_LIMIT })}</span>
      <span>{rightLabel}</span>
    </div>
  );
}

function Avatar({ url, size }: { url: string | null; size: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-full bg-sam-app object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="shrink-0 rounded-full bg-sam-surface-muted" style={{ width: size, height: size }} aria-hidden />
  );
}

function displayName(item: NeighborItem): string {
  return item.nickname?.trim() || (item.username ? `@${item.username}` : "");
}

/** 시안 ② — 사진 줄(전체 + 관심이웃) + 글 목록 최신순 */
function NeighborPostsView({ items }: { items: NeighborItem[] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const reqSeq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(
    async (append: boolean, fromCursor: string | null) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setFailed(false);
      try {
        const url = buildPhilifeNeighborhoodFeedClientUrl({
          globalFeed: true,
          neighborOnly: true,
          neighborExcludeSelf: true,
          neighborTargetId: selected,
          sort: "latest",
          limit: POSTS_PAGE,
          cursor: fromCursor,
        });
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          posts?: NeighborhoodFeedPostDTO[];
          hasMore?: boolean;
          nextCursorToken?: string | null;
        };
        if (seq !== reqSeq.current) return;
        if (!res.ok || !json.ok) {
          setFailed(true);
          if (!append) setPosts([]);
          setHasMore(false);
          return;
        }
        const next = Array.isArray(json.posts) ? json.posts : [];
        setPosts((prev) => {
          if (!append) return next;
          const seen = new Set(prev.map((p) => String(p.id)));
          return [...prev, ...next.filter((p) => !seen.has(String(p.id)))];
        });
        const token = json.nextCursorToken ?? null;
        /** 다음 커서가 없거나 같은 커서면 멈춘다 — 같은 페이지 반복 요청 방지 */
        setHasMore(Boolean(json.hasMore && token && token !== fromCursor));
        setCursor(token);
      } catch {
        if (seq === reqSeq.current) {
          setFailed(true);
          setHasMore(false);
        }
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [selected],
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    void loadPage(false, null);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void loadPage(true, cursor);
        }
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, hasMore, loadPage, loading]);

  return (
    <div className="-mx-4 md:-mx-5" data-testid="neighbor-follow-posts-view">
      <div className="flex gap-3.5 overflow-x-auto border-b border-sam-border-soft bg-sam-surface px-4 py-3.5 md:px-5" role="tablist">
        <StripChip label={t("common_all")} selected={selected === null} onPress={() => setSelected(null)} all />
        {items.map((it) => (
          <StripChip
            key={it.id}
            label={displayName(it)}
            avatarUrl={it.avatarUrl}
            selected={selected === it.targetId}
            onPress={() => setSelected(it.targetId)}
          />
        ))}
      </div>
      <div className="px-4 md:px-5">
        <CountBar count={items.length} rightLabel={t("community_sort_latest")} />
      </div>
      {loading && posts.length === 0 ? (
        <MyStateView kind="loading" template="list" rows={3} listVariant="thumb" />
      ) : failed && posts.length === 0 ? (
        <MyStateView
          kind="error"
          template="list"
          error={{ message: t("mypage_neighbor_load_failed"), onRetry: () => void loadPage(false, null) }}
        />
      ) : posts.length === 0 ? (
        <MyStateView kind="empty" template="list" empty={{ title: t("mypage_neighbor_posts_empty") }} />
      ) : (
        /** 글 카드 = 피드와 같은 부품 — 카드 색·모서리 토큰(`--cm-*`)은 `[data-community-ui]` 범위에만 있다 */
        <ul className="m-0 grid list-none gap-2 p-0 px-4 pb-4 md:px-5" data-community-ui="" data-testid="neighbor-follow-post-list">
          {posts.map((p, i) => (
            <li key={String(p.id)} className="list-none">
              <CommunityCard post={p} priorityThumb={i < 2} />
            </li>
          ))}
        </ul>
      )}
      {hasMore ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
    </div>
  );
}

function StripChip({
  label,
  avatarUrl = null,
  selected,
  onPress,
  all = false,
}: {
  label: string;
  avatarUrl?: string | null;
  selected: boolean;
  onPress: () => void;
  all?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onPress}
      className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 sam-text-xxs text-sam-fg"
    >
      <span
        className={`flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border-2 ${
          selected ? "border-sam-primary" : "border-transparent"
        } ${all ? "bg-sam-primary-soft font-bold text-sam-primary" : "bg-sam-surface-muted"}`}
      >
        {all ? label : avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : null}
      </span>
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}

/** 시안 ③ — 관리: 행 = 사진·닉네임·@ID·지역·추가일 + [관심이웃 ✓]/[관심이웃 추가]. 해제는 즉시 + [되돌리기] */
function NeighborManageList({ items }: { items: NeighborItem[] }) {
  const { t } = useI18n();
  return (
    <div data-testid="neighbor-follow-manage-list">
      <CountBar count={items.length} rightLabel={t("mypage_neighbor_order_added")} />
      <ul className="divide-y divide-sam-border-soft overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
        {items.map((it) => (
          <NeighborManageRow key={it.id} item={it} />
        ))}
      </ul>
    </div>
  );
}

function NeighborManageRow({ item }: { item: NeighborItem }) {
  const name = displayName(item);
  const action = useNeighborFollowToggle({
    targetUserId: item.targetId,
    name,
    /** 목록에 있다 = 관심이웃 중 (모르는 칸만 채움 — 방금 해제한 값은 덮지 않음) */
    seed: { following: true, blocked: false },
    notify: (message, tone, undo) =>
      showMypageToast(message, tone, undo ? { action: { onPress: undo } } : undefined),
  });
  const profileHref = item.username?.trim() ? `/u/${encodeURIComponent(item.username.trim())}` : null;
  const identity = (
    <div className="min-w-0">
      <p className="truncate sam-text-body font-medium text-sam-fg">{name}</p>
      <p className="mt-0.5 truncate sam-text-helper text-sam-muted">
        {[item.username ? `@${item.username}` : null, item.regionName, formatMypageDate(item.createdAt)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
  return (
    <li className="flex min-h-[64px] items-center gap-3 px-4 py-3 md:px-5" data-testid="neighbor-follow-manage-row">
      <Avatar url={item.avatarUrl} size={44} />
      <div className="min-w-0 flex-1">
        {profileHref ? (
          <Link href={profileHref} className="block hover:opacity-80">
            {identity}
          </Link>
        ) : (
          identity
        )}
      </div>
      <NeighborFollowButton following={action.following} busy={action.busy} onPress={() => void action.toggle()} />
    </li>
  );
}
