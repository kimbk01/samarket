/**
 * CUT 8 — BANNER_AD Admin writer → store_banner_ad_campaigns only.
 * NOT feed_ad_campaigns / store_banners / my_page_banners / STORE_PAID_AD.
 */

import { validateDeliveryFirstPartyBannerDestination } from "@/lib/destination/delivery-banner-destination";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_BANNER_AD_CAMPAIGN_TABLE,
  isStoreBannerAdSurface,
  type StoreBannerAdSurface,
} from "@/lib/stores/store-banner-ad-campaign-authority";

export type StoreBannerAdCampaignDbRow = {
  id: string;
  surface: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  cta_href: string;
  sort_order: number;
  start_at: string;
  end_at: string;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreBannerAdWriterError =
  | "forbidden_fields"
  | "missing_id"
  | "invalid_surface"
  | "empty_image_url"
  | "invalid_cta_href"
  | "invalid_start_at"
  | "invalid_end_at"
  | "invalid_window"
  | "campaign_not_found"
  | "db_error";

export type StoreBannerAdWriterResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: StoreBannerAdWriterError; forbidden?: string[] };

const SELECT_COLS =
  "id, surface, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, is_active, created_by_user_id, updated_by_user_id, created_at, updated_at";

const FORBIDDEN_CREATE = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by_user_id",
  "updated_by_user_id",
]);

function mapRow(raw: Record<string, unknown>): StoreBannerAdCampaignDbRow | null {
  const id = String(raw.id ?? "").trim();
  const surface = String(raw.surface ?? "").trim();
  const imageUrl = String(raw.image_url ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !surface || !imageUrl || !startAt || !endAt) return null;
  return {
    id,
    surface,
    title: raw.title == null ? null : String(raw.title),
    subtitle: raw.subtitle == null ? null : String(raw.subtitle),
    image_url: imageUrl,
    cta_href: String(raw.cta_href ?? ""),
    sort_order: Number(raw.sort_order ?? 0) || 0,
    start_at: startAt,
    end_at: endAt,
    is_active: raw.is_active === true,
    created_by_user_id:
      raw.created_by_user_id == null ? null : String(raw.created_by_user_id).trim() || null,
    updated_by_user_id:
      raw.updated_by_user_id == null ? null : String(raw.updated_by_user_id).trim() || null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

function parseInstant(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export type StoreBannerAdCreateInput = {
  surface: StoreBannerAdSurface;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  ctaHref: string;
  sortOrder: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
};


export function parseStoreBannerAdCampaignCreateBody(
  rawBody: unknown
):
  | { ok: true; value: StoreBannerAdCreateInput }
  | { ok: false; error: StoreBannerAdWriterError; forbidden?: string[] } {
  if (!rawBody || typeof rawBody !== "object") return { ok: false, error: "db_error" };
  const body = rawBody as Record<string, unknown>;
  const forbidden = Object.keys(body).filter((k) => FORBIDDEN_CREATE.has(k));
  if (forbidden.length) return { ok: false, error: "forbidden_fields", forbidden };

  const surfaceRaw = String(body.surface ?? "stores_home_hero").trim();
  if (!isStoreBannerAdSurface(surfaceRaw)) return { ok: false, error: "invalid_surface" };
  const imageUrl = String(body.imageUrl ?? body.image_url ?? "").trim();
  if (!imageUrl) return { ok: false, error: "empty_image_url" };
  const startAt = parseInstant(body.startAt ?? body.start_at);
  if (!startAt) return { ok: false, error: "invalid_start_at" };
  const endAt = parseInstant(body.endAt ?? body.end_at);
  if (!endAt) return { ok: false, error: "invalid_end_at" };
  if (Date.parse(endAt) <= Date.parse(startAt)) return { ok: false, error: "invalid_window" };

  // DS-6 · C-2 (2026-11-04): 이 표의 배너는 매장 칸이 없다 → 매장 없는 자체 배너 규칙(이벤트·배달 안 화면).
  // 외부 https 는 저장 거부 — 예전에는 저장은 되고 노출 단계(`isDeliveryBannerDestinationReady`)에서 0 이었다.
  // 빈칸(링크 없음)은 예전대로 받는다(이 쓰기 경로는 라우트가 410 으로 막혀 있고 기존 계약 시험이 빈칸 저장을 본다).
  const rawCta = String(body.ctaHref ?? body.cta_href ?? "").trim();
  const cta = rawCta
    ? validateDeliveryFirstPartyBannerDestination({ ctaHref: rawCta, storeSlug: null })
    : ({ ok: true, href: "" } as const);
  if (!cta.ok) return { ok: false, error: "invalid_cta_href" };

  const titleRaw = body.title;
  const subtitleRaw = body.subtitle;
  return {
    ok: true,
    value: {
      surface: surfaceRaw,
      title: titleRaw == null || String(titleRaw).trim() === "" ? null : String(titleRaw).trim(),
      subtitle:
        subtitleRaw == null || String(subtitleRaw).trim() === ""
          ? null
          : String(subtitleRaw).trim(),
      imageUrl,
      ctaHref: cta.href,
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0) || 0,
      startAt,
      endAt,
      isActive: body.isActive === false || body.is_active === false ? false : true,
    },
  };
}

export async function createStoreBannerAdCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StoreBannerAdWriterResult<StoreBannerAdCampaignDbRow>> {
  const parsed = parseStoreBannerAdCampaignCreateBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, forbidden: parsed.forbidden };
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .insert({
      surface: parsed.value.surface,
      title: parsed.value.title,
      subtitle: parsed.value.subtitle,
      image_url: parsed.value.imageUrl,
      cta_href: parsed.value.ctaHref,
      sort_order: parsed.value.sortOrder,
      start_at: parsed.value.startAt,
      end_at: parsed.value.endAt,
      is_active: parsed.value.isActive,
      created_by_user_id: adminUserId,
      updated_by_user_id: adminUserId,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    console.error("[createStoreBannerAdCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

/*
 * DS-6 (2026-11-04): `updateStoreBannerAdCampaignAdmin` · `parseStoreBannerAdCampaignUpdateBody` 는 호출처 0 이라 지웠다
 * (grep: 라우트·화면 호출 0 · 시험만 사용). 행을 읽던 내부 함수 `loadRow` 도 같이 지웠다.
 */
