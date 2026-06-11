"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { fetchCommunityMyHubPostsDeduped } from "@/lib/community/fetch-community-my-hub-posts-deduped";
import { philifeAppPaths } from "@domain/philife/paths";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";

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
        setErr(j.error ?? t("community_hub_load_failed"));
        setMine([]);
        return;
      }
      setMine(j.posts ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [userId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("community_hub_neighbor_only")}</h2>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("community_hub_neighbor_hint")}</p>
        <Link
          href={philifeAppPaths.home}
          className="mt-3 inline-block rounded-ui-rect bg-sam-ink px-3 py-2 sam-text-body-secondary font-medium text-white"
        >
          {t("community_hub_open_feed")}
        </Link>
      </section>

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

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("community_hub_meetings")}</h2>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("community_hub_meetings_hint")}</p>
      </section>
    </div>
  );
}
