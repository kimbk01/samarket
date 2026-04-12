/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";

type CommunityPostPreview = {
  id: string;
  title: string;
  topic_name?: string | null;
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

function formatDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleDateString("ko-KR");
}

export function CommunityTab({ section }: { section: string }) {
  if (section === "posts") {
    return <MyCommunityPostsPanel />;
  }

  if (section === "comments") {
    return (
      <MyCommunityActivityPanel
        title="내가 쓴 댓글"
        description="내가 남긴 커뮤니티 댓글을 최근순으로 확인합니다."
        mode="comments"
      />
    );
  }

  if (section === "favorites") {
    return (
      <MyCommunityActivityPanel
        title="찜한 게시물"
        description="관심 표시한 커뮤니티 게시물을 최근순으로 정리합니다."
        mode="favorites"
      />
    );
  }

  if (section === "users") {
    return (
      <SectionShell
        title="커뮤니티 친구 / 관심 사용자"
        description="커뮤니티에서 자주 보는 사용자는 전체 사용자 관리와 같은 단일 데이터 소스를 사용합니다."
      >
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="favorite" emptyMessage="관심 사용자가 없습니다." />
        </div>
      </SectionShell>
    );
  }

  if (section === "reports") {
    return (
      <MyCommunityActivityPanel
        title="신고 내역"
        description="커뮤니티와 메신저 신고 접수 내역을 한곳에서 확인합니다."
        mode="reports"
      />
    );
  }

  return <MyCommunityPostsPanel />;
}

function MyCommunityPostsPanel() {
  const [items, setItems] = useState<CommunityPostPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/me/community-posts?limit=6", {
          credentials: "include",
          cache: "no-store",
        });
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
      <MyPageSectionHeader description="내가 남긴 커뮤니티 글을 최근순으로 확인합니다." />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
        {loading ? (
          <div className="px-4 py-8 text-center text-[12px] text-sam-muted">불러오는 중입니다.</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-sam-muted">
            아직 남긴 커뮤니티 글이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-sam-border">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/philife/${encodeURIComponent(item.id)}`}
                className="block px-4 py-3 hover:bg-sam-app"
              >
                <p className="text-[14px] font-semibold text-sam-fg">{item.title}</p>
                <p className="mt-1 text-[12px] text-sam-muted">
                  {item.topic_name || "커뮤니티"} · {item.region_label || "지역 없음"} · 댓글{" "}
                  {item.comment_count ?? 0}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
      <MyPageQuickActions
        items={[{ label: "내 활동 전체 보기", href: "/mypage/community-posts", caption: "기존 활동 화면 열기" }]}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<CommunityCommentItem[]>([]);
  const [favoritePosts, setFavoritePosts] = useState<CommunityFavoriteItem[]>([]);
  const [reports, setReports] = useState<CommunityReportItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/community-activity", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          comments?: CommunityCommentItem[];
          favoritePosts?: CommunityFavoriteItem[];
          reports?: CommunityReportItem[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(typeof json.error === "string" ? json.error : "활동 내역을 불러오지 못했습니다.");
          return;
        }
        setComments(Array.isArray(json.comments) ? json.comments : []);
        setFavoritePosts(Array.isArray(json.favoritePosts) ? json.favoritePosts : []);
        setReports(Array.isArray(json.reports) ? json.reports : []);
      } catch {
        if (!cancelled) setError("활동 내역을 불러오지 못했습니다.");
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
        emptyMessage="아직 남긴 댓글이 없습니다."
        items={comments.map((item) => (
          <Link key={item.id} href={`/philife/${encodeURIComponent(item.postId)}`} className="block px-4 py-3 hover:bg-sam-app">
            <p className="text-[14px] font-medium text-sam-fg">{item.postTitle}</p>
            <p className="mt-1 line-clamp-2 text-[13px] text-sam-muted">{item.content}</p>
            <p className="mt-1 text-[12px] text-sam-meta">
              {[item.regionLabel, formatDate(item.createdAt)].filter(Boolean).join(" · ")}
            </p>
          </Link>
        ))}
      />
    ) : mode === "favorites" ? (
      <ActivityList
        loading={loading}
        error={error}
        emptyMessage="찜한 커뮤니티 게시물이 없습니다."
        items={favoritePosts.map((item) => (
          <Link key={item.id} href={`/philife/${encodeURIComponent(item.postId)}`} className="block px-4 py-3 hover:bg-sam-app">
            <p className="text-[14px] font-medium text-sam-fg">{item.title}</p>
            <p className="mt-1 text-[12px] text-sam-meta">
              {[item.regionLabel, formatDate(item.createdAt)].filter(Boolean).join(" · ")}
            </p>
          </Link>
        ))}
      />
    ) : (
      <ActivityList
        loading={loading}
        error={error}
        emptyMessage="신고 접수 내역이 없습니다."
        items={reports.map((item) => {
          const href =
            item.channel === "community" && item.targetType === "post" && item.targetId
              ? `/philife/${encodeURIComponent(item.targetId)}`
              : null;
          const body = (
            <>
              <p className="text-[14px] font-medium text-sam-fg">{item.title}</p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {[
                  item.channel === "community" ? "커뮤니티" : "메신저",
                  item.reasonType,
                  item.status,
                  formatDate(item.createdAt),
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
  if (loading) {
    return <div className="px-4 py-8 text-center text-[12px] text-sam-muted">불러오는 중입니다.</div>;
  }
  if (error) {
    return <div className="px-4 py-8 text-center text-[12px] text-red-600">{error}</div>;
  }
  if (items.length === 0) {
    return <div className="px-4 py-8 text-center text-[12px] text-sam-muted">{emptyMessage}</div>;
  }
  return <div className="divide-y divide-sam-border">{items}</div>;
}
