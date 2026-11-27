"use client";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { InboxKey, InboxRow, InboxStatus } from "@/lib/community-operator-import/inbox-store";
import type { JobSummary } from "@/lib/community-operator-import/jobs";
import type { PublishContent } from "@/lib/community-operator-import/publish-content";
import type { ImportRule } from "@/lib/community-operator-import/rules";
import type { ManagedRights, ManagedSource } from "@/lib/community-operator-import/source-store";
import type { ContentPolicy, OperatorDraftEdit, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { translate, type MessageKey } from "@/lib/i18n/messages";

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
  const j = (json || {}) as { ok?: boolean; error?: string; code?: string; detail?: unknown };
  if (!res.ok || j.ok === false) {
    const err = new Error(j.error || `HTTP ${res.status}`) as Error & {
      code?: string;
      detail?: string;
      body?: unknown;
      status?: number;
    };
    err.code = j.code;
    /** 관리자 진단용 서버 원문(관리자 전용 API 만 보낸다) — 화면은 「키 문구 (detail)」 */
    if (typeof j.detail === "string" && j.detail.trim()) err.detail = j.detail.trim();
    err.body = json;
    err.status = res.status;
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
  source: { id: string; displayName: string; contentPolicy: ContentPolicy; baseUrl: string; rights: ManagedRights };
  board: { boardId: string; displayName: string; defaultTopicId: string | null };
  preview: PublishContent;
  /** The community post this article is published as (null = not published). */
  post: { id: string; title: string; status: string; topicSlug: string; updatedAt: string } | null;
  qualityLabels: Record<string, string>;
};

export type { ContentPolicy, ImportRule, InboxKey, InboxRow, InboxStatus, JobSummary, ManagedSource, PublishContent };

export const keyOf = (r: InboxKey) => `${r.sourceSite}|${r.sourceBoard}|${r.sourceArticleKey}`;

export const STATUS_LABEL: Record<string, MessageKey> = {
  new: "admin_community_import_status_new",
  draft: "admin_community_import_status_draft",
  published: "admin_community_import_status_published",
  source_updated: "admin_community_import_status_source_updated",
  failed: "admin_community_import_status_failed",
  hidden: "admin_community_import_status_hidden",
  skipped: "admin_community_import_status_skipped",
};

export const POLICY_LABEL: Record<ContentPolicy, MessageKey> = {
  full: "admin_community_import_policy_full",
  summary_link: "admin_community_import_policy_summary_link",
  link_only: "admin_community_import_policy_link_only",
};

export const VERDICT_TONE: Record<string, string> = {
  FULL: "bg-sam-success-soft text-sam-success border-sam-success",
  VERIFIED: "bg-sam-success-soft text-sam-success border-sam-success",
  PARTIAL: "bg-sam-warning-soft text-sam-warning border-sam-warning",
  NOT_PROVEN: "bg-sam-app text-sam-muted border-sam-border",
  BLOCKED: "bg-sam-danger-soft text-sam-danger border-sam-danger",
  FAILED: "bg-sam-danger-soft text-sam-danger border-sam-danger",
  REJECT: "bg-sam-danger-soft text-sam-danger border-sam-danger",
};

/** 수집 품질 판정 → 한글 배지 */
export const VERDICT_LABEL: Record<string, MessageKey> = {
  FULL: "admin_community_import_verdict_full",
  VERIFIED: "admin_community_import_verdict_verified",
  PARTIAL: "admin_community_import_verdict_partial",
  NOT_PROVEN: "admin_community_import_verdict_not_proven",
  BLOCKED: "admin_community_import_verdict_blocked",
  FAILED: "admin_community_import_verdict_failed",
  REJECT: "admin_community_import_verdict_reject",
};

export function verdictLabel(v: string | null | undefined, t: (key: MessageKey) => string): string {
  const key = VERDICT_LABEL[String(v || "NOT_PROVEN")];
  return key ? t(key) : t("admin_community_import_verdict_unknown");
}

/**
 * 오류 → 운영자 문구. 서버가 보낸 한글 안내는 그대로(판정 코드는 한글로 바꿈),
 * 영문 코드·HTTP 상태는 공통 오류 문구로 바꾼다 (원시 오류 노출 금지).
 */
/** 화면 오류 상태용 (AdminErrorState: code + httpStatus — 403 은 권한 없음으로) */
export function importErrorState(e: unknown): { code: string; status: number } {
  const err = (e ?? {}) as { message?: string; code?: string; status?: number };
  const code = err.code && /^[a-z][a-z0-9_]*$/.test(err.code) ? err.code : "load_failed";
  return { code, status: typeof err.status === "number" ? err.status : 0 };
}

/** 게시 오류 코드 → 문구 키 (`publish-errors.ts`·`draft-apply.ts` 는 코드만 보낸다 — 언어 재감사 2026-11-27) */
const IMPORT_PUBLISH_ERROR_KEYS: Readonly<Record<string, MessageKey>> = {
  published_under_other_key: "community_import_err_published_elsewhere",
  already_published: "community_import_err_already_published",
  not_published: "community_import_err_not_published",
  post_missing: "community_import_err_post_missing",
  empty_content: "community_import_err_empty_content",
  publish_rpc_missing: "community_import_err_rpc_missing",
  publish_failed: "admin_api_import_publish_failed",
  no_selection: "community_import_err_no_selection",
  topic_required: "community_import_err_topic_required",
  quality_failed: "admin_community_import_err_quality_failed",
  quality_partial_needs_confirm: "admin_community_import_err_quality_partial",
  source_not_found: "admin_api_import_source_not_found",
  board_not_found: "admin_community_import_err_board_not_found",
  invalid_topic: "admin_community_import_err_invalid_topic",
  import_principal_missing: "admin_community_import_err_principal_missing",
  section_missing: "admin_community_import_err_section_missing",
  image_ingest_failed: "admin_community_import_err_image_ingest_failed",
  publish_readback_failed: "admin_community_import_err_readback_failed",
  topics_load_failed: "admin_api_import_topics_load_failed",
};

/** 키 문구 뒤에 관리자 진단 원문을 괄호로 붙인다 (관리자 화면 — SSOT §4-4 S9 운영 용어 허용) */
function withImportDetail(text: string, detail: string | undefined): string {
  return detail ? `${text} (${detail})` : text;
}

export function importErrorText(e: unknown): string {
  const err = (e ?? {}) as { message?: string; code?: string; detail?: string };
  const detail = typeof err.detail === "string" && err.detail ? err.detail : undefined;
  const publishKey = typeof err.code === "string" ? IMPORT_PUBLISH_ERROR_KEYS[err.code] : undefined;
  if (publishKey) return withImportDetail(translate("ko", publishKey), detail);
  const msg = String(err.message ?? (typeof e === "string" ? e : ""));
  if (/[가-힣]/.test(msg)) {
    return msg.replace(/\b(FULL|VERIFIED|PARTIAL|NOT_PROVEN|BLOCKED|FAILED|REJECT)\b/g, (m) => (VERDICT_LABEL[m] ? translate("ko", VERDICT_LABEL[m]) : m));
  }
  if (!msg || /^HTTP \d+/.test(msg)) return withImportDetail(adminOperatorErrorMessage("server_error", true), detail);
  const code = err.code && /^[a-z][a-z0-9_]*$/.test(err.code) ? err.code : msg;
  return withImportDetail(adminOperatorErrorMessage(code, true), detail);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 16);
  return formatAdminManilaDateTime(iso);
}
