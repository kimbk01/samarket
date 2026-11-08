"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryViewerGatePanel } from "@/components/delivery/viewer-gate/DeliveryViewerGatePanel";
import type { HomePanelKey } from "@/lib/home/home-layout-contract";
import type { MessageKey } from "@/lib/i18n/message-key";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { philifeAppPaths } from "@/lib/philife/paths";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { getPostsForHome } from "@/lib/posts/getPostsForHome";
import type { PostWithMeta } from "@/lib/posts/schema";

type CommunityRow = Pick<NeighborhoodFeedPostDTO, "id" | "title" | "category_label" | "like_count" | "comment_count" | "images">;

async function loadCommunity(sort: "popular" | "latest", limit: number): Promise<CommunityRow[]> {
  const url = buildPhilifeNeighborhoodFeedClientUrl({ globalFeed: true, sort, limit });
  const res = await fetchNeighborhoodFeedShortTtl(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; posts?: NeighborhoodFeedPostDTO[] };
  return (data.posts ?? []).filter((p) => !p.is_notice).slice(0, limit);
}

/** 거래 — 전체 지역 최신 (비회원 기본 = 전체 지역, 거래 비회원 위치 하드락과 같음) */
async function loadTrade(limit: number): Promise<PostWithMeta[]> {
  const r = await getPostsForHome({ locationAll: true, sort: "latest", type: "trade" });
  return r.posts.slice(0, limit);
}

function peso(n: number | null): string {
  if (n == null) return "";
  return `₱${n.toLocaleString("en-US")}`;
}

function SectionHead({ title, onMore, moreLabel }: { title: string; onMore: () => void; moreLabel: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[16px] font-extrabold">{title}</h2>
      <button type="button" onClick={onMore} className="text-[12px] text-sam-muted">
        {moreLabel} ›
      </button>
    </div>
  );
}

/**
 * 홈 주제판 — 탭(추천·동네소식·거래·배달). 열린 판만 불러오고, 당겨서 새로고침(`refreshSeq`) 때 다시 부른다.
 * 새 API 없이 기존 조회만 쓴다: 커뮤니티 전체 피드(globalFeed) · 거래 `getPostsForHome` · 배달은 S-07.
 */
