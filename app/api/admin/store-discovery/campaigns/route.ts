import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { loadAdminStoreDiscoveryCampaignMonitor } from "@/lib/stores/admin-store-discovery-control";
import {
  createStoreDiscoveryCampaignAdmin,
  updateStoreDiscoveryCampaignAdmin,
  type StoreDiscoveryCampaignWriterError,
} from "@/lib/stores/store-discovery-campaign-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function writerErrorStatus(error: StoreDiscoveryCampaignWriterError): number {
  switch (error) {
    case "forbidden_fields":
    case "store_id_not_allowed_on_update":
    case "missing_store_id":
    case "missing_id":
    case "invalid_campaign_type":
    case "empty_title":
    case "invalid_start_at":
    case "invalid_end_at":
    case "invalid_window":
    case "expected_updated_at_required":
      return 400;
    case "stale_updated_at":
      return 409;
    case "store_not_found":
    case "campaign_not_found":
      return 404;
    case "store_not_eligible":
      return 422;
    default:
      return 500;
  }
}

/** Admin Discovery Control — campaign monitor READ + W Campaign HTTP Writer. */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const result = await loadAdminStoreDiscoveryCampaignMonitor(sb);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "campaigns_load_error",
        now: result.now,
        campaigns: [],
      },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    now: result.now,
    campaigns: result.campaigns,
    writer: "admin_http",
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const userId = gate.actor.userId;

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

  const result = await createStoreDiscoveryCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }

  await appendAdminRouteAudit(gate.sb, req, {
    actorId: userId,
    targetType: "store_discovery_campaign",
    targetId: String((result.row as { id?: unknown } | null)?.id ?? ""),
    action: "store_discovery_campaign.create",
    after: (body && typeof body === "object" ? body : null) as Record<string, unknown> | null,
  });

  return NextResponse.json({ ok: true, campaign: result.row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const userId = gate.actor.userId;

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

  const result = await updateStoreDiscoveryCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }

  await appendAdminRouteAudit(gate.sb, req, {
    actorId: userId,
    targetType: "store_discovery_campaign",
    targetId: String((result.row as { id?: unknown } | null)?.id ?? ""),
    action: "store_discovery_campaign.update",
    after: (body && typeof body === "object" ? body : null) as Record<string, unknown> | null,
  });

  return NextResponse.json({ ok: true, campaign: result.row });
}
