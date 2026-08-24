/**
 * CUT 8 — BANNER_AD Admin writer → store_banner_ad_campaigns only.
 * NOT feed_ad_campaigns / store_banners / my_page_banners / STORE_PAID_AD.
 */

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

export type StoreBannerAdUpdateInput = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string;
  ctaHref?: string;
  sortOrder?: number;
  startAt?: string;
  endAt?: string;
  isActive?: boolean;
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
      ctaHref: String(body.ctaHref ?? body.cta_href ?? "").trim(),
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0) || 0,
      startAt,
      endAt,
      isActive: body.isActive === false || body.is_active === false ? false : true,
    },
  };
}

export function parseStoreBannerAdCampaignUpdateBody(
  rawBody: unknown
):
  | { ok: true; value: StoreBannerAdUpdateInput }
  | { ok: false; error: StoreBannerAdWriterError; forbidden?: string[] } {
  if (!rawBody || typeof rawBody !== "object") return { ok: false, error: "db_error" };
  const body = rawBody as Record<string, unknown>;
  if ("store_id" in body || "storeId" in body || "surface" in body) {
    return { ok: false, error: "forbidden_fields", forbidden: ["surface", "store_id"] };
  }
  const id = String(body.id ?? "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  const value: StoreBannerAdUpdateInput = { id };
  if ("title" in body) {
    value.title =
      body.title == null || String(body.title).trim() === "" ? null : String(body.title).trim();
  }
  if ("subtitle" in body) {
    value.subtitle =
      body.subtitle == null || String(body.subtitle).trim() === ""
        ? null
        : String(body.subtitle).trim();
  }
  if ("imageUrl" in body || "image_url" in body) {
    const imageUrl = String(body.imageUrl ?? body.image_url ?? "").trim();
    if (!imageUrl) return { ok: false, error: "empty_image_url" };
    value.imageUrl = imageUrl;
  }
  if ("ctaHref" in body || "cta_href" in body) {
    value.ctaHref = String(body.ctaHref ?? body.cta_href ?? "").trim();
  }
  if ("sortOrder" in body || "sort_order" in body) {
    value.sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0) || 0;
  }
  if ("startAt" in body || "start_at" in body) {
    const startAt = parseInstant(body.startAt ?? body.start_at);
    if (!startAt) return { ok: false, error: "invalid_start_at" };
    value.startAt = startAt;
  }
  if ("endAt" in body || "end_at" in body) {
    const endAt = parseInstant(body.endAt ?? body.end_at);
    if (!endAt) return { ok: false, error: "invalid_end_at" };
    value.endAt = endAt;
  }
  if ("isActive" in body || "is_active" in body) {
    value.isActive = body.isActive === true || body.is_active === true;
  }
  return { ok: true, value };
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

export async function updateStoreBannerAdCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StoreBannerAdWriterResult<StoreBannerAdCampaignDbRow>> {
  const parsed = parseStoreBannerAdCampaignUpdateBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, forbidden: parsed.forbidden };
  }

  const existing = await loadRow(sb, parsed.value.id);
  if (!existing.ok) return existing;

  const startAt = parsed.value.startAt ?? existing.row.start_at;
  const endAt = parsed.value.endAt ?? existing.row.end_at;
  if (Date.parse(endAt) <= Date.parse(startAt)) return { ok: false, error: "invalid_window" };

  const patch: Record<string, unknown> = {
    start_at: startAt,
    end_at: endAt,
    updated_by_user_id: adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (parsed.value.title !== undefined) patch.title = parsed.value.title;
  if (parsed.value.subtitle !== undefined) patch.subtitle = parsed.value.subtitle;
  if (parsed.value.imageUrl !== undefined) patch.image_url = parsed.value.imageUrl;
  if (parsed.value.ctaHref !== undefined) patch.cta_href = parsed.value.ctaHref;
  if (parsed.value.sortOrder !== undefined) patch.sort_order = parsed.value.sortOrder;
  if (parsed.value.isActive !== undefined) patch.is_active = parsed.value.isActive;

  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .update(patch)
    .eq("id", parsed.value.id)
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    console.error("[updateStoreBannerAdCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

async function loadRow(
  sb: SupabaseClient,
  id: string
): Promise<
  | { ok: true; row: StoreBannerAdCampaignDbRow }
  | { ok: false; error: StoreBannerAdWriterError }
> {
  const campaignId = String(id ?? "").trim();
  if (!campaignId) return { ok: false, error: "missing_id" };
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) {
    console.error("[loadStoreBannerAdRow]", error.message);
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "campaign_not_found" };
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}
