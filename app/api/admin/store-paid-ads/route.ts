import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  createStorePaidAdCampaignAdmin,
  updateStorePaidAdCampaignAdmin,
  type StorePaidAdWriterError,
} from "@/lib/stores/store-paid-ad-campaign-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isStorePaidAdCampaignActive } from "@/lib/stores/store-paid-ad-campaign-authority";

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
  const campaigns = (data ?? []).map((row) => ({
    ...row,
    computed_state: computedState(row as { is_active: boolean; start_at: string; end_at: string }),
  }));
  return NextResponse.json({ ok: true, campaigns, writer: "admin_http" });
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
  return NextResponse.json({ ok: true, campaign: result.row });
}
