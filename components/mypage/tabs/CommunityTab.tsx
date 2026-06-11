/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAppDate } from "@/lib/i18n/locale-for-app-language";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";

type CommunityPostPreview = {
  id: string;
  title: string;
  topic_name?: string | null;
  topic_name_en?: string | null;
  topic_slug?: string | null;
  region_label?: string | null;
  created_at?: string | null;
  comment_count?: number;
};

type CommunityCommentItem = {
  id: string;
  postId: string;
  postTitle: string;
  regionLabel?: string | null;
  content: string;
  createdAt: string;
};

type CommunityFavoriteItem = {
  id: string;
  postId: string;
  title: string;
  regionLabel?: string | null;
  createdAt: string;
};

type CommunityReportItem = {
  id: string;
  channel: "community" | "messenger";
  targetType: string;
  targetId: string;
  title: string;
  reasonType: string;
  status: string;
  createdAt: string;
};

export function CommunityTab({ section }: { section: string }) {
  const { t, safeT } = useI18n();
  if (section === "posts") {
    return <MyCommunityPostsPanel />;
  }

  if (section === "comments") {
    return (
      <MyCommunityActivityPanel
        title={safeT("mypage_comp_nav_sec_community_comments_label")}
        description={t("mypage_comp_nav_sec_community_comments_desc")}
        mode="comments"
      />
    );
  }

  if (section === "favorites") {
    return (
      <MyCommunityActivityPanel
        title={safeT("mypage_comp_nav_sec_community_favorites_label")}
        description={t("mypage_comp_nav_sec_community_favorites_desc")}
        mode="favorites"
      />
    );
  }

  if (section === "users") {
    return (
      <SectionShell
        title={safeT("mypage_comp_nav_sec_community_users_label")}
        description={t("mypage_comp_nav_sec_community_users_desc")}
      >
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="favorite" emptyMessage={t("mypage_comp_community_users_empty")} />
        </div>
      </SectionShell>
    );
  }

  if (section === "reports") {
    return (
      <MyCommunityActivityPanel
        title={safeT("mypage_comp_nav_sec_community_reports_label")}
        description={t("mypage_comp_nav_sec_community_reports_desc")}
        mode="reports"
      />
    );
  }

  return <MyCommunityPostsPanel />;
}

