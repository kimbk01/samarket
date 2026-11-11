"use client";

/**
 * 커뮤니티 게시글·공지 Admin 화면 공용 (설계 §C-0 · §C 5·6·23).
 * 클라이언트 전용 — 서버 모듈 import 금지.
 */
import { useCallback, useEffect, useState } from "react";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import type { CommunitySheetResult } from "@/components/admin/community/kit/CommunityAdminKit";

export const COMMUNITY_POSTS_LIST_PATH = "/admin/community/posts";
export const COMMUNITY_NOTICES_PATH = "/admin/community/notices";
export const COMMUNITY_PAGE_SIZE = 50;

/** 한국어 문장(기존 호출부 호환). 언어별 문구는 `communityPostErrorText(code, lang)` 를 쓴다. */
export const COMMUNITY_STALE_MESSAGE = translate("ko", "admin_community_post_stale");
export const COMMUNITY_GONE_MESSAGE = translate("ko", "admin_community_post_gone");
export const COMMUNITY_PIN_LIMIT_MESSAGE = translate("ko", "admin_community_post_pin_limit");

export type CommunityBanner = { ok: true; message: string } | { ok: false; code: string } | null;

/** 게시글·공지 API 오류 코드 → 운영자 문구. 모르는 코드는 일반 실패 문구 (원시 코드 노출 금지). */
const POST_ERROR_KEY: Record<string, MessageKey> = {
  conflict: "admin_community_post_stale",
  not_found: "admin_community_post_gone",
  reason_required: "admin_community_post_err_reason_required",
  expected_updated_at_required: "admin_community_post_err_stale_screen",
  expected_status_required: "admin_community_post_err_stale_screen",
  promotion_fault_required: "admin_community_post_err_promotion_fault_required",
  promotion_end_failed: "admin_community_post_err_promotion_end_failed",
  content_blocks_imported_only: "admin_community_post_err_blocks_imported_only",
  invalid_content_blocks: "admin_community_post_err_invalid_blocks",
  title_required: "admin_community_post_err_title_required",
  content_required: "admin_community_post_err_content_required",
  invalid_topic: "admin_community_post_err_invalid_topic",
  topic_incomplete: "admin_community_post_err_topic_incomplete",
  topic_required: "admin_community_post_err_topic_required",
  no_updates: "admin_community_post_err_no_updates",
  pin_limit: "admin_community_post_pin_limit",
  not_active: "admin_community_post_err_not_active",
  no_topic: "admin_community_post_err_no_topic",
  invalid_until: "admin_community_post_err_invalid_until",
  invalid_scope: "admin_community_post_err_invalid_scope",
  invalid_starts_at: "admin_community_post_err_invalid_starts_at",
  invalid_ends_at: "admin_community_post_err_invalid_ends_at",
  invalid_notice_window: "admin_community_post_err_invalid_window",
  not_notice: "admin_community_post_err_not_notice",
  invalid_period: "admin_community_post_err_invalid_period",
  invalid_date: "admin_community_post_err_invalid_date",
  range_reversed: "admin_community_post_err_range_reversed",
  range_too_long: "admin_community_post_err_range_too_long",
  forbidden: "admin_community_post_err_forbidden",
  super_admin_only: "admin_community_post_err_super_admin_only",
};

/** `lang` 생략 시 한국어(기존 호출부 동작 유지). */
export function communityPostErrorText(code: string | null | undefined, lang: string = "ko"): string {
  const k = String(code ?? "").trim();
  const key = POST_ERROR_KEY[k];
  if (key) return translateBy(lang, key);
  // 화면 전용 문구가 없는 코드는 공용 오류 맵 (네트워크·HTTP·모르는 코드 원문 차단).
  return adminOperatorErrorMessage(k, lang !== "en");
}

/** 결과 배너용 실패 — AdminResultBanner 는 문장을 그대로 보여 준다 */
export function communityFailBanner(code: string | null | undefined, lang: string = "ko"): CommunityBanner {
  return { ok: false, code: communityPostErrorText(code, lang) };
}

