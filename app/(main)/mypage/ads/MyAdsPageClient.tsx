"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MyPostAdList } from "@/components/ads/MyPostAdList";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { AdminPostAdRow, MePostAdsMeta } from "@/lib/ads/types";

export default function MyAdsPageClient() {
  const { t } = useI18n();
  const [ads, setAds] = useState<AdminPostAdRow[]>([]);
  const [meta, setMeta] = useState<MePostAdsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAuthHint(null);
    try {
      const res = await runSingleFlight("me:post-ads:get", () =>
        fetch("/api/me/post-ads", { credentials: "include", cache: "no-store" })
      );
      const j = (await res.json()) as {
        ok?: boolean;
        ads?: AdminPostAdRow[];
        meta?: MePostAdsMeta;
      };
      if (res.status === 401) {
        setAuthHint(t("ads_auth_hint"));
        setAds([]);
        setMeta(null);
        return;
      }
      if (j.ok && Array.isArray(j.ads)) {
        setAds(j.ads);
        setMeta(j.meta ?? null);
      } else {
        setAds([]);
        setMeta(null);
      }
    } catch {
      setAds([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_ads_title")}
        subtitle={t("mypage_ads_subtitle")}
        backHref="/mypage"
        section="store"
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        {authHint ? (
          <p className="mb-4 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}

        <div className="mb-4 space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-helper text-sam-muted">
          <p className="font-semibold text-sam-fg">{t("ads_what_shows_title")}</p>
          <ul className="list-inside list-disc space-y-1 sam-text-xxs leading-relaxed">
            <li>{t("ads_post_ads_list_item")}</li>
            <li>
              <Link href="/admin/post-ads" className="text-signature underline">
                {t("ads_admin_manage_link")}
              </Link>
              {" — "}
              {t("ads_admin_list_item")}
            </li>
            <li>{t("ads_banner_beta_list_item")}</li>
          </ul>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/philife"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-center sam-text-body font-medium text-sam-fg"
          >
            {t("ads_write_in_community")}
          </Link>
          <Link
            href="/mypage/ads/apply"
            className="rounded-ui-rect bg-sam-surface-muted px-4 py-2 text-center sam-text-body font-medium text-sam-fg"
          >
            {t("ads_home_banner_beta")}
          </Link>
        </div>

        {loading ? (
          <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <MyPostAdList ads={ads} metaSource={meta?.source} onRefresh={() => void load()} />
        )}
      </div>
    </div>
  );
}
