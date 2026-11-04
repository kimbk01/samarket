import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getCommunityBannedWordsCached } from "@/lib/community-feed/community-ops-settings";
import { matchBannedWords, type BannedWordMatch } from "@/lib/community-feed/banned-word-match";
import { loadUserAppLanguage } from "@/lib/i18n/load-user-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";

/** 금칙어 검사 지점 — 감사 로그 `after_json.surface` 값. */
export type BannedWordSurface =
  | "community_post"
  | "community_comment"
  | "meeting_feed"
  | "trade_post"
  | "trade_chat"
  | "store_review"
  | "store_review_reply"
  | "profile";

export const CONTENT_FILTER_BLOCKED_CODE = "content_filter_blocked";
export const CONTENT_FILTER_AUDIT_ACTION = "content_filter.blocked";
export const CONTENT_FILTER_REPEAT_AUDIT_ACTION = "content_filter.repeat_review";
/** 24시간 안에 이 횟수 이상 걸리면 관리자 검토 대상으로 1회 기록한다(자동 제재 없음). */
export const CONTENT_FILTER_REPEAT_THRESHOLD = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BannedWordGuardResult =
  | { ok: true }
  | { ok: false; status: 400; code: typeof CONTENT_FILTER_BLOCKED_CODE; error: string };

async function recordViolation(userId: string, surface: BannedWordSurface, match: BannedWordMatch): Promise<void> {
  const sb = getSupabaseServer();
  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: userId,
    target_type: "member",
    target_id: userId,
    action: CONTENT_FILTER_AUDIT_ACTION,
    after_json: { surface, source: match.source, category: match.category },
  });
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await sb
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("target_id", userId)
    .eq("action", CONTENT_FILTER_AUDIT_ACTION)
    .gte("created_at", since);
  if ((count ?? 0) < CONTENT_FILTER_REPEAT_THRESHOLD) return;
  const { count: flagged } = await sb
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("target_id", userId)
    .eq("action", CONTENT_FILTER_REPEAT_AUDIT_ACTION)
    .gte("created_at", since);
  if ((flagged ?? 0) > 0) return;
  await appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "member",
    target_id: userId,
    action: CONTENT_FILTER_REPEAT_AUDIT_ACTION,
    after_json: { count_24h: count ?? 0, last_surface: surface },
  });
}

/**
 * 서버 작성·수정·전송 경로 공통 금칙어 검사.
 * 걸리면 위반을 감사 로그에 남기고(원문 없음) 사용자 언어로 안내 문구를 돌려준다.
 */
export async function guardBannedWords(input: {
  userId: string;
  surface: BannedWordSurface;
  texts: readonly (string | null | undefined)[];
  /** 이미 읽은 운영 목록이 있으면 재조회하지 않는다. */
  operatorWords?: readonly string[];
  acceptLanguage?: string | null;
}): Promise<BannedWordGuardResult> {
  const operatorWords = input.operatorWords ?? (await getCommunityBannedWordsCached());
  const match = matchBannedWords(input.texts, operatorWords);
  if (!match) return { ok: true };

  try {
    await recordViolation(input.userId, input.surface, match);
  } catch (e) {
    console.error("[content-filter] record_failed", { surface: input.surface, error: e instanceof Error ? e.message : String(e) });
  }

  const lang = await loadUserAppLanguage(getSupabaseServer(), input.userId, input.acceptLanguage ?? null).catch(
    () => "ko" as const
  );
  return {
    ok: false,
    status: 400,
    code: CONTENT_FILTER_BLOCKED_CODE,
    error: safeTranslate(lang, "content_filter_blocked_message", {
      fallbackKo: "운영정책에 맞지 않는 표현이 포함되어 있어 등록할 수 없어요. 표현을 고친 뒤 다시 시도해 주세요.",
      fallbackEn: "This contains language that isn't allowed under our community policy. Please edit it and try again.",
    }),
  };
}