/** 영구 삭제가 막힌 이유 (bulk-delete blocked[].reason) */
export const COMMUNITY_HARD_DELETE_BLOCK_KEY: Record<string, MessageKey> = {
  not_found: "admin_community_post_hard_delete_not_found",
  not_deleted: "admin_community_post_hard_delete_not_deleted",
  too_recent: "admin_community_post_hard_delete_too_recent",
  open_reports: "admin_community_post_hard_delete_open_reports",
  running_promotion: "admin_community_post_hard_delete_running_promotion",
  audit_failed: "admin_community_post_hard_delete_audit_failed",
  delete_failed: "admin_community_post_hard_delete_failed",
};
/** 한국어 표(기존 호출부 호환). 언어별 문구는 `COMMUNITY_HARD_DELETE_BLOCK_KEY` 를 `t()` 로 그린다. */
export const COMMUNITY_HARD_DELETE_BLOCK_KO: Record<string, string> = Object.fromEntries(
  Object.entries(COMMUNITY_HARD_DELETE_BLOCK_KEY).map(([k, key]) => [k, translate("ko", key)])
);

export type CommunityJsonResult<T> =
  | { ok: true; status: number; json: T }
  | { ok: false; status: number; code: string; json: Record<string, unknown> };

export async function communityJsonFetch<T = Record<string, unknown>>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<CommunityJsonResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      credentials: "include",
      cache: "no-store",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok !== false) return { ok: true, status: res.status, json: json as T };
    return { ok: false, status: res.status, code: String(json.error ?? `http_${res.status}`), json };
  } catch {
    return { ok: false, status: 0, code: "network_error", json: {} };
  }
}

/**
 * 조치 시트용 결과. 409 `conflict` 만 「다른 관리자가 먼저」(stale) 로 넘기고,
 * 고정 한도·상태 조건 같은 409 는 입력 오류(400)로 바꿔 시트 안에 한글 사유를 보여 준다.
 */
export function toCommunitySheetResult(r: CommunityJsonResult<unknown>, lang: string = "ko"): CommunitySheetResult {
  if (r.ok) return { ok: true };
  if (r.status === 403 || r.status === 404) return { ok: false, status: r.status, code: r.code };
  if (r.code === "conflict") return { ok: false, status: 409, code: r.code };
  return { ok: false, status: 400, code: communityPostErrorText(r.code, lang) };
}

/* ───────── 카테고리 (토픽) ───────── */

export type CommunityTopicOption = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
};

/** 글 카테고리 선택지 — 정렬용 시드(is_feed_sort)는 뺀다 */
export function useCommunityTopicOptions(): { topics: CommunityTopicOption[]; loaded: boolean } {
  const [topics, setTopics] = useState<CommunityTopicOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancel = false;
    void (async () => {
      const r = await communityJsonFetch<{ topics?: Array<Record<string, unknown>> }>("/api/admin/community/topics");
      if (cancel) return;
      if (r.ok && Array.isArray(r.json.topics)) {
        setTopics(
          r.json.topics
            .filter((t) => t.is_feed_sort !== true && typeof t.slug === "string" && typeof t.id === "string")
            .map((t) => ({
              id: String(t.id),
              slug: String(t.slug),
              name: String(t.name ?? t.slug),
              is_active: t.is_active !== false,
            }))
        );
      }
      setLoaded(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);
  return { topics, loaded };
}

export function useTopicNameOf(topics: CommunityTopicOption[]) {
  return useCallback(
    (slug: string | null | undefined) => {
      const s = String(slug ?? "").trim();
      if (!s) return "—";
      return topics.find((t) => t.slug === s)?.name ?? s;
    },
    [topics]
  );
}

/* ───────── 필리핀 시간 입력 ↔ UTC ───────── */

const MANILA_OFFSET_MS = 8 * 3_600_000;

/** `<input type="datetime-local">` 값(필리핀 시간) → UTC ISO. 빈 값·형식 오류는 null. */
export function manilaLocalInputToUtcIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - MANILA_OFFSET_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** UTC ISO → `<input type="datetime-local">` 값(필리핀 시간) */
export function utcIsoToManilaLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}
