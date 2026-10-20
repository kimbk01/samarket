"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useEffect, useState } from "react";
import { PostCard } from "@/components/post/PostCard";
import type { PostWithMeta } from "@/lib/posts/schema";
import { useTradeListCompositionMap } from "@/lib/trade/category-form/use-trade-list-composition-map";
import { TRADE_FEED_PRODUCT_GRID_CLASS } from "@/lib/posts/trade-feed-layout-classes";
import { showMypageToast } from "@/lib/mypage/mypage-toast";

type RecentViewItem = PostWithMeta & { viewed_at: string };

type ListState = { kind: "loading" } | { kind: "guest" } | { kind: "error" } | { kind: "ready"; items: RecentViewItem[] };

/** 최근 본 상품 (v2.1 PR-2c · M3) — 거래 상세를 열 때 서버가 기록한 실제 목록. 최대 100개·90일 */
export function RecentViewedList() {
  const { t } = useI18n();
  const { propsForCategoryId } = useTradeListCompositionMap();
  const [state, setState] = useState<ListState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/me/recent-views", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        setState({ kind: "guest" });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: RecentViewItem[] };
      if (!res.ok || !json.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", items: Array.isArray(json.items) ? json.items : [] });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = useCallback(
    async (postId?: string) => {
      const qs = postId ? `?postId=${encodeURIComponent(postId)}` : "";
      try {
        const res = await fetch(`/api/me/recent-views${qs}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error("delete_failed");
        setState((prev) =>
          prev.kind === "ready"
            ? { kind: "ready", items: postId ? prev.items.filter((p) => p.id !== postId) : [] }
            : prev
        );
      } catch {
        showMypageToast(t("ui_recent_delete_failed"), "error");
      }
    },
    [t]
  );

  if (state.kind === "loading") {
    return <p className="py-12 text-center sam-text-body text-sam-meta">{t("common_loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
        <p className="sam-text-body text-sam-muted">{t("ui_recent_load_failed")}</p>
        <button type="button" onClick={() => void load()} className="sam-btn sam-btn--secondary sam-btn--sm mt-4">
          {t("common_retry")}
        </button>
      </div>
    );
  }
  if (state.kind === "guest" || state.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="sam-text-body text-sam-muted">{t("ui_recent_empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => void remove()} className="sam-text-helper text-sam-muted underline">
          {t("ui_recent_clear_all")}
        </button>
      </div>
      <ul className={`m-0 min-w-0 w-full list-none p-0 ${TRADE_FEED_PRODUCT_GRID_CLASS}`}>
        {state.items.map((post) => {
          const composition = propsForCategoryId(post.category_id);
          return (
            <li key={post.id} className="min-w-0">
              <PostCard
                post={post}
                skinKey={composition?.skinKey}
                categorySlug={composition?.categorySlug}
                fieldComposition={composition?.fieldComposition}
                footer={
                  <div className="flex justify-end px-1 pt-1">
                    <button
                      type="button"
                      onClick={() => void remove(post.id)}
                      className="sam-text-helper text-sam-muted"
                    >
                      {t("ui_recent_delete_one")}
                    </button>
                  </div>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
