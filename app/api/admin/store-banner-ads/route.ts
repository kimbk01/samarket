import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  STORE_BANNER_AD_CAMPAIGN_TABLE,
  type StoreBannerAdCampaignRow,
} from "@/lib/stores/store-banner-ad-campaign-authority";
import { resolveStoreBannerAdVisibility } from "@/lib/stores/store-banner-ad-exposure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function computedState(row: {
  is_active: boolean;
  start_at: string;
  end_at: string;
  image_url: string;
}): "active" | "scheduled" | "expired" | "inactive" | "invalid_creative" {
  if (!String(row.image_url ?? "").trim()) return "invalid_creative";
  if (!row.is_active) return "inactive";
  const now = Date.now();
  const start = Date.parse(row.start_at);
  const end = Date.parse(row.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "inactive";
  if (end <= now) return "expired";
  if (start > now) return "scheduled";
  return "active";
}

function toAuthorityRow(row: {
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
}): StoreBannerAdCampaignRow {
  return {
    id: row.id,
    surface: row.surface as StoreBannerAdCampaignRow["surface"],
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    ctaHref: row.cta_href,
    sortOrder: row.sort_order,
    startAt: row.start_at,
    endAt: row.end_at,
    isActive: row.is_active,
  };
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select(
      "id, surface, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, is_active, created_at, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", campaigns: [] }, { status: 500 });
  }
  const nowMs = Date.now();
  const campaigns = (data ?? []).map((row) => {
    const r = row as {
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
    };
    const visibility = resolveStoreBannerAdVisibility({
      campaign: toAuthorityRow(r),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    return {
      ...r,
      computed_state: computedState(r),
      visibility: {
        visible: visibility.visible,
        blockingReasons: visibility.blockingReasons,
        factors: visibility.factors,
      },
    };
  });
  return NextResponse.json({
    ok: true,
    campaigns,
    writer: "admin_http",
    authority: STORE_BANNER_AD_CAMPAIGN_TABLE,
    surface: "stores_home_hero",
  });
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      canonical: "/admin/delivery-ads/manage",
      api: "/api/admin/delivery-ads",
    },
    { status: 410 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      canonical: "/admin/delivery-ads/manage",
      api: "/api/admin/delivery-ads",
    },
    { status: 410 }
  );
}