function MyCommunityPostsPanel() {
  const { t, language } = useI18n();
  const [items, setItems] = useState<CommunityPostPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await runSingleFlight("me:community-posts:limit=6", () =>
          fetch("/api/me/community-posts?limit=6", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          posts?: CommunityPostPreview[];
        };
        if (!cancelled) {
          setItems(res.ok && json.ok && Array.isArray(json.posts) ? json.posts : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <MyPageSectionHeader description={t("mypage_comp_nav_sec_community_posts_desc")} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
        {loading ? (
          <div className="px-4 py-8 text-center sam-text-helper text-sam-muted">{t("mypage_comp_community_loading")}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center sam-text-helper text-sam-muted">
            {t("mypage_comp_community_posts_empty")}
          </div>
        ) : (
          <div className="divide-y divide-sam-border">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/philife/${encodeURIComponent(item.id)}`}
                className="block px-4 py-3 hover:bg-sam-app"
              >
                <p className="sam-text-body font-semibold text-sam-fg">{item.title}</p>
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {resolveCommunityTopicUILabel(
                    language,
                    item.topic_name ?? "",
                    item.topic_name_en,
                    item.topic_slug ?? undefined
                  ) || t("mypage_comp_community_topic_fallback")}{" "}
                  · {item.region_label || t("mypage_comp_community_region_none")} ·{" "}
                  {t("mypage_comp_community_comments_count", { count: item.comment_count ?? 0 })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
      <MyPageQuickActions
        items={[{ label: t("mypage_comp_community_view_all"), href: "/mypage/community-posts", caption: t("mypage_comp_community_view_all_caption") }]}
      />
    </div>
  );
}

function SectionShell({
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <MyPageSectionHeader description={description} />
      {children}
    </div>
  );
}

function MyCommunityActivityPanel({
  title,
  description,
  mode,
}: {
  title: string;
  description: string;
  mode: "comments" | "favorites" | "reports";
}) {
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<CommunityCommentItem[]>([]);
  const [favoritePosts, setFavoritePosts] = useState<CommunityFavoriteItem[]>([]);
  const [reports, setReports] = useState<CommunityReportItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight("me:community-activity:get", () =>
          fetch("/api/me/community-activity", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          comments?: CommunityCommentItem[];
          favoritePosts?: CommunityFavoriteItem[];
          reports?: CommunityReportItem[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(typeof json.error === "string" ? json.error : t("mypage_comp_community_activity_load_failed"));
          return;
        }
        setComments(Array.isArray(json.comments) ? json.comments : []);
        setFavoritePosts(Array.isArray(json.favoritePosts) ? json.favoritePosts : []);
        setReports(Array.isArray(json.reports) ? json.reports : []);
      } catch {
        if (!cancelled) setError(t("mypage_comp_community_activity_load_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const content =
    mode === "comments" ? (
      <ActivityList
        loading={loading}
        error={error}
        emptyMessage={t("mypage_comp_community_comments_empty")}
        items={comments.map((item) => (
          <Link key={item.id} href={`/philife/${encodeURIComponent(item.postId)}`} className="block px-4 py-3 hover:bg-sam-app">
            <p className="sam-text-body font-medium text-sam-fg">{item.postTitle}</p>
            <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">{item.content}</p>
            <p className="mt-1 sam-text-helper text-sam-meta">
              {[item.regionLabel, formatAppDate(item.createdAt, language)].filter(Boolean).join(" · ")}
            </p>
          </Link>
        ))}
      />
    ) : mode === "favorites" ? (
      <ActivityList
        loading={loading}
        error={error}
        emptyMessage={t("mypage_comp_community_favorites_empty")}
        items={favoritePosts.map((item) => (
          <Link key={item.id} href={`/philife/${encodeURIComponent(item.postId)}`} className="block px-4 py-3 hover:bg-sam-app">
            <p className="sam-text-body font-medium text-sam-fg">{item.title}</p>
            <p className="mt-1 sam-text-helper text-sam-meta">
              {[item.regionLabel, formatAppDate(item.createdAt, language)].filter(Boolean).join(" · ")}
            </p>
          </Link>
        ))}
      />
    ) : (
      <ActivityList
        loading={loading}
        error={error}
        emptyMessage={t("mypage_comp_community_reports_empty")}
        items={reports.map((item) => {
          const href =
            item.channel === "community" && item.targetType === "post" && item.targetId
              ? `/philife/${encodeURIComponent(item.targetId)}`
              : null;
          const body = (
            <>
              <p className="sam-text-body font-medium text-sam-fg">{item.title}</p>
              <p className="mt-1 sam-text-helper text-sam-muted">
                {[
                  item.channel === "community" ? t("mypage_comp_community_channel_community") : t("mypage_comp_community_channel_messenger"),
                  item.reasonType,
                  item.status,
                  formatAppDate(item.createdAt, language),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          );
          return href ? (
            <Link key={item.id} href={href} className="block px-4 py-3 hover:bg-sam-app">
              {body}
            </Link>
          ) : (
            <div key={item.id} className="px-4 py-3">
              {body}
            </div>
          );
        })}
      />
    );

  return (
    <SectionShell title={title} description={description}>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">{content}</div>
    </SectionShell>
  );
}

function ActivityList({
  loading,
  error,
  emptyMessage,
  items,
}: {
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  items: ReactNode[];
}) {
  const { t } = useI18n();
  if (loading) {
    return <div className="px-4 py-8 text-center sam-text-helper text-sam-muted">{t("mypage_comp_community_loading")}</div>;
  }
  if (error) {
    return <div className="px-4 py-8 text-center sam-text-helper text-red-600">{error}</div>;
  }
  if (items.length === 0) {
    return <div className="px-4 py-8 text-center sam-text-helper text-sam-muted">{emptyMessage}</div>;
  }
  return <div className="divide-y divide-sam-border">{items}</div>;
}
