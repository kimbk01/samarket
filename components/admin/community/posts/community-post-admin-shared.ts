"use client";

/**
 * 커뮤니티 게시글·공지 Admin 화면 공용 (설계 §C-0 · §C 5·6·23).
 * 클라이언트 전용 — 서버 모듈 import 금지.
 */
import { useCallback, useEffect, useState } from "react";
import type { CommunitySheetResult } from "@/components/admin/community/kit/CommunityAdminKit";

export const COMMUNITY_POSTS_LIST_PATH = "/admin/community/posts";
export const COMMUNITY_NOTICES_PATH = "/admin/community/notices";
export const COMMUNITY_PAGE_SIZE = 50;

export const COMMUNITY_STALE_MESSAGE = "다른 관리자가 먼저 변경했습니다 — 최신 내용으로 다시 불러왔습니다";
export const COMMUNITY_GONE_MESSAGE = "대상을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.";
export const COMMUNITY_PIN_LIMIT_MESSAGE = "고정 한도(피드 3개·카테고리 2개)를 넘었습니다";

export type CommunityBanner = { ok: true; message: string } | { ok: false; code: string } | null;

/** 게시글·공지 API 오류 코드 → 운영자 문구. 모르는 코드는 일반 실패 문구 (원시 코드 노출 금지). */
const POST_ERROR_KO: Record<string, string> = {
  conflict: COMMUNITY_STALE_MESSAGE,
  not_found: COMMUNITY_GONE_MESSAGE,
  reason_required: "사유를 2자 이상 입력해 주세요.",
  expected_updated_at_required: "화면 정보가 오래되었습니다. 새로고침 후 다시 처리하세요.",
  expected_status_required: "화면 정보가 오래되었습니다. 새로고침 후 다시 처리하세요.",
  promotion_fault_required: "노출 중인 홍보가 연결된 글입니다. 상세 화면에서 귀책을 선택해 처리하세요.",
  content_blocks_imported_only: "블록 편집은 외부 수집 글에서만 할 수 있습니다.",
  invalid_content_blocks: "본문 블록 형식이 올바르지 않습니다. 비어 있는 블록이 없는지 확인하세요.",
  title_required: "제목을 입력해 주세요.",
  content_required: "본문을 입력해 주세요.",
  invalid_topic: "선택한 카테고리를 쓸 수 없습니다. 다른 카테고리를 고르세요.",
  topic_incomplete: "카테고리를 다시 선택해 주세요.",
  topic_required: "카테고리를 선택해 주세요.",
  meetup_topic_forbidden: "모임 카테고리에는 공지를 올릴 수 없습니다.",
  no_updates: "바뀐 내용이 없습니다.",
  pin_limit: COMMUNITY_PIN_LIMIT_MESSAGE,
  not_active: "공개 상태인 글만 고정할 수 있습니다.",
  no_topic: "카테고리가 없는 글은 카테고리 고정을 할 수 없습니다.",
  invalid_until: "고정 종료 시각이 올바르지 않습니다.",
  invalid_scope: "고정 범위를 선택해 주세요.",
  invalid_starts_at: "노출 시작 시각이 올바르지 않습니다.",
  invalid_ends_at: "노출 종료 시각이 올바르지 않습니다.",
  invalid_notice_window: "노출 종료는 시작보다 뒤여야 합니다.",
  not_notice: "공지 글이 아닙니다.",
  invalid_period: "기간을 다시 선택해 주세요.",
  invalid_date: "날짜 형식이 올바르지 않습니다.",
  range_reversed: "시작 날짜가 끝 날짜보다 늦습니다.",
  range_too_long: "기간은 최대 400일까지 조회할 수 있습니다.",
  network_error: "네트워크 오류가 발생했습니다. 잠시 후 새로고침해 주세요.",
  forbidden: "이 작업을 할 권한이 없습니다.",
  super_admin_only: "최고 관리자만 할 수 있는 작업입니다.",
};

export function communityPostErrorText(code: string | null | undefined): string {
  const k = String(code ?? "").trim();
  return POST_ERROR_KO[k] ?? "처리를 완료하지 못했습니다. 잠시 후 다시 처리해 주세요.";
}

/** 결과 배너용 실패 — AdminResultBanner 는 한글 문장을 그대로 보여 준다 */
export function communityFailBanner(code: string | null | undefined): CommunityBanner {
  return { ok: false, code: communityPostErrorText(code) };
}

/** 영구 삭제가 막힌 이유 (bulk-delete blocked[].reason) */
export const COMMUNITY_HARD_DELETE_BLOCK_KO: Record<string, string> = {
  not_found: "글이 없음",
  not_deleted: "삭제 상태가 아님",
  too_recent: "삭제 후 30일이 지나지 않음",
  open_reports: "처리 안 된 신고 있음",
  running_promotion: "노출 중·중지 홍보 있음",
  has_meeting: "연결된 모임 있음",
  audit_failed: "기록 저장 실패로 보류",
  delete_failed: "삭제 실패",
};

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
export function toCommunitySheetResult(r: CommunityJsonResult<unknown>): CommunitySheetResult {
  if (r.ok) return { ok: true };
  if (r.status === 403 || r.status === 404) return { ok: false, status: r.status, code: r.code };
  if (r.code === "conflict") return { ok: false, status: 409, code: r.code };
  return { ok: false, status: 400, code: communityPostErrorText(r.code) };
}

/* ───────── 카테고리 (토픽) ───────── */

export type CommunityTopicOption = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  allow_meetup: boolean;
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
              allow_meetup: t.allow_meetup === true,
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
