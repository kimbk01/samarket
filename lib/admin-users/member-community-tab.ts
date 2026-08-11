/**
 * Member Control Center — Community tab.
 * Authority: community_posts / community_comments / community_reports / feed_ad_requests.
 * DO NOT: shadow tables, client full-scan, hardcoded counts, point writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asCount,
  asLatest,
  loadTitlesById,
  maxIso,
  previewText,
  type OverviewMetric,
} from "@/lib/admin-users/member-tab-query";

export type MemberCommunitySection = "posts" | "comments" | "reports" | "ads";

export type MemberCommunitySummary = {
  posts: OverviewMetric<number>;
  comments: OverviewMetric<number>;
  reportsFiled: OverviewMetric<number>;
  reportedPosts: OverviewMetric<number>;
  ads: OverviewMetric<number>;
  lastActivityAt: OverviewMetric<string | null>;
};

export type MemberCommunityPostRow = {
  id: string;
  title: string;
  preview: string;
  status: string;
  topicSlug: string;
  category: string;
  isReported: boolean;
  reportCount: number | null;
  createdAt: string;
  updatedAt: string | null;
};

export type MemberCommunityCommentRow = {
  id: string;
  preview: string;
  postId: string;
  postTitle: string;
  status: string;
  createdAt: string;
};

export type MemberCommunityReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  reasonType: string;
  status: string;
  createdAt: string;
};

export type MemberCommunityAdRow = {
  id: string;
  status: string;
  domain: string;
  placement: string;
  productId: string;
  campaignId: string | null;
  createdAt: string;
};

export type MemberCommunityTabPayload = {
  summary: MemberCommunitySummary;
  section: MemberCommunitySection;
  page: number;
  pageSize: number;
  total: OverviewMetric<number>;
  posts: MemberCommunityPostRow[];
  comments: MemberCommunityCommentRow[];
  reports: MemberCommunityReportRow[];
  ads: MemberCommunityAdRow[];
};

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

async function countReportsFiled(sb: SupabaseClient, uid: string): Promise<OverviewMetric<number>> {
  const byReporter = await asCount(
    sb.from("community_reports").select("id", { count: "exact", head: true }).eq("reporter_id", uid),
  );
  if (byReporter.ok || !/reporter_id/i.test(byReporter.error)) return byReporter;
  return asCount(sb.from("community_reports").select("id", { count: "exact", head: true }).eq("user_id", uid));
}

async function latestReportAt(sb: SupabaseClient, uid: string): Promise<OverviewMetric<string | null>> {
  const byReporter = await asLatest(
    sb
      .from("community_reports")
      .select("created_at")
      .eq("reporter_id", uid)
      .order("created_at", { ascending: false })
      .limit(1),
    "created_at",
  );
  if (byReporter.ok || !/reporter_id/i.test(byReporter.error ?? "")) return byReporter;
  return asLatest(
    sb.from("community_reports").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    "created_at",
  );
}

async function loadSummary(sb: SupabaseClient, uid: string): Promise<MemberCommunitySummary> {
  const [posts, comments, reportsFiled, reportedPosts, ads, lastPostAt, lastCommentAt, lastReportAt, lastAdAt] =
    await Promise.all([
      asCount(sb.from("community_posts").select("id", { count: "exact", head: true }).eq("user_id", uid)),
      asCount(sb.from("community_comments").select("id", { count: "exact", head: true }).eq("user_id", uid)),
      countReportsFiled(sb, uid),
      asCount(
        sb
          .from("community_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("is_reported", true),
      ),
      asCount(sb.from("feed_ad_requests").select("id", { count: "exact", head: true }).eq("user_id", uid)),
      asLatest(
        sb.from("community_posts").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
        "created_at",
      ),
      asLatest(
        sb
          .from("community_comments")
          .select("created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1),
        "created_at",
      ),
      latestReportAt(sb, uid),
      asLatest(
        sb.from("feed_ad_requests").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
        "created_at",
      ),
    ]);

  const stamps = [lastPostAt, lastCommentAt, lastReportAt, lastAdAt];
  const failed = stamps.find((m) => !m.ok);
  const lastActivityAt: OverviewMetric<string | null> = failed
    ? failed
    : { ok: true, value: maxIso(...stamps.map((m) => (m.ok ? m.value : null))) };

  return { posts, comments, reportsFiled, reportedPosts, ads, lastActivityAt };
}

export async function loadMemberCommunityTab(
  sb: SupabaseClient,
  userId: string,
  opts: { section: MemberCommunitySection; page: number; pageSize: number; from: number; to: number },
): Promise<MemberCommunityTabPayload> {
  const uid = userId.trim();
  const summary = await loadSummary(sb, uid);
  const empty: MemberCommunityTabPayload = {
    summary,
    section: opts.section,
    page: opts.page,
    pageSize: opts.pageSize,
    total: { ok: true, value: 0 },
    posts: [],
    comments: [],
    reports: [],
    ads: [],
  };

  if (opts.section === "posts") {
    const total = summary.posts;
    const { data, error } = await sb
      .from("community_posts")
      .select("id, title, summary, status, topic_slug, category, is_reported, report_count, created_at, updated_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(opts.from, opts.to);
    if (error) return { ...empty, total: { ok: false, error: error.message } };
    return {
      ...empty,
      total,
      posts: (data ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          id: str(row, "id"),
          title: str(row, "title"),
          preview: previewText(str(row, "summary") || str(row, "title")),
          status: str(row, "status"),
          topicSlug: str(row, "topic_slug"),
          category: str(row, "category"),
          isReported: row.is_reported === true,
          reportCount: row.report_count == null ? null : Number(row.report_count),
          createdAt: str(row, "created_at"),
          updatedAt: str(row, "updated_at") || null,
        };
      }),
    };
  }

  if (opts.section === "comments") {
    const total = summary.comments;
    const { data, error } = await sb
      .from("community_comments")
      .select("id, post_id, content, status, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(opts.from, opts.to);
    if (error) return { ...empty, total: { ok: false, error: error.message } };
    const rows = (data ?? []) as Record<string, unknown>[];
    const titles = await loadTitlesById(
      sb,
      "community_posts",
      rows.map((row) => str(row, "post_id")),
    );
    return {
      ...empty,
      total,
      comments: rows.map((row) => {
        const postId = str(row, "post_id");
        return {
          id: str(row, "id"),
          preview: previewText(str(row, "content")),
          postId,
          postTitle: titles.get(postId) ?? "",
          status: str(row, "status"),
          createdAt: str(row, "created_at"),
        };
      }),
    };
  }

  if (opts.section === "reports") {
    const total = summary.reportsFiled;
    const documented = await sb
      .from("community_reports")
      .select("id, target_type, target_id, reason_type, status, created_at")
      .eq("reporter_id", uid)
      .order("created_at", { ascending: false })
      .range(opts.from, opts.to);
    const live =
      documented.error && /reporter_id|reason_type/i.test(documented.error.message)
        ? await sb
            .from("community_reports")
            .select("id, target_type, target_id, reason, status, created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .range(opts.from, opts.to)
        : documented;
    const { data, error } = live;
    if (error) return { ...empty, total: { ok: false, error: error.message } };
    return {
      ...empty,
      total,
      reports: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: str(row, "id"),
        targetType: str(row, "target_type"),
        targetId: str(row, "target_id"),
        reasonType: str(row, "reason_type") || str(row, "reason"),
        status: str(row, "status"),
        createdAt: str(row, "created_at"),
      })),
    };
  }

  const total = summary.ads;
  const { data, error } = await sb
    .from("feed_ad_requests")
    .select("id, status, domain, placement, product_id, campaign_id, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .range(opts.from, opts.to);
  if (error) return { ...empty, total: { ok: false, error: error.message } };
  return {
    ...empty,
    total,
    ads: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: str(row, "id"),
      status: str(row, "status"),
      domain: str(row, "domain"),
      placement: str(row, "placement"),
      productId: str(row, "product_id"),
      campaignId: str(row, "campaign_id") || null,
      createdAt: str(row, "created_at"),
    })),
  };
}
