import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  createStorePaidAdCampaignAdmin,
  updateStorePaidAdCampaignAdmin,
  type StorePaidAdWriterError,
} from "@/lib/stores/store-paid-ad-campaign-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  isStorePaidAdCampaignActive,
  type StorePaidAdCampaignRow,
  type StorePaidAdPlacement,
} from "@/lib/stores/store-paid-ad-campaign-authority";
import {
  resolveHomeRestPaidSurfaceAllowed,
  resolveStorePaidAdCampaignExposure,
} from "@/lib/stores/store-paid-ad-exposure";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { homePaidAdInsertionPolicyEnabled } from "@/lib/stores/composition/stores-composition-insertion-live";
import { listHomeShelfProductDbRows } from "@/lib/stores/product/stores-home-shelf-product-db";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function writerErrorStatus(error: StorePaidAdWriterError): number {
  switch (error) {
    case "forbidden_fields":
    case "missing_store_id":
    case "missing_id":
    case "invalid_placement":
    case "empty_title":
    case "empty_headline":
    case "invalid_start_at":
    case "invalid_end_at":
    case "invalid_window":
      return 400;
    case "store_not_found":
    case "campaign_not_found":
      return 404;
    case "store_not_eligible":
      return 422;
    default:
      return 500;
  }
}

function computedState(row: {
  is_active: boolean;
  start_at: string;
  end_at: string;
}): "active" | "upcoming" | "expired" | "inactive" {
  if (!row.is_active) return "inactive";
  const now = Date.now();
  const start = Date.parse(row.start_at);
  const end = Date.parse(row.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "inactive";
  if (end <= now) return "expired";
  if (start > now) return "upcoming";
  if (
    isStorePaidAdCampaignActive(
      {
        isActive: true,
        startAt: row.start_at,
        endAt: row.end_at,
      },
      now
    )
  ) {
    return "active";
  }
  return "inactive";
}

function toAuthorityRow(row: {
  id: string;
  store_id: string;
  placement: string;
  title: string;
  headline: string;
  body_copy: string | null;
  image_url: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
}): StorePaidAdCampaignRow {
  return {
    id: row.id,
    storeId: row.store_id,
    placement: row.placement as StorePaidAdPlacement,
    title: row.title,
    headline: row.headline,
    bodyCopy: row.body_copy,
    imageUrl: row.image_url,
    startAt: row.start_at,
    endAt: row.end_at,
    isActive: row.is_active,
  };
}

/** CUT 8 — Admin diagnostic surfaceAllowed from canonical policy (not a new formula). */
async function loadAdminPaidSurfaceAllowed(
  sb: SupabaseClient,
  placement: StorePaidAdPlacement
): Promise<boolean> {
  if (placement === "stores_home") {
    const [policy, shelves] = await Promise.all([
      loadRuntimeCompositionPolicy(sb, "home"),
      listHomeShelfProductDbRows(sb),
    ]);
    const rest =
      shelves.find((s) => s.shelf_id === "rest_stores") ??
      shelves.find((s) => s.slot === "slot6RestStores");
    return resolveHomeRestPaidSurfaceAllowed({
      restShelfAdIntegration: rest?.ad_integration,
      homePaidAdInsertionEnabled: homePaidAdInsertionPolicyEnabled(policy.rows),
    });
  }
  try {
    const dbRows = await listBrowseScopePolicyRows(sb);
    const mapped = dbRows.map(mapBrowseScopeDbRow);
    const primaries = mapped.filter((r) => !r.subSlug);
    if (primaries.length === 0) return false;
    return primaries.some((primaryRow) => {
      const resolved = resolveBrowseScopePolicy({
        primarySlug: primaryRow.primarySlug,
        subSlug: null,
        primaryRow,
        subRow: null,
      });
      return resolved.adEnabled === true;
    });
  } catch {
    return false;
  }
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
    .from("store_paid_ad_campaigns")
    .select(
      "id, store_id, placement, title, headline, body_copy, image_url, start_at, end_at, is_active, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", campaigns: [] }, { status: 500 });
  }
  const nowMs = Date.now();
  const [homeSurfaceAllowed, browseSurfaceAllowed] = await Promise.all([
    loadAdminPaidSurfaceAllowed(sb, "stores_home"),
    loadAdminPaidSurfaceAllowed(sb, "stores_browse"),
  ]);
  const campaigns = (data ?? []).map((row) => {
    const r = row as {
      id: string;
      store_id: string;
      placement: string;
      title: string;
      headline: string;
      body_copy: string | null;
      image_url: string | null;
      start_at: string;
      end_at: string;
      is_active: boolean;
    };
    const placement = (r.placement === "stores_browse" ? "stores_browse" : "stores_home") as StorePaidAdPlacement;
    const surfaceAllowed =
      placement === "stores_browse" ? browseSurfaceAllowed : homeSurfaceAllowed;
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: toAuthorityRow(r),
      nowMs,
      targetPlacement: placement,
      surfaceAllowed,
      storeEligible: true,
      /** Admin list diagnostic — taxonomy match is scope-local at customer runtime. */
      taxonomyScopeMatched: true,
    });
    return {
      ...r,
      computed_state: computedState(r),
      exposure: {
        actualExposureEligible: exposure.actualExposureEligible,
        blockingReasons: exposure.blockingReasons,
        factors: exposure.factors,
        surfaceAllowed,
        placement,
      },
    };
  });
  return NextResponse.json({
    ok: true,
    campaigns,
    writer: "admin_http",
    surfaces: { home: homeSurfaceAllowed, browse: browseSurfaceAllowed },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await createStorePaidAdCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }
  invalidateStoresBrowseMemoryCache();
  return NextResponse.json({ ok: true, campaign: result.row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await updateStorePaidAdCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }
  invalidateStoresBrowseMemoryCache();
  return NextResponse.json({ ok: true, campaign: result.row });
}
