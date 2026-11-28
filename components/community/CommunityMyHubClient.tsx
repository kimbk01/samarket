"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { fetchCommunityMyHubPostsDeduped } from "@/lib/community/fetch-community-my-hub-posts-deduped";
import { philifeAppPaths } from "@domain/philife/paths";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";
import { resolveApiErrorText } from "@/lib/i18n/api-error-text";
import { COMMUNITY_FEED_ERROR_KEYS } from "@/lib/community/community-api-error-text";

export function CommunityMyHubClient({ userId }: { userId: string }) {
  const { t, language } = useI18n();
  const [mine, setMine] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr((prev) => (prev === "" ? prev : ""));
    try {
      const result = await fetchCommunityMyHubPostsDeduped(userId);
      const j = result.json as { ok?: boolean; posts?: NeighborhoodFeedPostDTO[]; error?: string };
      if (result.status < 200 || result.status >= 300 || !j.ok) {
        setErr(
          resolveApiErrorText({
            json: j,
            status: result.status,
            map: COMMUNITY_FEED_ERROR_KEYS,
            fallbackKey: "community_hub_load_failed",
            t,
          })
        );
        setMine([]);
        return;
      }
      setMine(j.posts ?? []);
    } catch {
      setErr(t("community_hub_load_failed"));
    }
  }, [userId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4 space-y-4">
      {/* 「관심이웃 글만 보기」 안내 카드 삭제 — 운영에서 피드 필터가 꺼져 있어 없는 기능을 안내했다 (관심이웃 감사 E10) */}
      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("community_hub_my_posts")}</h2>
        {err ? <p className="mt-2 sam-text-body-secondary text-red-600">{err}</p> : null}
        <ul className="mt-3 divide-y divide-sam-border-soft">
          {mine.length === 0 && !err ? (
            <li className="py-3 sam-text-body text-sam-muted">{t("community_hub_no_posts")}</li>
          ) : (
            mine.map((p) => (
              <li key={p.id} className="py-3">
                <Link href={philifeAppPaths.post(p.id)} className="sam-text-body font-medium text-sky-800">
                  {p.title}
                </Link>
                <p className="sam-text-helper text-sam-muted">
                  {resolveCommunityTopicUILabel(
                    language,
                    p.category_label,
                    p.category_name_en,
                    p.category
                  )}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
