/**
 * 혜택·이벤트 수신 동의 — 서버 읽기·쓰기 단일 경로 (Owner 지시 2026-11-03).
 *
 * 정본 = `user_notification_settings.marketing_enabled` + 동의 시각·출처·문서 버전 — 이 파일만 쓴다.
 * 옛 열 `user_settings.marketing_push_enabled` 는 읽지도 쓰지도 않는다(재감사 D-8 · 열만 남김).
 * 문구 정본 = 어드민 `/admin/app/legal` 의 `marketing` 문서(없으면 기본 문구).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublishedAppLegalDocument } from "@/lib/legal/load-published-legal-document";
import {
  MARKETING_CONSENT_DEFAULT,
  MARKETING_CONSENT_DEFAULT_VERSION,
} from "@/lib/legal/marketing-consent-default";

/** admin_created = 어드민이 만든 회원·직원 계정(동의 받은 적 없음 → OFF · 회원이 내정보에서 켬). */
export type MarketingConsentSource = "signup" | "existing_member_default" | "settings" | "admin_created";

export type MarketingConsentDoc = {
  /** 동의 기록에 남기는 버전 = 게시 중인 한국어 문서 버전 (약관과 같은 규칙). */
  version: string;
  title: { ko: string; en: string };
  summary: { ko: string; en: string };
};

export type MemberMarketingConsent = {
  enabled: boolean;
  at: string | null;
  source: MarketingConsentSource | null;
  version: string | null;
};

function firstParagraph(body: string): string {
  return String(body ?? "").split(/\n\s*\n/)[0]?.trim() ?? "";
}

export async function loadMarketingConsentDoc(): Promise<MarketingConsentDoc> {
  const [ko, en] = await Promise.all([
    loadPublishedAppLegalDocument("marketing", "ko").catch(() => null),
    loadPublishedAppLegalDocument("marketing", "en").catch(() => null),
  ]);
  const koTitle = ko?.title?.trim() || MARKETING_CONSENT_DEFAULT.ko.title;
  const enTitle = en?.title?.trim() || MARKETING_CONSENT_DEFAULT.en.title;
  return {
    version: ko?.version?.trim() || MARKETING_CONSENT_DEFAULT_VERSION,
    title: { ko: koTitle, en: enTitle },
    summary: {
      ko: firstParagraph(ko?.body || MARKETING_CONSENT_DEFAULT.ko.body),
      en: firstParagraph(en?.body || MARKETING_CONSENT_DEFAULT.en.body),
    },
  };
}

function isSource(v: unknown): v is MarketingConsentSource {
  return v === "signup" || v === "existing_member_default" || v === "settings" || v === "admin_created";
}

/**
 * 동의 기록 읽기. `consent: null` = 행 없음(한 번도 묻지 않음). 조회 오류는 `ok:false` 로 따로 돌려준다 —
 * 오류를 「기록 없음」으로 보면 가입 화면이 기존 동의를 미체크로 덮어쓸 수 있다(재감사 D-4).
 */
export async function readMemberMarketingConsent(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; consent: MemberMarketingConsent | null } | { ok: false }> {
  const { data, error } = await sb
    .from("user_notification_settings")
    .select("marketing_enabled, marketing_consent_at, marketing_consent_source, marketing_consent_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false };
  if (!data) return { ok: true, consent: null };
  const row = data as Record<string, unknown>;
  return {
    ok: true,
    consent: {
      enabled: row.marketing_enabled === true,
      at: typeof row.marketing_consent_at === "string" ? row.marketing_consent_at : null,
      source: isSource(row.marketing_consent_source) ? row.marketing_consent_source : null,
      version: typeof row.marketing_consent_version === "string" ? row.marketing_consent_version : null,
    },
  };
}

/** 동의·거부 저장 — 정본 1곳에 값·시각·출처·버전을 한 번에(upsert 1회). 실패 시 `{ ok:false }` (호출부가 화면 처리). */
export async function writeMemberMarketingConsent(
  sb: SupabaseClient,
  userId: string,
  input: { enabled: boolean; source: MarketingConsentSource; version: string | null }
): Promise<{ ok: true; at: string } | { ok: false; error: string }> {
  const at = new Date().toISOString();
  const { error } = await sb.from("user_notification_settings").upsert(
    {
      user_id: userId,
      marketing_enabled: input.enabled,
      marketing_consent_at: at,
      marketing_consent_source: input.source,
      marketing_consent_version: input.version,
      updated_at: at,
    },
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, error: error.message || "marketing_consent_save_failed" };
  return { ok: true, at };
}