export function HomePanels({
  panels,
  isGuest,
  refreshSeq,
  labels,
}: {
  panels: HomePanelKey[];
  isGuest: boolean;
  refreshSeq: number;
  labels: Record<HomePanelKey, MessageKey>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [active, setActive] = useState<HomePanelKey>(panels[0]!);
  const current = panels.includes(active) ? active : panels[0]!;
  const [popular, setPopular] = useState<CommunityRow[] | null>(null);
  const [latest, setLatest] = useState<CommunityRow[] | null>(null);
  const [trade, setTrade] = useState<PostWithMeta[] | null>(null);

  useEffect(() => {
    let alive = true;
    if (current === "recommended") {
      void loadCommunity("popular", 5).then((x) => alive && setPopular(x)).catch(() => alive && setPopular([]));
      void loadTrade(6).then((x) => alive && setTrade(x)).catch(() => alive && setTrade([]));
    } else if (current === "neighborhood") {
      void loadCommunity("latest", 10).then((x) => alive && setLatest(x)).catch(() => alive && setLatest([]));
    } else if (current === "trade") {
      void loadTrade(10).then((x) => alive && setTrade(x)).catch(() => alive && setTrade([]));
    }
    return () => {
      alive = false;
    };
  }, [current, refreshSeq]);

  const more = t("home_more");
  const empty = <p className="py-6 text-center text-[13px] text-sam-muted">{t("home_empty")}</p>;
  const loading = <p className="py-6 text-center text-[13px] text-sam-muted">{t("home_loading")}</p>;

  const communityRows = (rows: CommunityRow[] | null, ranked: boolean) =>
    rows == null ? loading : rows.length === 0 ? empty : (
      <ul className="divide-y divide-sam-border">
        {rows.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => router.push(philifeAppPaths.post(p.id))} className="flex w-full items-start gap-3 py-2.5 text-left">
              {ranked ? <span className="w-4 shrink-0 text-[15px] font-extrabold text-sam-primary">{i + 1}</span> : null}
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-semibold">{p.title}</b>
                <span className="text-[11.5px] text-sam-muted">
                  {t("home_post_meta", { topic: p.category_label, likes: p.like_count, comments: p.comment_count })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  const tradeCards = (rows: PostWithMeta[] | null, grid: boolean) =>
    rows == null ? loading : rows.length === 0 ? empty : (
      <div className={grid ? "grid grid-cols-2 gap-x-2.5 gap-y-3.5" : "-mr-4 flex gap-2.5 overflow-x-auto pr-4 [scrollbar-width:none]"}>
        {rows.map((p) => {
          const img = p.thumbnail_url || p.images?.[0] || "";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/post/${encodeURIComponent(p.id)}`)}
              className={`flex min-w-0 flex-col gap-1 text-left ${grid ? "" : "w-32 shrink-0"}`}
            >
              <span className="block aspect-square w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 거래 썸네일(외부 저장소)
                  <img src={img} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="truncate text-[13px]">{p.title}</span>
              <b className="text-[14px]">{peso(p.price)}</b>
            </button>
          );
        })}
      </div>
    );

  const deliveryBody = isGuest ? (
    /** 비로그인 배달 = 로그인 안내 (기존 규정 S-07 · Owner 2026-11-09 「기존 규정을 지켜라」) */
    <DeliveryViewerGatePanel gate="login_required" />
  ) : (
    <button
      type="button"
      onClick={() => router.push("/stores")}
      className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border p-3.5 text-left"
    >
      <span>
        <b className="block text-[14px]">{t("home_delivery_cta_title")}</b>
        <span className="text-[12px] text-sam-muted">{t("home_delivery_cta_body")}</span>
      </span>
      <span className="text-sam-muted">›</span>
    </button>
  );

  return (
    <div className="mt-3" data-home-panels>
      <div role="tablist" className="sticky top-0 z-[4] flex gap-0.5 overflow-x-auto border-b border-sam-border bg-white px-2.5 [scrollbar-width:none]">
        {panels.map((k) => {
          const on = k === current;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(k)}
              className={`shrink-0 whitespace-nowrap border-b-[2.5px] px-2.5 pb-2.5 pt-3 text-[15px] font-bold ${
                on ? "border-sam-primary text-sam-primary" : "border-transparent text-sam-muted"
              }`}
            >
              {t(labels[k])}
            </button>
          );
        })}
      </div>

      {current === "recommended" ? (
        <>
          <section className="bg-white px-4 py-3.5">
            <SectionHead title={t("home_popular_now")} moreLabel={more} onMore={() => router.push("/philife")} />
            {communityRows(popular, true)}
          </section>
          <section className="mt-2 bg-white px-4 py-3.5">
            <SectionHead title={t("home_trade_new")} moreLabel={more} onMore={() => router.push("/market")} />
            {tradeCards(trade, false)}
          </section>
          <section className="mt-2 bg-white px-4 py-3.5">
            <SectionHead title={t("home_delivery_title")} moreLabel={more} onMore={() => router.push("/stores")} />
            {deliveryBody}
          </section>
        </>
      ) : null}
      {current === "neighborhood" ? (
        <section className="bg-white px-4 py-3.5">
          {communityRows(latest, false)}
          <button type="button" onClick={() => router.push("/philife")} className="mt-3 w-full rounded-ui-rect border border-sam-border py-2.5 text-[13px] font-semibold text-sam-muted">
            {t("home_more_in_community")}
          </button>
        </section>
      ) : null}
      {current === "trade" ? (
        <section className="bg-white px-4 py-3.5">
          {tradeCards(trade, true)}
          <button type="button" onClick={() => router.push("/market")} className="mt-3 w-full rounded-ui-rect border border-sam-border py-2.5 text-[13px] font-semibold text-sam-muted">
            {t("home_more_in_trade")}
          </button>
        </section>
      ) : null}
      {current === "delivery" ? <section className="bg-white px-4 py-3.5">{deliveryBody}</section> : null}
    </div>
  );
}
