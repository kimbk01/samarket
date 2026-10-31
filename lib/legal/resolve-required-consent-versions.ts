/**
 * Required legal consent versions — CMS published (ko) with STORE_* fallback.
 * CONTRACT: app_legal_documents TEXT is public SSOT; consent gate versions follow
 * published ko `version` strings. Same-version body edits do not change consent.
 * DO NOT invent versions; DO NOT treat dibay-privacy-policy-content as consent SSOT.
 *
 * STORE_* fallback applies only when no published ko row exists. A failed CMS read is NOT
 * "no row": it keeps the last successfully read value, and strict callers fail closed.
 */
import { loadPublishedAppLegalDocumentResult } from "@/lib/legal/load-published-legal-document";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

export type RequiredConsentVersions = {
  termsVersion: string;
  privacyVersion: string;
  source: "cms" | "fallback";
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: RequiredConsentVersions } | null = null;
/** Last successfully read value — survives TTL; used only when a fresh read fails. */
let lastGood: RequiredConsentVersions | null = null;

export class RequiredConsentVersionsUnavailableError extends Error {
  constructor() {
    super("required_consent_versions_unavailable");
    this.name = "RequiredConsentVersionsUnavailableError";
  }
}

export function clearRequiredConsentVersionsCache(): void {
  cache = null;
}

/** Test helper — also forgets the last good read. */
export function resetRequiredConsentVersionsStateForTests(): void {
  cache = null;
  lastGood = null;
}

export function getFallbackRequiredConsentVersions(): RequiredConsentVersions {
  return {
    termsVersion: STORE_TERMS_VERSION,
    privacyVersion: STORE_PRIVACY_VERSION,
    source: "fallback",
  };
}

function versionsFromCms(cmsTermsRaw: unknown, cmsPrivacyRaw: unknown): RequiredConsentVersions {
  const cmsTerms = String(cmsTermsRaw ?? "").trim();
  const cmsPrivacy = String(cmsPrivacyRaw ?? "").trim();
  return {
    termsVersion: cmsTerms || STORE_TERMS_VERSION,
    privacyVersion: cmsPrivacy || STORE_PRIVACY_VERSION,
    source: cmsTerms && cmsPrivacy ? "cms" : "fallback",
  };
}

/**
 * 순서 2 (docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md): 버전 번호만 1회.
 * `required_consent_versions` 는 아래 기존 경로(종류별 최신 20행 → 적용 시각 지난 것 → `pickCurrentPublishedLegalDoc`)와
 * 같은 규칙으로 고른 문서의 version 만 돌려준다 — 본문(약관·개인정보 약 11KB)을 읽지 않는다.
 * null = 호출 실패 → 기존 경로.
 */
async function readRequiredConsentVersionsViaRpc(): Promise<RequiredConsentVersions | null> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb || typeof (sb as { rpc?: unknown }).rpc !== "function") return null;
  try {
    const { data, error } = await (sb as any).rpc("required_consent_versions", { p_locale: "ko" });
    if (error || !data || typeof data !== "object") return null;
    const row = data as { terms?: unknown; privacy?: unknown };
    return versionsFromCms(row.terms, row.privacy);
  } catch {
    return null;
  }
}

async function readRequiredConsentVersions(): Promise<RequiredConsentVersions | null> {
  const viaRpc = await readRequiredConsentVersionsViaRpc();
  if (viaRpc) return viaRpc;
  const [terms, privacy] = await Promise.all([
    loadPublishedAppLegalDocumentResult("terms", "ko"),
    loadPublishedAppLegalDocumentResult("privacy", "ko"),
  ]);
  if (!terms.ok || !privacy.ok) return null;
  return versionsFromCms(terms.row?.version, privacy.row?.version);
}

/**
 * Strict — throws `RequiredConsentVersionsUnavailableError` when the CMS cannot be read and no
 * value was ever read in this process. Use where a wrong answer would grant access.
 */
export async function resolveRequiredConsentVersionsStrict(): Promise<RequiredConsentVersions> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  let value: RequiredConsentVersions | null = null;
  try {
    value = await readRequiredConsentVersions();
  } catch {
    value = null;
  }
  if (value) {
    cache = { at: now, value };
    lastGood = value;
    return value;
  }
  if (lastGood) return lastGood;
  throw new RequiredConsentVersionsUnavailableError();
}

/**
 * Lenient — same as strict, but when nothing was ever read it returns the STORE_* fallback
 * (pre-existing behavior for display / redirect surfaces that must not 500).
 */
export async function resolveRequiredConsentVersions(): Promise<RequiredConsentVersions> {
  try {
    return await resolveRequiredConsentVersionsStrict();
  } catch {
    return getFallbackRequiredConsentVersions();
  }
}
