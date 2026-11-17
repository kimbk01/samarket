/**
 * v3 ④ (앱 진입 어드민 §4 「누르면 이동」) — 저장 전 이동 대상 확인(서버 전용).
 * 공개 판정은 앱 조회와 같은 함수(`loadPopupEventDestinationLookups` · `loadPopupEntityDestinationLookups` ·
 * `validatePlatformPopupCta`) — 여기서 따로 판정하지 않는다. 제목은 화면 확인용으로만 읽는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlatformPopupCta, validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import {
  loadPopupEntityDestinationLookups,
  loadPopupEventDestinationLookups,
  popupCtaInputEntityKey,
  popupCtaInputEventId,
  resolvePopupCandidateCtaLookup,
} from "@/lib/platform-popup/popup-event-destination-availability";

export type PlatformPopupAdminDestinationLookup = {
  /** 구조 검사(형식) 통과 */
  valid: boolean;
  /** 앱이 열 수 있음(존재 · 공개 · 기간 안) */
  available: boolean;
  /** 실패 코드(`cta.ts` 오류) */
  error: string | null;
  href: string | null;
  kind: "event" | "trade_listing" | "community_post" | "store" | "path" | "external" | null;
  title: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadTitle(
  sb: SupabaseClient,
  kind: PlatformPopupAdminDestinationLookup["kind"],
  target: string
): Promise<string | null> {
  if (!target) return null;
  const pick = (row: unknown, col: string) => {
    const v = row && typeof row === "object" ? (row as Record<string, unknown>)[col] : null;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  if (kind === "store") {
    const { data } = await sb.from("stores").select("store_name").eq("slug", target).maybeSingle();
    return pick(data, "store_name");
  }
  if (!UUID_RE.test(target)) return null;
  if (kind === "event") {
    const { data } = await sb.from("platform_events").select("title").eq("id", target).maybeSingle();
    return pick(data, "title");
  }
  if (kind === "trade_listing") {
    const { data } = await sb.from("posts").select("title").eq("id", target).maybeSingle();
    return pick(data, "title");
  }
  if (kind === "community_post") {
    const { data } = await sb.from("community_posts").select("title").eq("id", target).maybeSingle();
    return pick(data, "title");
  }
  return null;
}

export async function lookupPlatformPopupAdminDestination(
  sb: SupabaseClient,
  input: { ctaType: string; ctaTarget: string; externalUrl: string }
): Promise<PlatformPopupAdminDestinationLookup> {
  const cta = { ctaType: input.ctaType, ctaTarget: input.ctaTarget, externalUrl: input.externalUrl || null };
  const normalized = normalizePlatformPopupCta(cta);
  if (!normalized.ok) {
    return { valid: false, available: false, error: normalized.error, href: null, kind: null, title: null };
  }
  const eventId = popupCtaInputEventId(cta);
  const entityKey = popupCtaInputEntityKey(cta);
  const [eventLookups, entityLookups] = await Promise.all([
    loadPopupEventDestinationLookups(sb, eventId ? [eventId] : []),
    loadPopupEntityDestinationLookups(sb, entityKey ? [entityKey] : []),
  ]);
  const lookup = resolvePopupCandidateCtaLookup(cta, eventLookups, entityLookups);
  const checked = validatePlatformPopupCta(cta, lookup);
  let kind: PlatformPopupAdminDestinationLookup["kind"] = normalized.value.ctaType === "external_url" ? "external" : "path";
  let target = "";
  if (eventId) {
    kind = "event";
    target = eventId;
  } else if (entityKey) {
    const sep = entityKey.indexOf(":");
    kind = entityKey.slice(0, sep) as "trade_listing" | "community_post" | "store";
    target = entityKey.slice(sep + 1);
  }
  const title = kind === "external" || kind === "path" ? null : await loadTitle(sb, kind, target);
  return {
    valid: true,
    available: checked.ok,
    error: checked.ok ? null : checked.error,
    href: normalized.value.href,
    kind,
    title,
  };
}
