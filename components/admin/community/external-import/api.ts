"use client";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { InboxKey, InboxRow, InboxStatus } from "@/lib/community-operator-import/inbox-store";
import type { JobSummary } from "@/lib/community-operator-import/jobs";
import type { PublishContent } from "@/lib/community-operator-import/publish-content";
import type { ImportRule } from "@/lib/community-operator-import/rules";
import type { ManagedRights, ManagedSource } from "@/lib/community-operator-import/source-store";
import type { ContentPolicy, OperatorDraftEdit, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

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
    const err = new Error(j.error || `HTTP ${res.status}`) as Error & { code?: string; body?: unknown; status?: number };
    err.code = j.code;
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

export const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  draft: "편집중",
  published: "게시됨",
  source_updated: "원문 변경",
  failed: "실패",
  hidden: "숨김",
  skipped: "제외",
};

/** 수집함 처리 상태 → 한글 (모르는 값은 「확인 필요」 — 원시 값 노출 금지) */
export function inboxStatusLabel(v: string | null | undefined): string {
  return STATUS_LABEL[String(v ?? "")] ?? "확인 필요";
}

/** 일괄 작업 종류 (lib/community-operator-import/jobs.ts JOB_KINDS) */
export const JOB_KIND_LABEL: Record<string, string> = {
  publish: "일괄 게시",
  update: "일괄 업데이트",
  hide: "게시물 숨김",
  unhide: "숨김 해제",
  reprocess: "본문 재수집",
};

/** 일괄 작업 상태 (community_import_jobs.status) */
export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  running: "진행 중",
  done: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

export function jobKindLabel(v: string | null | undefined): string {
  return JOB_KIND_LABEL[String(v ?? "")] ?? "일괄 작업";
}

export function jobStatusLabel(v: string | null | undefined): string {
  return JOB_STATUS_LABEL[String(v ?? "")] ?? "확인 필요";
}

/** robots.txt 확인 결과 (lib/community-operator-import/robots.ts · detect.ts · scheduler) */
export const ROBOTS_STATUS_LABEL: Record<string, string> = {
  found: "확인됨",
  missing: "없음 (제한 없음)",
  error: "확인 실패",
  unknown: "미확인",
};

export function robotsStatusLabel(v: string | null | undefined): string {
  if (!v) return "미확인";
  return ROBOTS_STATUS_LABEL[v] ?? "확인 필요";
}

/** call() 오류 → 화면 오류 상태(AdminErrorState) 입력 */
export function importErrorState(e: unknown): { code: string; status?: number } {
  const err = (e ?? {}) as { message?: string; code?: string; status?: number };
  const msg = String(err.message ?? "");
  const code = err.code || (/[가-힣]/.test(msg) ? importErrorText(e) : msg && !/^HTTP \d+/.test(msg) ? msg : "load_failed");
  return { code, status: typeof err.status === "number" ? err.status : undefined };
}

export const POLICY_LABEL: Record<ContentPolicy, string> = {
  full: "전문 게시 (재게시 권한 확인된 출처만)",
  summary_link: "요약 + 원문 링크 (기본)",
  link_only: "제목 + 원문 링크",
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
export const VERDICT_LABEL: Record<string, string> = {
  FULL: "전체 수집",
  VERIFIED: "확인됨",
  PARTIAL: "일부 수집",
  NOT_PROVEN: "미검증",
  BLOCKED: "수집 차단",
  FAILED: "수집 실패",
  REJECT: "제외",
};

export function verdictLabel(v: string | null | undefined): string {
  return VERDICT_LABEL[String(v || "NOT_PROVEN")] ?? "확인 필요";
}

/**
 * 오류 → 운영자 문구. 서버가 보낸 한글 안내는 그대로(판정 코드는 한글로 바꿈),
 * 영문 코드·HTTP 상태는 공통 오류 문구로 바꾼다 (원시 오류 노출 금지).
 */
export function importErrorText(e: unknown): string {
  const err = (e ?? {}) as { message?: string; code?: string };
  const msg = String(err.message ?? (typeof e === "string" ? e : ""));
  if (/[가-힣]/.test(msg)) {
    return msg.replace(/\b(FULL|VERIFIED|PARTIAL|NOT_PROVEN|BLOCKED|FAILED|REJECT)\b/g, (m) => VERDICT_LABEL[m] ?? m);
  }
  if (!msg || /^HTTP \d+/.test(msg)) return "서버에서 처리하지 못했습니다. 잠시 후 다시 처리해 주세요.";
  const code = err.code && /^[a-z][a-z0-9_]*$/.test(err.code) ? err.code : msg;
  const out = adminOperatorErrorMessage(code, true);
  return out === code ? "처리를 완료하지 못했습니다. 잠시 후 다시 처리해 주세요." : out;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 16);
  return formatAdminManilaDateTime(iso);
}
