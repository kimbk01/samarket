"use client";

import type { InboxKey, InboxRow, InboxStatus } from "@/lib/community-operator-import/inbox-store";
import type { JobSummary } from "@/lib/community-operator-import/jobs";
import type { PublishContent } from "@/lib/community-operator-import/publish-content";
import type { ImportRule } from "@/lib/community-operator-import/rules";
import type { ManagedSource } from "@/lib/community-operator-import/source-store";
import type { ContentPolicy, OperatorDraftEdit, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";

export const API = "/api/admin/community/external-import";

export type ApiFail = { ok: false; error: string; code?: string };

export async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method || (init?.body ? "POST" : "GET"),
    credentials: "include",
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  const j = (json || {}) as { ok?: boolean; error?: string; code?: string };
  if (!res.ok || j.ok === false) {
    const err = new Error(j.error || `HTTP ${res.status}`) as Error & { code?: string; body?: unknown };
    err.code = j.code;
    err.body = json;
    throw err;
  }
  return json as T;
}

export type TopicOption = { id: string; slug: string; name: string };

export type DetailPayload = {
  article: OperatorNormalizedArticle;
  edit: OperatorDraftEdit;
  draft: { status: string; publishedPostId: string | null; updatedAt: string } | null;
  inbox: InboxRow | null;
  source: { id: string; displayName: string; contentPolicy: ContentPolicy; baseUrl: string };
  board: { boardId: string; displayName: string; defaultTopicId: string | null };
  preview: PublishContent;
  /** The community post this article is published as (null = not published). */
  post: { id: string; title: string; status: string; topicSlug: string; updatedAt: string } | null;
  qualityLabels: Record<string, string>;
};

export type { ContentPolicy, ImportRule, InboxKey, InboxRow, InboxStatus, JobSummary, ManagedSource, PublishContent };

export const keyOf = (r: InboxKey) => `${r.sourceSite}|${r.sourceBoard}|${r.sourceArticleKey}`;

export const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  draft: "편집중",
  published: "게시됨",
  source_updated: "원문 변경",
  failed: "실패",
  hidden: "숨김",
  skipped: "제외",
};

export const POLICY_LABEL: Record<ContentPolicy, string> = {
  full: "전문 게시 (재게시 권한 있음)",
  summary_link: "요약 + 원문 링크 (기본)",
  link_only: "제목 + 원문 링크",
};

export const VERDICT_TONE: Record<string, string> = {
  FULL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
  NOT_PROVEN: "bg-sam-app text-sam-muted border-sam-border",
  BLOCKED: "bg-rose-50 text-rose-700 border-rose-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  REJECT: "bg-rose-50 text-rose-700 border-rose-200",
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 16);
  return new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Manila", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
